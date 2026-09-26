import { registerAs } from '@nestjs/config';
import { requiredEnv } from './validation.js';

// 24h expiry is a deliberate demo tradeoff (TRD §7.1) — set via JWT_EXPIRY,
// no refresh tokens in this version.
export default registerAs('jwt', () => ({
  secret: requiredEnv('JWT_SECRET'),
  expiry: requiredEnv('JWT_EXPIRY'),
}));
