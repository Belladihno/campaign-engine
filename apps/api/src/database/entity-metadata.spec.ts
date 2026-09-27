import { getMetadataArgsStorage } from 'typeorm';
import { User } from '../modules/auth/entities/user.entity.js';
import { Workspace } from '../modules/workspaces/entities/workspace.entity.js';
import { Payment } from '../modules/payments/entities/payment.entity.js';
import { Campaign } from '../modules/campaigns/entities/campaign.entity.js';
import { Contact } from '../modules/campaigns/entities/contact.entity.js';
import { IdempotencyKey } from '../modules/campaigns/entities/idempotency-key.entity.js';
import { ProcessedWebhookEvent } from '../modules/webhooks/entities/processed-webhook-event.entity.js';

// Regression net for a real production outage: a comment cleanup glued a
// @Column decorator into its comment line. TypeScript stayed green (a bare
// property is legal), mocks bypass metadata, and the missing column only
// exploded as a NOT NULL violation on Render. This spec reads TypeORM's
// decorator registry directly — no database needed — and fails the moment
// any mapped column disappears.
function columnsOf(target: object): string[] {
  return getMetadataArgsStorage()
    .columns.filter((column) => column.target === target)
    .map((column) => column.propertyName);
}

describe('entity metadata', () => {
  it('maps every column of every table', () => {
    expect(columnsOf(User)).toEqual(
      expect.arrayContaining(['id', 'email', 'passwordHash', 'createdAt']),
    );
    expect(columnsOf(Workspace)).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'name',
        'credits',
        'createdAt',
      ]),
    );
    expect(columnsOf(Payment)).toEqual(
      expect.arrayContaining([
        'id',
        'workspaceId',
        'reference',
        'amount',
        'creditsAdded',
        'status',
        'createdAt',
      ]),
    );
    expect(columnsOf(Campaign)).toEqual(
      expect.arrayContaining([
        'id',
        'workspaceId',
        'name',
        'message',
        'status',
        'totalContacts',
        'sentCount',
        'failedCount',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(columnsOf(Contact)).toEqual(
      expect.arrayContaining([
        'id',
        'campaignId',
        'workspaceId',
        'phone',
        'status',
        'atMessageId',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(columnsOf(IdempotencyKey)).toEqual(
      expect.arrayContaining([
        'id',
        'key',
        'workspaceId',
        'campaignId',
        'createdAt',
      ]),
    );
    expect(columnsOf(ProcessedWebhookEvent)).toEqual(
      expect.arrayContaining(['id', 'eventId', 'processedAt']),
    );
  });
});
