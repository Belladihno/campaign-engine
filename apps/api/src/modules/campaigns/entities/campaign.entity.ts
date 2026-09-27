import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// Type-only + string targets (entity-cycle discipline): Campaign references
// Contact, Workspace only by name at runtime.
import type { Contact } from './contact.entity.js';
import type { Workspace } from '../../workspaces/entities/workspace.entity.js';
import { CampaignStatus } from '../enums/campaign-status.enum.js';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne('Workspace', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', default: CampaignStatus.PENDING })
  status: CampaignStatus;

  @Column({ type: 'integer', name: 'total_contacts' })
  totalContacts: number;

  @Column({ type: 'integer', name: 'sent_count', default: 0 })
  sentCount: number;

  @Column({ type: 'integer', name: 'failed_count', default: 0 })
  failedCount: number;

  @OneToMany('Contact', (contact: Contact) => contact.campaign)
  contacts: Contact[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
