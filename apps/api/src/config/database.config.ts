import { registerAs } from '@nestjs/config';

// validateEnv() runs before this loads, so required vars are present.
export default registerAs('database', () => ({
  host: process.env.DB_HOST as string,
  port: parseInt(process.env.DB_PORT as string, 10),
  name: process.env.DB_NAME as string,
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
}));
