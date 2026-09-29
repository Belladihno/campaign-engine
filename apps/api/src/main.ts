import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw, urlencoded } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // bodyParser:false — the adapter's built-in json() would consume the
  // webhook stream before our raw() runs (body-parser skips when req._body
  // is set), leaving HMAC over re-serialized bytes that never verify.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Raw body for Paystack HMAC verification — scoped to one route and
  // registered before the JSON parser (re-serialized bodies break signatures).
  app.use('/api/v1/webhooks/paystack', raw({ type: 'application/json' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

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
