import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { Campaign } from './entities/campaign.entity.js';
import { Contact } from './entities/contact.entity.js';
import { IdempotencyKey } from './entities/idempotency-key.entity.js';

// Owns the 'delivery' queue registration: the service enqueues here,
// DeliveryProcessor (Step 12) consumes from the same queue name.
// Retry policy lives here as the default (single source — applies to
// sweeper jobs too); the rate limit lives on the worker itself.
// AuthModule import reuses its configured JwtService (single secret/expiry
// source) for ?token= verification on the SSE endpoint.
@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, Workspace, IdempotencyKey]),
    BullModule.registerQueue({
      name: 'delivery',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
    AuthModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
