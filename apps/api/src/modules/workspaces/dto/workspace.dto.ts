import { Workspace } from '../entities/workspace.entity.js';

// Response shape for GET /workspaces/me. Kept separate from the entity so
// internal columns (userId) never leak to the frontend.
export class WorkspaceDto {
  id: string;
  name: string;
  credits: number;
  createdAt: Date;

  static from(entity: Workspace): WorkspaceDto {
    const dto = new WorkspaceDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.credits = entity.credits;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
