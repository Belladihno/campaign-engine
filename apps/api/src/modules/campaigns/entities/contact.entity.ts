import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity.js';
// Type-only (entity-cycle discipline) — the runtime link is the string
// target in @ManyToOne below.
import type { Workspace } from '../../workspaces/entities/workspace.entity.js';
import { ContactStatus } from '../enums/contact-status.enum.js';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'campaign_id' })
  campaignId: string;

  // Owner side of the relation — value import is safe here because
  // campaign.entity.ts only references Contact by name.
  @ManyToOne(() => Campaign, (campaign) => campaign.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  // Denormalized for workspace-scoped queries without joining campaigns.
  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne('Workspace', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  // E.164 (validated at the DTO boundary).
  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar', default: ContactStatus.QUEUED })
  status: ContactStatus;

  // Africa's Talking message id — the key delivery receipts match on.
  @Column({ type: 'varchar', name: 'at_message_id', nullable: true })
  atMessageId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
