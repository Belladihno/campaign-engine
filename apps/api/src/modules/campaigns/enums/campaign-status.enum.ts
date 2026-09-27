// Campaign lifecycle (TRD §5.4). Enforced in code — no state skips.
// PENDING → PROCESSING → SENT | PARTIALLY_SENT | FAILED
export enum CampaignStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  PARTIALLY_SENT = 'PARTIALLY_SENT',
  FAILED = 'FAILED',
}
