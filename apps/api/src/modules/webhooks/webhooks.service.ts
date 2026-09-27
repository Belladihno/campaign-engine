import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../database/errors.js';
import { SseService } from '../../shared/sse/sse.service.js';
import { Contact } from '../campaigns/entities/contact.entity.js';
import { ContactStatus } from '../campaigns/enums/contact-status.enum.js';
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
    @InjectRepository(Contact)
    private readonly contacts: Repository<Contact>,
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
    // A signed-but-unparseable body is poison: no retry can heal it, so ack
    // 200 unprocessed instead of 500-looping on Paystack's retry schedule.
    let event: PaystackChargeSuccess;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as PaystackChargeSuccess;
    } catch {
      return { received: true, processed: false };
    }
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

  // Africa's Talking delivery receipt (TRD §7.6): match the contact by the
  // message id the SDK returned at send time, advance it, emit SSE.
  // Sandbox-grade auth: shared secret header compared against AT_API_KEY
  // (production would use IP allowlisting). Unknown ids and interim
  // statuses ack 200 unprocessed — retries cannot heal them.
  async handleAfricasTalking(
    receipt: { messageId?: string; status?: string },
    secret: string | undefined,
  ): Promise<{ received: boolean; processed: boolean }> {
    const expected = this.config.getOrThrow<string>('AT_API_KEY');
    if (
      !secret ||
      secret.length !== expected.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid receipt secret');
    }
    const { messageId, status } = receipt;
    if (!messageId || !status) {
      return { received: true, processed: false };
    }
    const contact = await this.contacts.findOne({
      where: { atMessageId: messageId },
    });
    if (!contact) {
      return { received: true, processed: false };
    }
    const next =
      status === 'Delivered'
        ? ContactStatus.DELIVERED
        : status === 'Failed' || status === 'Rejected'
          ? ContactStatus.FAILED
          : null;
    if (!next || contact.status === next) {
      return { received: true, processed: false };
    }
    await this.contacts.update({ id: contact.id }, { status: next });
    this.sse.emit(contact.workspaceId, 'contact_updated', {
      contactId: contact.id,
      campaignId: contact.campaignId,
      status: next,
    });
    return { received: true, processed: true };
  }
}
