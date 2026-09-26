import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Exactly-once ledger for inbound webhooks (TRD §9.3). `eventId` carries a
// provider prefix (`paystack:<transaction-id>`) so two providers can never
// collide. The UNIQUE constraint is the entire concurrency control: the
// insert IS the check, so simultaneous redeliveries serialize on it.
@Entity('processed_webhook_events')
export class ProcessedWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, name: 'event_id' })
  eventId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'processed_at' })
  processedAt: Date;
}
