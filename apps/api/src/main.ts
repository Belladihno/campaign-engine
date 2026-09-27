import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Raw body for Paystack HMAC verification — scoped to one route and
  // registered before the JSON parser (re-serialized bodies break signatures).
  app.use('/api/v1/webhooks/paystack', raw({ type: 'application/json' }));

  // Demo shell opens pages via file:// — without CORS every fetch
  // preflights and dies. Open by design; tighten origins in production.
  app.enableCors();

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
