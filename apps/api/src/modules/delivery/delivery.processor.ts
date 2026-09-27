import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { SseService } from '../../shared/sse/sse.service.js';
import type { DeliveryJobPayload } from '../campaigns/campaigns.service.js';
import { Campaign } from '../campaigns/entities/campaign.entity.js';
import { Contact } from '../campaigns/entities/contact.entity.js';
import { CampaignStatus } from '../campaigns/enums/campaign-status.enum.js';
import { ContactStatus } from '../campaigns/enums/contact-status.enum.js';
import { AfricasTalkingService } from './delivery.service.js';

// BullMQ worker for the 'delivery' queue (TRD §7.5). One job per campaign.
// The limiter is ENFORCED here (not display text): sends run sequentially
// today so 10/sec never binds — but it caps the blast radius the day
// concurrency rises, and providers throttle aggressive senders.
// Idempotency (dual-send prevention): the campaign row is locked before
// any transition, non-PENDING jobs no-op, and only QUEUED contacts are
// ever touched — a retry resumes exactly where the crash left off.
@Processor('delivery', { limiter: { max: 10, duration: 1000 } })
@Injectable()
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Contact)
    private readonly contacts: Repository<Contact>,
    private readonly sms: AfricasTalkingService,
    private readonly sse: SseService,
  ) {
    super();
  }

  async process(job: Job<DeliveryJobPayload>): Promise<void> {
    const campaign = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(Campaign, {
        where: { id: job.data.campaignId },
        lock: { mode: 'pessimistic_write' },
      });
      // Duplicate, late, or already-handled job — safe no-op.
      if (!locked || locked.status !== CampaignStatus.PENDING) {
        return null;
      }
      locked.status = CampaignStatus.PROCESSING;
      await manager.save(Campaign, locked);
      return locked;
    });
    if (!campaign) {
      return;
    }
    this.sse.emit(campaign.workspaceId, 'campaign_updated', {
      campaignId: campaign.id,
      status: CampaignStatus.PROCESSING,
    });

    const queued = await this.contacts.find({
      where: { campaignId: campaign.id, status: ContactStatus.QUEUED },
      order: { createdAt: 'ASC' },
    });
    for (const contact of queued) {
      try {
        const { messageId } = await this.sms.sendSms(
          contact.phone,
          campaign.message,
        );
        contact.status = ContactStatus.SENT;
        contact.atMessageId = messageId;
      } catch (error) {
        // Provider rejection for THIS recipient — recorded as FAILED,
        // dispatch continues with the rest. Truly unexpected errors (DB
        // loss mid-loop) escape to BullMQ, which retries the job; the
        // QUEUED-only resume makes that safe.
        // Contact id + reason only — phone numbers stay out of logs.
        this.logger.warn(
          `Contact ${contact.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        contact.status = ContactStatus.FAILED;
        contact.atMessageId = null;
      }
      await this.contacts.save(contact);
      this.sse.emit(campaign.workspaceId, 'contact_updated', {
        contactId: contact.id,
        campaignId: campaign.id,
        status: contact.status,
      });
    }

    await this.finalizeCampaign(campaign.id);
  }

  // Exhausted retries land here (fires per failed attempt — the guard
  // restricts action to the last one). Recounts from the database rather
  // than trusting in-memory tallies, so partial progress across attempts
  // resolves to the honest terminal state.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<DeliveryJobPayload>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade < maxAttempts) {
      return;
    }
    await this.finalizeCampaign(job.data.campaignId);
  }

  private async finalizeCampaign(campaignId: string): Promise<void> {
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
    });
    if (
      !campaign ||
      (campaign.status !== CampaignStatus.PENDING &&
        campaign.status !== CampaignStatus.PROCESSING)
    ) {
      return;
    }
    const [sent, failed] = await Promise.all([
      this.contacts.count({
        where: {
          campaignId,
          status: In([ContactStatus.SENT, ContactStatus.DELIVERED]),
        },
      }),
      this.contacts.count({
        where: { campaignId, status: ContactStatus.FAILED },
      }),
    ]);
    const finalStatus =
      failed === 0
        ? CampaignStatus.SENT
        : sent === 0
          ? CampaignStatus.FAILED
          : CampaignStatus.PARTIALLY_SENT;
    campaign.status = finalStatus;
    campaign.sentCount = sent;
    campaign.failedCount = failed;
    await this.campaigns.save(campaign);
    this.sse.emit(campaign.workspaceId, 'campaign_updated', {
      campaignId: campaign.id,
      status: finalStatus,
      sentCount: sent,
      failedCount: failed,
    });
  }
}
