// Per-contact delivery state. QUEUED → SENT happens in the worker;
// SENT → DELIVERED | FAILED arrives via the AT receipt webhook (Step 10).
export enum ContactStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}
