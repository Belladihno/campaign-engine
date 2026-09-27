import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import axios from 'axios';
import { User } from '../../auth/entities/user.entity.js';
import { Payment } from '../entities/payment.entity.js';
import { PaymentsService } from '../payments.service.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Paystack's HTTP call is mocked — these tests pin our side of the
// contract (amount, reference, headers, PENDING record), not Paystack's.
describe('PaymentsService', () => {
  let service: PaymentsService;

  const payments = {
    create: vi.fn((value: Record<string, unknown>) => value),
    save: vi.fn(async (value: Record<string, unknown>) => ({
      id: faker.string.uuid(),
      ...value,
    })),
    update: vi.fn(async () => ({ affected: 1 })),
  };
  const users = { findOne: vi.fn() };
  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mock';
      throw new Error(`Unexpected config key: ${key}`);
    }),
    get: vi.fn((_key: string) => undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: payments },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
  });

  it('throws 400 for an unknown plan', async () => {
    await expect(
      service.initiate(faker.string.uuid(), faker.string.uuid(), {
        plan: 'plan_nonexistent' as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('calls Paystack with the correct amount and reference', async () => {
    const user = { id: faker.string.uuid(), email: faker.internet.email() };
    users.findOne.mockResolvedValue(user);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: {
          authorization_url: 'https://checkout.paystack.com/mock',
          access_code: 'mock',
          reference: 'ce_mock',
        },
      },
    });

    const result = await service.initiate(user.id, faker.string.uuid(), {
      plan: 'plan_starter',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: 100_000,
        reference: expect.stringMatching(/^ce_/),
      },
      {
        headers: { Authorization: 'Bearer sk_test_mock' },
        timeout: 15_000,
      },
    );
    expect(result.checkoutUrl).toBe('https://checkout.paystack.com/mock');
    expect(result.reference).toMatch(/^ce_/);
  });

  it('stores the payment record as PENDING', async () => {
    const user = { id: faker.string.uuid(), email: faker.internet.email() };
    const workspaceId = faker.string.uuid();
    users.findOne.mockResolvedValue(user);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: {
          authorization_url: 'https://checkout.paystack.com/mock',
          access_code: 'mock',
          reference: 'ce_mock',
        },
      },
    });

    await service.initiate(user.id, workspaceId, { plan: 'plan_growth' });

    expect(payments.create).toHaveBeenCalledWith({
      workspaceId,
      reference: expect.stringMatching(/^ce_/),
      amount: 250_000,
      creditsAdded: 150,
      status: 'pending',
    });
    expect(payments.save).toHaveBeenCalledTimes(1);
  });

  it('marks the attempt failed when the provider call throws', async () => {    const user = { id: faker.string.uuid(), email: faker.internet.email() };
    users.findOne.mockResolvedValue(user);
    mockedAxios.post.mockRejectedValue(new Error('provider down'));

    await expect(
      service.initiate(user.id, faker.string.uuid(), { plan: 'plan_starter' }),
    ).rejects.toThrow(BadGatewayException);
    // PENDING was persisted first, so the attempt is traceable —
    // then flipped to failed, never left dangling.
    expect(payments.save).toHaveBeenCalledTimes(1);
    expect(payments.update).toHaveBeenCalledWith(
      { id: expect.any(String) },
      { status: 'failed' },
    );
  });

  it('sends callback_url only when FRONTEND_URL is configured', async () => {
    const user = { id: faker.string.uuid(), email: faker.internet.email() };
    users.findOne.mockResolvedValue(user);
    mockedAxios.post.mockResolvedValue({
      data: {
        data: {
          authorization_url: 'https://checkout.paystack.com/mock',
          access_code: 'mock',
          reference: 'ce_mock',
        },
      },
    });
    config.get.mockReturnValueOnce('https://app.example.com/');

    await service.initiate(user.id, faker.string.uuid(), {
      plan: 'plan_starter',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/initialize',
      expect.objectContaining({
        callback_url: 'https://app.example.com/dashboard?funded=1',
      }),
      expect.anything(),
    );
  });
});
