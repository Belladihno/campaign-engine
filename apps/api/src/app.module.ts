import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CampaignsModule } from './modules/campaigns/campaigns.module.js';
import { DeliveryModule } from './modules/delivery/delivery.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { SseModule } from './shared/sse/sse.module.js';
import databaseConfig from './config/database.config.js';
import jwtConfig from './config/jwt.config.js';
import redisConfig from './config/redis.config.js';
import { validateEnv } from './config/validation.js';

// Splits rediss://user:pass@host:port into ioredis options via the WHATWG
// URL API (no extra dep). rediss:// forces TLS; plain redis:// stays TCP.
function fromRedisUrl(url: string, fallbackPassword?: string) {
  const parsed = new URL(url);
  if (!parsed.hostname) {
    throw new Error('Invalid REDIS_URL (missing host). See .env.example.');
  }
  const username = parsed.username
    ? decodeURIComponent(parsed.username)
    : undefined;
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : fallbackPassword;
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    maxRetriesPerRequest: null,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(parsed.protocol === 'rediss:'
      ? { tls: { rejectUnauthorized: false } }
      : {}),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        database: config.getOrThrow<string>('database.name'),
        username: config.getOrThrow<string>('database.user'),
        password: config.getOrThrow<string>('database.password'),
        // Managed Postgres (Neon) mandates TLS. rejectUnauthorized:false is
        // pooler-friendly; pin the CA certificate in production.
        ...(config.getOrThrow<boolean>('database.ssl')
          ? { ssl: { rejectUnauthorized: false } }
          : {}),
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const password = config.get<string>('redis.password');
        const tls = config.getOrThrow<boolean>('redis.tls');
        const url = config.get<string>('redis.url');
        // maxRetriesPerRequest:null is a BullMQ hard requirement — without
        // it the worker throws on startup. Upstash (rediss://) additionally
        // mandates TLS, verified off for pooler compatibility.
        const connection = url
          ? fromRedisUrl(url, password)
          : {
              host: config.getOrThrow<string>('redis.host'),
              port: config.getOrThrow<number>('redis.port'),
              maxRetriesPerRequest: null,
              ...(password ? { password } : {}),
              ...(tls ? { tls: { rejectUnauthorized: false } } : {}),
            };
        return {
          connection,
          prefix: config.getOrThrow<string>('redis.bullPrefix'),
        };
      },
    }),
    // NOTE: default in-memory store, namespaced `ce:`
    // A Redis-backed store needs an adapter outside the manifest.
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        namespace: config.getOrThrow<string>('redis.cacheNamespace'),
        ttl: 60_000,
      }),
    }),
    AuthModule,
    WorkspacesModule,
    PaymentsModule,
    CampaignsModule,
    DeliveryModule,
    WebhooksModule,
    SseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global pipeline order: guard → interceptor → handler → filter(on error).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
