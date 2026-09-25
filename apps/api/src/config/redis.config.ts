import { registerAs } from '@nestjs/config';

// Single Redis instance, two purposes (TRD §9.4).
// BullMQ keys live under `bull:`, app cache under `ce:`.
export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST as string,
  port: parseInt(process.env.REDIS_PORT as string, 10),
  bullPrefix: 'bull',
  cacheNamespace: 'ce',
}));
