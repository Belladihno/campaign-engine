import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Raw body for Paystack HMAC-SHA256 verification (TRD §9.2).
  // Registered first and scoped to the single webhook route so the global
  // JSON parser never touches these bytes (parsed-then-reserialized bodies
  // break signature verification).
  app.use('/api/v1/webhooks/paystack', raw({ type: 'application/json' }));

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
