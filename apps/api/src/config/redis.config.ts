import { registerAs } from '@nestjs/config';
import { requiredEnv } from './validation.js';

// Single Redis instance, two purposes (TRD §9.4).
// BullMQ keys live under `bull:`, app cache under `ce:`.
export default registerAs('redis', () => ({
  host: requiredEnv('REDIS_HOST'),
  port: parseInt(requiredEnv('REDIS_PORT'), 10),
  bullPrefix: 'bull',
  cacheNamespace: 'ce',
}));
