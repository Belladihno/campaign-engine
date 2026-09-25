import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { User } from '../modules/auth/entities/user.entity.js';
import { Workspace } from '../modules/workspaces/entities/workspace.entity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Export it in your shell (see .env.example) before running migrations.`,
    );
  }
  return value;
}

const AppDataSource = new DataSource({
  type: 'postgres',
  host: required('DB_HOST'),
  port: parseInt(required('DB_PORT'), 10),
  database: required('DB_NAME'),
  username: required('DB_USER'),
  password: required('DB_PASSWORD'),
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [User, Workspace],
  migrations: [`${__dirname}/migrations/*.js`],
});

export default AppDataSource;
