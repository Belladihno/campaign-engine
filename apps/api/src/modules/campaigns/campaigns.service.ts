import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, LessThan, Repository } from 'typeorm';
import { isUniqueViolation } from '../../database/errors.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { CreateCampaignDto } from './dto/create-campaign.dto.js';
import { Campaign } from './entities/campaign.entity.js';
import { Contact } from './entities/contact.entity.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';
import { describeSms } from './sms.js';
import { CampaignStatus } from './enums/campaign-status.enum.js';
import { ContactStatus } from './enums/contact-status.enum.js';

export interface DeliveryJobPayload {
  campaignId: string;
}

// A campaign younger than this may still be mid-create (commit done, enqueue
// in flight) — only older PENDING rows count as orphans.
const ORPHAN_AGE_MS = 60_000;

// A create with no key behaves exactly as before (key is optional).
const MAX_KEY_LENGTH = 64;
// Winner-write visibility window for a lost key race (see create()).
const REPLAY_POLL_ATTEMPTS = 5;
const REPLAY_POLL_MS = 50;

@Injectable()
export class CampaignsService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Contact)
    private readonly contacts: Repository<Contact>,
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
    @InjectQueue('delivery') private readonly deliveryQueue: Queue,
  ) {}

  // Creates the campaign, reserves credits, and enqueues dispatch (TRD §5.2).
  // The credit check AND deduct happen inside one transaction under a
  // workspace row lock — concurrent creates serialize instead of
  // overspending (TOCTOU audit). The BullMQ job is enqueued only after a
  // successful commit, never before (TRD §7.3).
  //
  // Idempotency-Key (optional header): retried POSTs resolve to the
  // original campaign instead of charging twice.
  //
  // Postgres aborts a transaction on ANY error, so the key claim cannot
  // live inside the create transaction (a lost insert race would poison
  // it). Instead: fast-path read outside the tx, claim inside, and on a
  // unique violation the tx rolls back cleanly — then poll outside the tx
  // for the winner's linked campaign.
  async create(
    workspaceId: string,
    dto: CreateCampaignDto,
    idempotencyKey?: string,
  ): Promise<{ campaign: Campaign; replayed: boolean }> {
    // Duplicate numbers would double-send and double-charge — collapse them
    // and bill for unique recipients only.
    const phones = [...new Set(dto.contacts.map((p) => p.trim()))];
    const key = this.normalizeKey(idempotencyKey);
    // Carriers bill per segment (fix #6): a unicode message costs more
    // credits per recipient than a GSM-7 one of the same character length.
    const { segments } = describeSms(dto.message);
    const cost = phones.length * segments;

    if (key) {
      const replay = await this.findLinkedCampaign(workspaceId, key);
      if (replay) {
        const campaign = await this.getOne(workspaceId, replay.id);
        return { campaign, replayed: true };
      }
    }

    let outcome: { campaign: Campaign; replayed: boolean };
    try {
      outcome = await this.dataSource.transaction(async (manager) => {
        if (key) {
          await manager.save(
            IdempotencyKey,
            manager.create(IdempotencyKey, { key, workspaceId }),
          );
        }
        const workspace = await manager.findOne(Workspace, {
          where: { id: workspaceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!workspace) {
          throw new NotFoundException('Workspace not found');
        }
      if (workspace.credits < cost) {
        throw new UnprocessableEntityException(
          `Insufficient credits: need ${cost} ` +
            `(${phones.length} contacts × ${segments} segment${segments === 1 ? '' : 's'}), ` +
            `have ${workspace.credits}`,
        );
      }
      workspace.credits -= cost;
      await manager.save(Workspace, workspace);

        const created = await manager.save(
          Campaign,
          manager.create(Campaign, {
            workspaceId,
            name: dto.name,
            message: dto.message,
            status: CampaignStatus.PENDING,
            totalContacts: phones.length,
          }),
        );
        await manager.save(
          Contact,
          phones.map((phone) =>
            manager.create(Contact, {
              campaignId: created.id,
              workspaceId,
              phone,
              status: ContactStatus.QUEUED,
            }),
          ),
        );
        if (key) {
          await manager.update(
            IdempotencyKey,
            { key, workspaceId },
            { campaignId: created.id },
          );
        }
        return { campaign: created, replayed: false };
      });
    } catch (error) {
      // Lost the key race: our tx rolled back, the connection is healthy —
      // resolve to the winner's campaign (or 409 if it never links).
      if (key && isUniqueViolation(error)) {
        for (let attempt = 0; attempt < REPLAY_POLL_ATTEMPTS; attempt += 1) {
          const replay = await this.findLinkedCampaign(workspaceId, key);
          if (replay) {
            const campaign = await this.getOne(workspaceId, replay.id);
            return { campaign, replayed: true };
          }
          await new Promise((resolve) => setTimeout(resolve, REPLAY_POLL_MS));
        }
        throw new ConflictException('Duplicate request already in progress');
      }
      throw error;
    }

    if (!outcome.replayed) {
      // Idempotent worker (Step 12) resumes from QUEUED, so a retry after a
      // midway crash never re-sends — attempts/backoff here are safe.
      await this.enqueueDelivery(outcome.campaign.id);
    }
    const campaign = await this.getOne(workspaceId, outcome.campaign.id);
    return { campaign, replayed: outcome.replayed };
  }

  // Crash recovery: a commit followed by a process death before enqueue (or
  // a failed enqueue) leaves a PENDING orphan no worker will ever see.
  // Re-enqueue stale ones on boot. Duplicates are harmless — the worker is
  // idempotent (row lock + QUEUED-only resume), so a job that survived the
  // crash alongside its campaign simply no-ops on second pickup.
  async onModuleInit(): Promise<void> {
    const orphans = await this.campaigns.find({
      where: {
        status: CampaignStatus.PENDING,
        createdAt: LessThan(new Date(Date.now() - ORPHAN_AGE_MS)),
      },
    });
    for (const orphan of orphans) {
      await this.enqueueDelivery(orphan.id);
    }
  }

  async list(workspaceId: string): Promise<Campaign[]> {
    return this.campaigns.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async getOne(workspaceId: string, id: string) {
    const campaign = await this.campaigns.findOne({
      where: { id, workspaceId },
      relations: { contacts: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private async enqueueDelivery(campaignId: string): Promise<void> {
    // Retry policy + rate limit live on the queue registration
    // (campaigns.module.ts) — single source, applies to sweeper jobs too.
    await this.deliveryQueue.add('send-campaign', {
      campaignId,
    } satisfies DeliveryJobPayload);
  }

  private normalizeKey(raw: string | undefined): string | undefined {
    if (raw === undefined) {
      return undefined;
    }
    const key = raw.trim();
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be 1–${MAX_KEY_LENGTH} characters`,
      );
    }
    return key;
  }

  // Linked original for a key, or null. Plain read outside any tx — safe
  // to call after a rolled-back race because no poisoned transaction is
  // ever in scope here.
  private async findLinkedCampaign(
    workspaceId: string,
    key: string,
  ): Promise<Campaign | null> {
    const record = await this.keys.findOne({
      where: { key, workspaceId },
      relations: { campaign: true },
    });
    return record?.campaign ?? null;
  }
}
