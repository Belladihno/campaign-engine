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
import { PaymentsModule } from './modules/payments/payments.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';
import { SseModule } from './shared/sse/sse.module.js';
import databaseConfig from './config/database.config.js';
import jwtConfig from './config/jwt.config.js';
import redisConfig from './config/redis.config.js';
import { validateEnv } from './config/validation.js';

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
        // Migrations only — never synchronize in any environment (TRD §9.1).
        synchronize: false,
        // Feature modules (auth → delivery, steps 7+) register entities
        // via TypeOrmModule.forFeature(); they are picked up automatically.
        autoLoadEntities: true,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('redis.host'),
          port: config.getOrThrow<number>('redis.port'),
        },
        prefix: config.getOrThrow<string>('redis.bullPrefix'),
      }),
    }),
    // NOTE: default in-memory store for now, namespaced `ce:` per TRD §9.4.
    // A Redis-backed Keyv store on the shared ioredis connection is the
    // follow-up once a redis-store adapter is added to the manifest —
    // nothing reads the cache yet, so this is not load-bearing.
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
    WebhooksModule,
    SseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global request pipeline (TRD Step 6). Order of execution:
    // guard → interceptor → handler → interceptor → filter(on error).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
