import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from './entities/user.entity.js';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    private readonly jwt: JwtService,
  ) {}

  // Creates the user AND its workspace atomically — a half-registered user
  // (no workspace) can never exist (TRD §7.1).
  async register(dto: RegisterDto) {
    const existing = await this.users.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const { user, workspace } = await this.dataSource.transaction(
      async (manager) => {
        const user = await manager.save(
          User,
          manager.create(User, { email: dto.email, passwordHash }),
        );
        const workspace = await manager.save(
          Workspace,
          // credits set explicitly: save() returns the passed object, and a
          // DB-side DEFAULT would not be reflected in the register response.
          manager.create(Workspace, {
            userId: user.id,
            name: dto.workspaceName,
            credits: 0,
          }),
        );
        return { user, workspace };
      },
    );
    return this.toAuthPayload(user, workspace);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Always present — register creates it in the same transaction.
    // Treated as invalid credentials (not 500) to avoid leaking state.
    const workspace = await this.workspaces.findOne({
      where: { userId: user.id },
    });
    if (!workspace) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.toAuthPayload(user, workspace);
  }

  private toAuthPayload(user: User, workspace: Workspace) {
    const accessToken = this.jwt.sign({
      sub: user.id,
      workspaceId: workspace.id,
    });
    return {
      user: { id: user.id, email: user.email },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        credits: workspace.credits,
      },
      accessToken,
    };
  }
}
