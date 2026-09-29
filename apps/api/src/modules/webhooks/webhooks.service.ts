import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(WebhooksService.name);

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

  // Paystack: verify → dedupe → credit → emit. Only bad signatures 401 —
  // Paystack retries anything else, so skips still answer received:true.
  async handlePaystack(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ received: boolean; processed: boolean }> {
    const secret = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    if (!signature || !this.isValidSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    // Signed-but-unparseable bodies are poison: no retry heals them, so ack
    // 200 unprocessed instead of 500-looping on Paystack's retries.
    let event: PaystackChargeSuccess;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as PaystackChargeSuccess;
    } catch {
      this.logger.warn('Paystack webhook: unparseable body, acking unprocessed');
      return { received: true, processed: false };
    }
    if (event?.event !== 'charge.success') {
      this.logger.log(`Paystack webhook: ignoring event ${event?.event}`);
      return { received: true, processed: false };
    }
    this.logger.log(
      `Paystack webhook verified — event: charge.success, ref: ${event.data.reference}`,
    );

    // Idempotency insert doubles as the check — concurrent redeliveries
    // serialize on the UNIQUE constraint.
    this.logger.log('Saving webhook event...');
    try {
      const saved = await this.events.save(
        this.events.create({ eventId: `paystack:${event.data.id}` }),
      );
      this.logger.log(`Webhook event saved: ${saved.id}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.log(
          `Paystack webhook: duplicate event paystack:${event.data.id}, skipping`,
        );
        return { received: true, processed: false };
      }
      throw error;
    }

    this.logger.log('Finding payment...');
    const payment = await this.payments.findOne({
      where: { reference: event.data.reference },
    });
    this.logger.log('Payment lookup completed');
    if (!payment || payment.status === 'confirmed') {
      this.logger.warn(
        `Paystack webhook: reference ${event.data.reference} unknown or already confirmed, skipping`,
      );
      return { received: true, processed: false };
    }

    this.logger.log('Starting payment transaction...');
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Payment, { id: payment.id }, { status: 'confirmed' });
      await manager.increment(
        Workspace,
        { id: payment.workspaceId },
        'credits',
        payment.creditsAdded,
      );
    });
    this.logger.log('Payment transaction completed');

    const workspace = await this.workspaces.findOne({
      where: { id: payment.workspaceId },
    });
    this.sse.emit(payment.workspaceId, 'credit_updated', {
      credits: workspace?.credits ?? null,
      reference: payment.reference,
    });
    this.logger.log(
      `Paystack webhook: confirmed ${payment.reference}, credited ${payment.creditsAdded}`,
    );
    this.logger.log('Webhook processing completed');
    return { received: true, processed: true };
  }

  // HMAC-SHA256 over the RAW body bytes — never the parsed object.
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

  // Delivery receipt: match the contact by the SDK-returned message id,
  // advance it, emit SSE. Auth is URL-based by provider design —
  // ?secret=<AT_WEBHOOK_SECRET>; mismatch still answers 200 unprocessed
  // because AT retries non-200 as deliverable failures.
  async handleAfricasTalking(
    receipt: { messageId?: string; status?: string },
    secret: string | undefined,
  ): Promise<{ received: boolean; processed: boolean }> {
    const expected = this.config.getOrThrow<string>('AT_WEBHOOK_SECRET');
    if (
      !secret ||
      secret.length !== expected.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    ) {
      return { received: true, processed: false };
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
    // Provider vocabulary: 'Success' delivered; anything else terminal
    // counts as failed.
    const next =
      status === 'Success' ? ContactStatus.DELIVERED : ContactStatus.FAILED;
    if (contact.status === next) {
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
