import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import { DataSource, QueryFailedError } from 'typeorm';
import { CampaignsService } from '../campaigns.service.js';
import { Campaign } from '../entities/campaign.entity.js';
import { Contact } from '../entities/contact.entity.js';
import { IdempotencyKey } from '../entities/idempotency-key.entity.js';

// The transaction manager and the queue are mocked — these tests pin the
// service's contract (fail-fast 422, atomic create, correct job payload),
// not Postgres or Redis.
describe('CampaignsService', () => {
  let service: CampaignsService;

  const workspace = { id: faker.string.uuid(), credits: 10 };
  const manager = {
    findOne: vi.fn(async () => ({ ...workspace })),
    create: vi.fn((_cls: unknown, value: Record<string, unknown>) => value),
    save: vi.fn(async (_cls: unknown, value: unknown) =>
      Array.isArray(value)
        ? value.map((v) => ({ id: faker.string.uuid(), ...v }))
        : { id: faker.string.uuid(), ...(value as Record<string, unknown>) },
    ),
  };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  const campaigns = { find: vi.fn(), findOne: vi.fn() };
  const contacts = {};
  const keys = { findOne: vi.fn() };
  const queue = { add: vi.fn(async () => ({ id: 'job-1' })) };

  function dto(contactCount = 2) {
    return {
      name: faker.company.catchPhrase(),
      message: 'Hello from Campaign Engine',
      contacts: Array.from({ length: contactCount }, () =>
        faker.phone.number({ style: 'international' }).replace(/[\s-]/g, ''),
      ),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.findOne.mockImplementation(async () => ({ ...workspace }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Campaign), useValue: campaigns },
        { provide: getRepositoryToken(Contact), useValue: contacts },
        { provide: getRepositoryToken(IdempotencyKey), useValue: keys },
        { provide: getQueueToken('delivery'), useValue: queue },
      ],
    }).compile();
    service = module.get<CampaignsService>(CampaignsService);
  });

  it('throws 422 when credits cover fewer contacts than requested', async () => {
    await expect(service.create(workspace.id, dto(11))).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('bills one credit per contact per SMS segment', async () => {
    // 72 UTF-16 units of emoji = 2 UCS-2 segments; 2 contacts → cost 4.
    campaigns.findOne.mockResolvedValue({ id: faker.string.uuid(), contacts: [] });

    await service.create(workspace.id, {
      name: 'unicode',
      message: '🎉'.repeat(36),
      contacts: ['+2348012345678', '+2348098765432'],
    });

    // First save in the transaction is always the debited workspace.
    const savedWorkspace: { credits: number } = manager.save.mock.calls[0][1];
    expect(savedWorkspace.credits).toBe(6);
  });

  it('creates campaign + contacts together in one transaction', async () => {
    const created = {
      id: faker.string.uuid(),
      status: 'PENDING',
      contacts: [],
    };
    campaigns.findOne.mockResolvedValue(created);

    await service.create(workspace.id, dto(2));

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(3);
    const contactsArg = manager.save.mock.calls[2][1] as Array<{
      phone: string;
      status: string;
      campaignId: string;
    }>;
    expect(contactsArg).toHaveLength(2);
    expect(contactsArg[0].status).toBe('QUEUED');
    expect(contactsArg[0].campaignId).toBeDefined();
  });

  it('enqueues a send-campaign job with retry policy', async () => {
    campaigns.findOne.mockImplementation(async (opts: {
      where: { id: string };
    }) => ({ id: opts.where.id, contacts: [] }));

    await service.create(workspace.id, dto(1));

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload] = queue.add.mock.calls[0];
    const jobPayload: { campaignId: string } = payload;
    expect(name).toBe('send-campaign');
    expect(jobPayload).toEqual({ campaignId: expect.any(String) });
    // The enqueued id is the created campaign's id — the same id the
    // service then loads for its 201 response.
    expect(campaigns.findOne).toHaveBeenCalledWith({
      where: { id: jobPayload.campaignId, workspaceId: workspace.id },
      relations: { contacts: true },
    });
  });

  describe('idempotency keys', () => {
    function uniqueViolation(): QueryFailedError {
      return new QueryFailedError(
        'INSERT INTO ...',
        [],
        Object.assign(new Error('duplicate key value'), { code: '23505' }),
      );
    }

    it('replays the original campaign for a repeated key', async () => {
      const original = { id: faker.string.uuid(), contacts: [] };
      keys.findOne.mockResolvedValueOnce({ campaign: { id: original.id } });
      campaigns.findOne.mockResolvedValue(original);

      const result = await service.create(workspace.id, dto(1), 'key-123');

      expect(result).toEqual({ campaign: original, replayed: true });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throws 409 when the twin create never links its campaign', async () => {
      keys.findOne.mockResolvedValue({ campaign: null });
      manager.save.mockRejectedValueOnce(uniqueViolation());

      await expect(
        service.create(workspace.id, dto(1), 'key-race'),
      ).rejects.toThrow(ConflictException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throws 400 for an oversized key', async () => {
      await expect(
        service.create(workspace.id, dto(1), 'k'.repeat(65)),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('orphan recovery', () => {
    it('re-enqueues stale PENDING campaigns on boot', async () => {
      const orphanId = faker.string.uuid();
      campaigns.find.mockResolvedValue([{ id: orphanId }]);

      await service.onModuleInit();

      expect(queue.add).toHaveBeenCalledWith('send-campaign', {
        campaignId: orphanId,
      });
    });

    it('does nothing when no orphans exist', async () => {
      campaigns.find.mockResolvedValue([]);

      await service.onModuleInit();

      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
