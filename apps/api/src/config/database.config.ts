import { registerAs } from '@nestjs/config';
import { requiredEnv } from './validation.js';

// validateEnv() runs before this loads, so requiredEnv() never throws here.
export default registerAs('database', () => ({
  host: requiredEnv('DB_HOST'),
  port: parseInt(requiredEnv('DB_PORT'), 10),
  name: requiredEnv('DB_NAME'),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
}));
