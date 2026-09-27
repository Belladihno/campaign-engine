import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs Idempotency-Key on POST /campaigns: retried creates resolve to the
// original campaign instead of double-charging. The UNIQUE(key, workspace)
// constraint serializes concurrent retries (insert-as-check discipline).
export class CreateIdempotencyKeys1790397636700 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" VARCHAR NOT NULL,
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE("key", workspace_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_idempotency_keys_workspace_id
      ON idempotency_keys(workspace_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
  }
}
