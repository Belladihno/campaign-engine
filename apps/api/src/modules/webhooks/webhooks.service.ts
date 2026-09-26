import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../database/errors.js';
import { SseService } from '../../shared/sse/sse.service.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity.js';

interface PaystackChargeSuccess {
  event: string;
  data: {
    id: number;
    reference: string;
    amount: number;
  };
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly sse: SseService,
    @InjectRepository(ProcessedWebhookEvent)
    private readonly events: Repository<ProcessedWebhookEvent>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
  ) {}

  // Paystack pipeline (TRD §7.6): verify → dedupe → credit → emit.
  // Always answers 200 except on bad signature: Paystack retries anything
  // else, so acknowledged-but-skipped outcomes (unknown event, unknown
  // reference, already confirmed) still return received:true.
  async handlePaystack(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ received: boolean; processed: boolean }> {
    const secret = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    if (!signature || !this.isValidSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as PaystackChargeSuccess;
    if (event?.event !== 'charge.success') {
      return { received: true, processed: false };
    }

    // Idempotency insert doubles as the check (TRD §9.3) — concurrent
    // redeliveries serialize on the UNIQUE constraint.
    try {
      await this.events.save(
        this.events.create({ eventId: `paystack:${event.data.id}` }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { received: true, processed: false };
      }
      throw error;
    }

    const payment = await this.payments.findOne({
      where: { reference: event.data.reference },
    });
    if (!payment || payment.status === 'confirmed') {
      return { received: true, processed: false };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Payment, { id: payment.id }, { status: 'confirmed' });
      await manager.increment(
        Workspace,
        { id: payment.workspaceId },
        'credits',
        payment.creditsAdded,
      );
    });

    const workspace = await this.workspaces.findOne({
      where: { id: payment.workspaceId },
    });
    this.sse.emit(payment.workspaceId, 'credit_updated', {
      credits: workspace?.credits ?? null,
      reference: payment.reference,
    });
    return { received: true, processed: true };
  }

  // HMAC-SHA256 over the RAW body bytes (TRD §9.2) — never the parsed object.
  private isValidSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
