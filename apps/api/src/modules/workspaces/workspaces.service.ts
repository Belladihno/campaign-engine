import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceDto } from './dto/workspace.dto.js';
import { Workspace } from './entities/workspace.entity.js';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
  ) {}

  // Owner-scoped by construction: the id comes from the signed JWT, never
  // from a client-supplied parameter.
  async getMine(workspaceId: string): Promise<WorkspaceDto> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return WorkspaceDto.from(workspace);
  }
}
