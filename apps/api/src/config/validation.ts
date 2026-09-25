// Fail-fast env validation (TRD §16).
// No defaults in code — a missing required var throws during
// ConfigModule init so the app never boots half-configured.
const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'JWT_EXPIRY',
  'PAYSTACK_SECRET_KEY',
  'AT_API_KEY',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See .env.example.`,
    );
  }
  return config;
}
