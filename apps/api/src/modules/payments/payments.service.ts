import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity.js';
import { InitiatePaymentDto } from './dto/initiate-payment.dto.js';
import { Payment } from './entities/payment.entity.js';
import { PAYMENT_PLANS } from './plans.js';

const PAYSTACK_INITIALIZE_URL =
  'https://api.paystack.co/transaction/initialize';

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  // Starts a Paystack charge and records it PENDING. Credits move only on the
  // verified webhook — this method never touches workspace.credits.
  //
  // Ordering is load-bearing: the PENDING row is persisted BEFORE the
  // provider call. A crash or bug between Paystack success and our insert
  // used to orphan real transactions (Paystack knew them, we didn't —
  // paid webhooks then skipped as unknown references). Now the worst case
  // is a stale PENDING row, which confirms nothing and charges nothing.
  async initiate(
    userId: string,
    workspaceId: string,
    dto: InitiatePaymentDto,
  ): Promise<{ checkoutUrl: string; reference: string }> {
    const plan = PAYMENT_PLANS[dto.plan];
    // Double-check: @IsIn 400s at the boundary, but direct callers
    // (specs, future) bypass DTOs.
    if (!plan) {
      throw new BadRequestException(`Unknown plan: ${dto.plan}`);
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const reference = `ce_${uuidv4()}`;
    const payment = await this.payments.save(
      this.payments.create({
        workspaceId,
        reference,
        amount: plan.amountKobo,
        creditsAdded: plan.credits,
        status: 'pending',
      }),
    );
    try {
      const { data } = await axios.post<PaystackInitializeResponse>(
        PAYSTACK_INITIALIZE_URL,
        { email: user.email, amount: plan.amountKobo, reference },
        {
          headers: {
            Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
          },
          timeout: 15_000,
        },
      );
      return {
        checkoutUrl: data.data.authorization_url,
        reference: payment.reference,
      };
    } catch {
      // Provider never saw a completable charge — mark it so the ledger
      // distinguishes abandoned attempts from awaiting-payment ones.
      // Never leak provider internals (keys, payloads) to the client.
      await this.payments.update(
        { id: payment.id },
        { status: 'failed' },
      );
      throw new BadGatewayException('Payment provider unavailable');
    }
  }

  async listHistory(workspaceId: string): Promise<Payment[]> {
    return this.payments.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }
}
