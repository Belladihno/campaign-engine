import { registerAs } from '@nestjs/config';

// 24h expiry is a deliberate demo tradeoff (TRD §7.1) — set via JWT_EXPIRY,
// no refresh tokens in this version.
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET as string,
  expiry: process.env.JWT_EXPIRY as string,
}));
