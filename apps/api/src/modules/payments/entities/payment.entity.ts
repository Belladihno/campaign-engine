import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
// Type-only + string target (User ↔ Workspace discipline): no eager
// cross-entity import, or load order can deadlock in TDZ.
import type { Workspace } from '../../workspaces/entities/workspace.entity.js';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne('Workspace', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  // Paystack transaction reference — unique per attempt.
  @Column({ type: 'varchar', unique: true })
  reference: string;

  // Amount charged, in kobo (Paystack's minor unit).
  @Column({ type: 'integer' })
  amount: number;

  @Column({ type: 'integer', name: 'credits_added' })
  creditsAdded: number;

  @Column({ type: 'varchar', default: 'pending' })
  status: PaymentStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
