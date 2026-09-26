import { MigrationInterface, QueryRunner } from 'typeorm';

// TRD §8.1 + §8.2 — payments ledger plus the workspace_id index that backs
// GET /payments history queries.
export class CreatePayments1790394445180 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        reference VARCHAR NOT NULL UNIQUE,
        amount INTEGER NOT NULL,
        credits_added INTEGER NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_payments_workspace_id ON payments(workspace_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE payments`);
  }
}
