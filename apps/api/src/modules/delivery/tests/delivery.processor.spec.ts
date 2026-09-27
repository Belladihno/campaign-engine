import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { SseService } from '../../../shared/sse/sse.service.js';
import type { DeliveryJobPayload } from '../../campaigns/campaigns.service.js';
import { Campaign } from '../../campaigns/entities/campaign.entity.js';
import { Contact } from '../../campaigns/entities/contact.entity.js';
import { CampaignStatus } from '../../campaigns/enums/campaign-status.enum.js';
import { AfricasTalkingService } from '../delivery.service.js';
import { DeliveryProcessor } from '../delivery.processor.js';

// BullMQ itself is never touched — the processor is driven directly with
// stub jobs.
describe('DeliveryProcessor', () => {
  let processor: DeliveryProcessor;

  const campaign = {
    id: faker.string.uuid(),
    workspaceId: faker.string.uuid(),
    message: 'Hello from Campaign Engine',
    status: CampaignStatus.PENDING,
  };
  const manager = {
    findOne: vi.fn(async () => ({ ...campaign })),
    save: vi.fn(async (_cls: unknown, value: Record<string, unknown>) => value),
  };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  const campaigns = { findOne: vi.fn(), save: vi.fn() };
  const contacts = { find: vi.fn(), save: vi.fn(), count: vi.fn() };
  const sms = { sendSms: vi.fn() };
  const sse = { emit: vi.fn() };

  function job(): Job<DeliveryJobPayload> {
    return {
      data: { campaignId: campaign.id },
      opts: { attempts: 3 },
      attemptsMade: 1,
    } as Job<DeliveryJobPayload>;
  }

  function queuedContact(phone?: string) {
    return {
      id: faker.string.uuid(),
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      phone: phone ?? `+234801${faker.string.numeric(7)}`,
      status: 'QUEUED',
      atMessageId: null,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.findOne.mockImplementation(async () => ({ ...campaign }));
    campaigns.findOne.mockImplementation(async () => ({ ...campaign }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryProcessor,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Campaign), useValue: campaigns },
        { provide: getRepositoryToken(Contact), useValue: contacts },
        { provide: AfricasTalkingService, useValue: sms },
        { provide: SseService, useValue: sse },
      ],
    }).compile();
    processor = module.get<DeliveryProcessor>(DeliveryProcessor);
  });

  it('locks the campaign row before transitioning to PROCESSING', async () => {
    contacts.find.mockResolvedValue([]);
    contacts.count.mockResolvedValue(0);
    campaigns.save.mockImplementation(async (c: unknown) => c);

    await processor.process(job());

    expect(manager.findOne).toHaveBeenCalledWith(
      Campaign,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      Campaign,
      expect.objectContaining({ status: CampaignStatus.PROCESSING }),
    );
  });

  it('ignores jobs for non-PENDING campaigns (duplicate delivery)', async () => {
    manager.findOne.mockResolvedValue({
      ...campaign,
      status: CampaignStatus.SENT,
    });

    await processor.process(job());

    expect(contacts.find).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('only sends to QUEUED contacts on retry (skips SENT)', async () => {
    const queued = queuedContact();
    contacts.find.mockResolvedValue([queued]);
    sms.sendSms.mockResolvedValue({ messageId: 'ATX1' });
    contacts.count.mockImplementation(async (opts: {
      where: { status: unknown };
    }) => (opts.where.status === 'FAILED' ? 0 : 1));
    campaigns.save.mockImplementation(async (c: unknown) => c);

    await processor.process(job());

    expect(contacts.find).toHaveBeenCalledWith({
      where: { campaignId: campaign.id, status: 'QUEUED' },
      order: { createdAt: 'ASC' },
    });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledWith(queued.phone, campaign.message);
  });

  it('sets PARTIALLY_SENT and emits per-contact SSE on mixed outcome', async () => {
    const [ok, bad] = [queuedContact(), queuedContact()];
    contacts.find.mockResolvedValue([ok, bad]);
    sms.sendSms.mockResolvedValueOnce({ messageId: 'ATX1' });
    sms.sendSms.mockRejectedValueOnce(new Error('rejected'));
    contacts.count.mockImplementation(async (opts: {
      where: { status: unknown };
    }) => (opts.where.status === 'FAILED' ? 1 : 1));
    campaigns.save.mockImplementation(async (c: unknown) => c);

    await processor.process(job());

    expect(campaigns.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: CampaignStatus.PARTIALLY_SENT }),
    );
    const contactEvents = sse.emit.mock.calls.filter(
      (call) => call[1] === 'contact_updated',
    );
    expect(contactEvents).toHaveLength(2);
    expect(sse.emit).toHaveBeenCalledWith(
      campaign.workspaceId,
      'campaign_updated',
      expect.objectContaining({ status: CampaignStatus.PARTIALLY_SENT }),
    );
  });

  it('sets FAILED when every contact fails', async () => {
    contacts.find.mockResolvedValue([queuedContact(), queuedContact()]);
    sms.sendSms.mockRejectedValue(new Error('rejected'));
    contacts.count.mockImplementation(async (opts: {
      where: { status: unknown };
    }) => (opts.where.status === 'FAILED' ? 2 : 0));
    campaigns.save.mockImplementation(async (c: unknown) => c);

    await processor.process(job());

    expect(campaigns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CampaignStatus.FAILED,
        sentCount: 0,
        failedCount: 2,
      }),
    );
  });

  it('finalizes on exhausted retries but ignores mid-retry failures', async () => {
    campaigns.save.mockImplementation(async (c: unknown) => c);
    contacts.count.mockImplementation(async (opts: {
      where: { status: unknown };
    }) => (opts.where.status === 'FAILED' ? 1 : 0));

    const midRetry = job();
    midRetry.attemptsMade = 1;
    await processor.onFailed(midRetry);
    expect(campaigns.save).not.toHaveBeenCalled();

    const exhausted = job();
    exhausted.attemptsMade = 3;
    await processor.onFailed(exhausted);
    expect(campaigns.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: CampaignStatus.FAILED }),
    );
  });
});
