import { MigrationInterface, QueryRunner } from 'typeorm';

// TRD §8.1 + §8.2 — exactly-once ledger. The UNIQUE constraint on event_id
// is the idempotency mechanism (TRD §9.3); the unique index it creates
// needs no separate CREATE INDEX.
export class CreateProcessedWebhookEvents1790395326980
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE processed_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR NOT NULL UNIQUE,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE processed_webhook_events`);
  }
}
