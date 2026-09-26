import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspacesService } from '../workspaces.service.js';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  const workspaces = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(Workspace), useValue: workspaces },
      ],
    }).compile();
    service = module.get<WorkspacesService>(WorkspacesService);
  });

  it('returns the workspace DTO without internal columns', async () => {
    const entity = {
      id: faker.string.uuid(),
      userId: faker.string.uuid(),
      name: faker.company.name(),
      credits: 150,
      createdAt: new Date(),
    };
    workspaces.findOne.mockResolvedValue(entity);

    const result = await service.getMine(entity.id);

    expect(workspaces.findOne).toHaveBeenCalledWith({
      where: { id: entity.id },
    });
    expect(result).toEqual({
      id: entity.id,
      name: entity.name,
      credits: entity.credits,
      createdAt: entity.createdAt,
    });
    expect(result).not.toHaveProperty('userId');
  });

  it('throws 404 for an unknown workspace id', async () => {
    workspaces.findOne.mockResolvedValue(null);

    await expect(service.getMine(faker.string.uuid())).rejects.toThrow(
      NotFoundException,
    );
  });
});
