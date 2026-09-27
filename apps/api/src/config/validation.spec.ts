import { validateEnv } from './validation.js';

const FULL_ENV: Record<string, string> = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'campaign_engine',
  DB_USER: 'postgres',
  DB_PASSWORD: 'secret',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  JWT_SECRET: 'secret-min-32-chars-xxxxxxxxxxxx',
  JWT_EXPIRY: '24h',
  PAYSTACK_SECRET_KEY: 'sk_test_xxxx',
  AT_API_KEY: 'test_key',
  AT_WEBHOOK_SECRET: 'whsec_test',
};

describe('validateEnv', () => {
  it('passes a complete environment through untouched', () => {
    expect(validateEnv({ ...FULL_ENV })).toEqual(FULL_ENV);
  });

  it('throws naming the missing variable', () => {
    const { DB_PASSWORD: _omitted, ...rest } = FULL_ENV;
    expect(() => validateEnv(rest)).toThrow(
      /Missing required environment variables: DB_PASSWORD/,
    );
  });

  // Regression: managed deploys set REDIS_URL instead of parts — validation
  // must not demand both (this exact failure killed a Render boot).
  it('waives REDIS_HOST/REDIS_PORT when REDIS_URL is set', () => {
    const { REDIS_HOST: _h, REDIS_PORT: _p, ...rest } = FULL_ENV;
    expect(() =>
      validateEnv({ ...rest, REDIS_URL: 'rediss://default:x@host:6379' }),
    ).not.toThrow();
  });
});
