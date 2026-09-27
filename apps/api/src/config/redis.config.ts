import { registerAs } from '@nestjs/config';
import { requiredEnv } from './validation.js';

// Single Redis instance, two purposes (TRD §9.4).
// BullMQ keys live under `bull:`, app cache under `ce:`.
//
// Two ways to point at Redis (URL wins when set):
//   - REDIS_URL — managed hosts (Upstash). TLS + maxRetriesPerRequest are
//     forced on in this mode: Upstash mandates TLS, and BullMQ refuses to
//     start without maxRetriesPerRequest:null.
//   - REDIS_HOST/PORT (+ optional REDIS_PASSWORD / REDIS_TLS=true) — local
//     Docker and hosts that expose parts instead of a URL.
const url = process.env.REDIS_URL || undefined;

export default registerAs('redis', () => ({
  url,
  host: url ? (process.env.REDIS_HOST ?? '') : requiredEnv('REDIS_HOST'),
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true',
  bullPrefix: 'bull',
  cacheNamespace: 'ce',
}));
