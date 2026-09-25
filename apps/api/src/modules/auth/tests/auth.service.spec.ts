import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity.js';
import { AuthService } from '../auth.service.js';
import { User } from '../entities/user.entity.js';

// All externals mocked: repositories, JwtService, and the transaction
// manager. Password hashing itself is real (bcrypt round-trip).
describe('AuthService', () => {
  let service: AuthService;

  const users = { findOne: vi.fn() };
  const workspaces = { findOne: vi.fn() };
  const jwt = { sign: vi.fn(() => 'signed-test-token') };
  const manager = {
    create: vi.fn((_cls: unknown, value: Record<string, unknown>) => value),
    save: vi.fn(async (_cls: unknown, value: Record<string, unknown>) => ({
      id: faker.string.uuid(),
      ...value,
    })),
  };
  const dataSource = {
    transaction: vi.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Workspace), useValue: workspaces },
        { provide: JwtService, useValue: jwt },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates user + workspace in one transaction and returns a token', async () => {
      users.findOne.mockResolvedValue(null);
      const dto = {
        email: faker.internet.email(),
        password: 'supersecret1',
        workspaceName: faker.company.name(),
      };

      const result = await service.register(dto);

      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: expect.any(String),
        workspaceId: expect.any(String),
      });
      expect(result.accessToken).toBe('signed-test-token');
      expect(result.user.email).toBe(dto.email);
      expect(result.workspace.name).toBe(dto.workspaceName);
      expect(result.workspace.credits).toBe(0);
    });

    it('throws 409 when the email is already registered', async () => {
      users.findOne.mockResolvedValue({ id: faker.string.uuid() });

      await expect(
        service.register({
          email: faker.internet.email(),
          password: 'supersecret1',
          workspaceName: faker.company.name(),
        }),
      ).rejects.toThrow(ConflictException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const password = 'correct-horse-1';

    async function existingUser() {
      return {
        id: faker.string.uuid(),
        email: faker.internet.email(),
        passwordHash: await bcrypt.hash(password, 4),
      };
    }

    it('returns a token for valid credentials', async () => {
      const user = await existingUser();
      const workspace = { id: faker.string.uuid(), name: 'Acme', credits: 0 };
      users.findOne.mockResolvedValue(user);
      workspaces.findOne.mockResolvedValue(workspace);

      const result = await service.login({
        email: user.email,
        password,
      });

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: user.id,
        workspaceId: workspace.id,
      });
      expect(result.accessToken).toBe('signed-test-token');
    });

    it('throws 401 on wrong password', async () => {
      const user = await existingUser();
      users.findOne.mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('throws 401 for an unknown email', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          email: faker.internet.email(),
          password: 'whatever123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });
});
