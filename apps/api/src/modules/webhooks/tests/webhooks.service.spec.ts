import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import { createHmac } from 'node:crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { SseService } from '../../../shared/sse/sse.service.js';
import { Contact } from '../../campaigns/entities/contact.entity.js';
import { Payment } from '../../payments/entities/payment.entity.js';
import { Workspace } from '../../workspaces/entities/workspace.entity.js';
import { ProcessedWebhookEvent } from '../entities/processed-webhook-event.entity.js';
import { WebhooksService } from '../webhooks.service.js';

const SECRET = 'whsec_test';

// Every HMAC here is real — a spoofed signature must fail closed.
describe('WebhooksService (Paystack)', () => {
  let service: WebhooksService;

  const events = {
    create: vi.fn((value: Record<string, unknown>) => value),
    save: vi.fn(async (value: Record<string, unknown>) => ({
      id: faker.string.uuid(),
      ...value,
    })),
  };
  const payments = { findOne: vi.fn() };
  const workspaces = { findOne: vi.fn() };
  const contacts = { findOne: vi.fn(), update: vi.fn() };
  const manager = { update: vi.fn(), increment: vi.fn() };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  const sse = { emit: vi.fn() };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return SECRET;
      if (key === 'AT_API_KEY') return 'at_test_key';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  function signedBody(payload: Record<string, unknown>): {
    raw: Buffer;
    signature: string;
  } {
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
    return { raw, signature };
  }

  function uniqueViolation(): QueryFailedError {
    return new QueryFailedError(
      'INSERT INTO ...',
      [],
      Object.assign(new Error('duplicate key value'), { code: '23505' }),
    );
  }

  function chargeSuccess() {
    return {
      event: 'charge.success',
      data: {
        id: faker.number.int({ min: 1_000_000 }),
        reference: `ce_${faker.string.uuid()}`,
        amount: 100_000,
      },
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getRepositoryToken(ProcessedWebhookEvent),
          useValue: events,
        },
        { provide: getRepositoryToken(Payment), useValue: payments },
        { provide: getRepositoryToken(Workspace), useValue: workspaces },
        { provide: getRepositoryToken(Contact), useValue: contacts },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        { provide: SseService, useValue: sse },
      ],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
  });

  it('throws 401 on an invalid HMAC signature', async () => {
    const { raw } = signedBody(chargeSuccess());

    await expect(service.handlePaystack(raw, 'deadbeef')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(events.save).not.toHaveBeenCalled();
  });

  it('skips processing for a duplicate event_id and still answers 200', async () => {
    const { raw, signature } = signedBody(chargeSuccess());
    events.save.mockRejectedValueOnce(uniqueViolation());

    const result = await service.handlePaystack(raw, signature);

    expect(result).toEqual({ received: true, processed: false });
    expect(payments.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(sse.emit).not.toHaveBeenCalled();
  });

  it('acks 200 unprocessed for a signed-but-unparseable body', async () => {
    const raw = Buffer.from('not-json{');
    const signature = createHmac('sha256', SECRET).update(raw).digest('hex');

    const result = await service.handlePaystack(raw, signature);

    expect(result).toEqual({ received: true, processed: false });
    expect(events.save).not.toHaveBeenCalled();
  });

  it('confirms the payment, credits the workspace, and emits SSE', async () => {
    const payload = chargeSuccess();
    const { raw, signature } = signedBody(payload);
    const payment = {
      id: faker.string.uuid(),
      workspaceId: faker.string.uuid(),
      reference: payload.data.reference,
      creditsAdded: 50,
      status: 'pending',
    };
    payments.findOne.mockResolvedValue(payment);
    workspaces.findOne.mockResolvedValue({ credits: 50 });

    const result = await service.handlePaystack(raw, signature);

    expect(events.save).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      Payment,
      { id: payment.id },
      { status: 'confirmed' },
    );
    expect(manager.increment).toHaveBeenCalledWith(
      Workspace,
      { id: payment.workspaceId },
      'credits',
      50,
    );
    expect(sse.emit).toHaveBeenCalledWith(payment.workspaceId, 'credit_updated', {
      credits: 50,
      reference: payment.reference,
    });
    expect(result).toEqual({ received: true, processed: true });
  });
});

describe('WebhooksService (Africa\u2019s Talking)', () => {
  let service: WebhooksService;

  const contacts = { findOne: vi.fn(), update: vi.fn() };
  const sse = { emit: vi.fn() };
  const events = {
    create: vi.fn((value: Record<string, unknown>) => value),
    save: vi.fn(async (value: Record<string, unknown>) => ({
      id: faker.string.uuid(),
      ...value,
    })),
  };
  const payments = { findOne: vi.fn() };
  const workspaces = { findOne: vi.fn() };
  const manager = { update: vi.fn(), increment: vi.fn() };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return SECRET;
      if (key === 'AT_API_KEY') return 'at_test_key';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getRepositoryToken(ProcessedWebhookEvent),
          useValue: events,
        },
        { provide: getRepositoryToken(Payment), useValue: payments },
        { provide: getRepositoryToken(Workspace), useValue: workspaces },
        { provide: getRepositoryToken(Contact), useValue: contacts },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        { provide: SseService, useValue: sse },
      ],
    }).compile();
    service = module.get<WebhooksService>(WebhooksService);
  });

  it('marks the contact DELIVERED on a Delivered receipt', async () => {
    const contact = {
      id: faker.string.uuid(),
      campaignId: faker.string.uuid(),
      workspaceId: faker.string.uuid(),
      status: 'SENT',
      atMessageId: 'ATX123',
    };
    contacts.findOne.mockResolvedValue(contact);

    const result = await service.handleAfricasTalking(
      { messageId: 'ATX123', status: 'Delivered' },
      'at_test_key',
    );

    expect(contacts.findOne).toHaveBeenCalledWith({
      where: { atMessageId: 'ATX123' },
    });
    expect(contacts.update).toHaveBeenCalledWith(
      { id: contact.id },
      { status: 'DELIVERED' },
    );
    expect(sse.emit).toHaveBeenCalledWith(contact.workspaceId, 'contact_updated', {
      contactId: contact.id,
      campaignId: contact.campaignId,
      status: 'DELIVERED',
    });
    expect(result).toEqual({ received: true, processed: true });
  });

  it('marks the contact FAILED on a Failed receipt', async () => {
    const contact = {
      id: faker.string.uuid(),
      campaignId: faker.string.uuid(),
      workspaceId: faker.string.uuid(),
      status: 'SENT',
      atMessageId: 'ATX456',
    };
    contacts.findOne.mockResolvedValue(contact);

    const result = await service.handleAfricasTalking(
      { messageId: 'ATX456', status: 'Failed' },
      'at_test_key',
    );

    expect(contacts.update).toHaveBeenCalledWith(
      { id: contact.id },
      { status: 'FAILED' },
    );
    expect(result).toEqual({ received: true, processed: true });
  });
});
