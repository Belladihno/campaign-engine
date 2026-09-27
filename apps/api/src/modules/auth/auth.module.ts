import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

// jsonwebtoken's expiresIn takes seconds (number) or an ms-style string.
// We normalise `JWT_EXPIRY` (`24h`, `30m`, `7d` …) to seconds once, here —
// fail fast on a malformed value instead of issuing immortal tokens.
function parseExpiryToSeconds(raw: string): number {
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid JWT_EXPIRY "${raw}" — expected e.g. 30s, 15m, 24h, 7d.`,
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return value * multipliers[unit];
}

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Workspace]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        // 24h demo expiry, no refresh tokens (TRD §7.1).
        signOptions: {
          expiresIn: parseExpiryToSeconds(
            config.getOrThrow<string>('jwt.expiry'),
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule re-export: campaigns verifies SSE ?token= with the same
  // configured instance (single secret/expiry source).
  exports: [JwtModule],
})
export class AuthModule {}
