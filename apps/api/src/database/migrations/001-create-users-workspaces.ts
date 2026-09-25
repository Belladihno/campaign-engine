import { MigrationInterface, QueryRunner } from 'typeorm';

// TRD §8.1 — users + workspaces (1:1). Written as explicit SQL, never
// generated-then-edited: the schema diff for auth must be reviewable
// (TRD §9.1 — migrations over synchronize).
// Class name carries a JS timestamp suffix (required by TypeORM 1.x);
// the 001- filename prefix keeps TRD ordering human-readable.
export class CreateUsersWorkspaces1790357084330 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR NOT NULL UNIQUE,
        password_hash VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE workspaces`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
