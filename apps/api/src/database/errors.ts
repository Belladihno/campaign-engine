import { QueryFailedError } from 'typeorm';

// Postgres unique-violation code (duplicate key value ...).
const PG_UNIQUE_VIOLATION = '23505';

// Single predicate for "duplicate key" failures, used anywhere a pre-check
// can race an insert (register) or where the insert IS the check
// (webhook idempotency). Driven by TypeORM's own error type — the `in`
// narrowing below is language-native, no shape-cast needed.
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const { driverError } = error;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === PG_UNIQUE_VIOLATION
  );
}
