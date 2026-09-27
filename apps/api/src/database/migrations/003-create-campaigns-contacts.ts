import { MigrationInterface, QueryRunner } from 'typeorm';

// TRD §8.1 + §8.2 — campaigns + contacts with every documented index:
// workspace scoping, worker fetches (campaign_id, QUEUED resume), status
// lookups, and the at_message_id key delivery receipts match on.
export class CreateCampaignsContacts1790396497429 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'PENDING',
        total_contacts INTEGER NOT NULL,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        phone VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'QUEUED',
        at_message_id VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_campaigns_workspace_id ON campaigns(workspace_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_campaigns_status ON campaigns(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_contacts_campaign_id ON contacts(campaign_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_contacts_at_message_id ON contacts(at_message_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_contacts_status ON contacts(status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE contacts`);
    await queryRunner.query(`DROP TABLE campaigns`);
  }
}
