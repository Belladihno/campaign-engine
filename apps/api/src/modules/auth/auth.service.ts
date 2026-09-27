import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../database/errors.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from './entities/user.entity.js';

const BCRYPT_COST = 12;

// Pre-hashed dummy burned once at boot. Compared on the unknown-email path
// so a miss costs ~the same ~250ms as a real compare — otherwise login
// timing reveals which emails exist.
const DUMMY_HASH = bcrypt.hashSync('nonexistent-user-dummy', BCRYPT_COST);

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

  // User + workspace are created atomically — halves can never exist.
  // The findOne pre-check is a fast path, not the guard: concurrent
  // registers serialize on the UNIQUE constraint, mapped back to 409.
  async register(dto: RegisterDto) {
    const existing = await this.users.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    try {
      const { user, workspace } = await this.dataSource.transaction(
        async (manager) => {
          const user = await manager.save(
            User,
            manager.create(User, { email: dto.email, passwordHash }),
          );
          const workspace = await manager.save(
            Workspace,
            // Credits set explicitly: save() returns the passed object, so a
            // DB-side DEFAULT would not show in the register response.
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    // Dummy compare keeps miss timing indistinguishable from a real check.
    const passwordOk = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : !(await bcrypt.compare(dto.password, DUMMY_HASH));
    if (!user || !passwordOk) {
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
