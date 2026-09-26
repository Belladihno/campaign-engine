import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { requiredEnv } from '../config/validation.js';
import { User } from '../modules/auth/entities/user.entity.js';
import { Workspace } from '../modules/workspaces/entities/workspace.entity.js';
import { Payment } from '../modules/payments/entities/payment.entity.js';
import { ProcessedWebhookEvent } from '../modules/webhooks/entities/processed-webhook-event.entity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NOTE: the CLI runs outside Nest, so shell env is required here —
// apps/api/.env is NOT auto-loaded (no dotenv in the manifest).

const AppDataSource = new DataSource({
  type: 'postgres',
  host: requiredEnv('DB_HOST'),
  port: parseInt(requiredEnv('DB_PORT'), 10),
  database: requiredEnv('DB_NAME'),
  username: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [User, Workspace, Payment, ProcessedWebhookEvent],
  migrations: [`${__dirname}/migrations/*.js`],
});

export default AppDataSource;
