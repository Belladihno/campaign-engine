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

  // Starts a Paystack charge and records it as PENDING. Credits move only
  // when the webhook confirms payment (TRD §9.5) — this method never
  // touches workspace.credits.
  async initiate(
    userId: string,
    workspaceId: string,
    dto: InitiatePaymentDto,
  ): Promise<{ checkoutUrl: string; reference: string }> {
    const plan = PAYMENT_PLANS[dto.plan];
    // Belt-and-braces: the DTO's @IsIn already 400s, but the service is
    // also called directly (specs, future callers).
    if (!plan) {
      throw new BadRequestException(`Unknown plan: ${dto.plan}`);
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const reference = `ce_${uuidv4()}`;
    let checkoutUrl: string;
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
      checkoutUrl = data.data.authorization_url;
    } catch {
      // Never leak provider internals (keys, payloads) to the client.
      throw new BadGatewayException('Payment provider unavailable');
    }

    await this.payments.save(
      this.payments.create({
        workspaceId,
        reference,
        amount: plan.amountKobo,
        creditsAdded: plan.credits,
        status: 'pending',
      }),
    );
    return { checkoutUrl, reference };
  }

  async listHistory(workspaceId: string): Promise<Payment[]> {
    return this.payments.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }
}
