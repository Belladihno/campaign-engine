import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
// Type-only + string target (entity-cycle discipline).
import type { Campaign } from './campaign.entity.js';

// Maps a client-supplied Idempotency-Key to the campaign it created, so
// retried POSTs (double-click, timeout retry) return the original instead
// of charging twice. Scoped per workspace. Rows are write-once: campaignId
// is set in the same transaction that creates the campaign.
@Entity('idempotency_keys')
@Unique(['key', 'workspaceId'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  key: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @Column({ type: 'uuid', name: 'campaign_id', nullable: true })
  campaignId: string | null;

  @ManyToOne('Campaign', { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
