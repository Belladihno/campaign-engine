import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../campaigns/entities/contact.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

// SseService needs no import — SseModule is global (TRD Step 13).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcessedWebhookEvent,
      Payment,
      Workspace,
      Contact,
    ]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
