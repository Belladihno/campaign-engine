import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
// Type-only: the inverse side must not import Workspace at runtime, or the
// pair deadlocks in TDZ. The string target below resolves lazily instead.
import type { Workspace } from '../../workspaces/entities/workspace.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  // String target (entity name) instead of () => Workspace — see import note.
  @OneToOne('Workspace', (workspace: Workspace) => workspace.user)
  workspace: Workspace;
}
