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
  'AT_WEBHOOK_SECRET',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  // URL mode (Upstash) replaces the parts — requiring both would make
  // every managed deploy fail exactly like this one did.
  const required = config.REDIS_URL
    ? REQUIRED_VARS.filter(
        (key) => key !== 'REDIS_HOST' && key !== 'REDIS_PORT',
      )
    : REQUIRED_VARS;
  const missing = required.filter((key) => {
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

// Typed read for registerAs namespaces. validateEnv() runs before any
// namespace loads, so a missing var here means a programmer error, not a
// user error — hence the throw instead of a silent `as string` cast.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}
