import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from '../campaigns/entities/campaign.entity.js';
import { Contact } from '../campaigns/entities/contact.entity.js';
import { DeliveryProcessor } from './delivery.processor.js';
import { AfricasTalkingService } from './delivery.service.js';

// Consumes the 'delivery' queue registered by CampaignsModule.
// SseService needs no import (global); no exports.
@Module({
  imports: [TypeOrmModule.forFeature([Campaign, Contact])],
  providers: [DeliveryProcessor, AfricasTalkingService],
})
export class DeliveryModule {}
