# Campaign Engine

Multi-tenant SMS campaign delivery API with a live status frontend. Fund via Paystack, dispatch through Africa's Talking, watch every contact flip state in real time.

## What It Demonstrates

- End-to-end backend ownership: auth → workspaces → payments → campaigns → delivery → webhooks
- Third-party integrations: Paystack (charge + HMAC webhook) · Africa's Talking (SMS + receipts)
- Queue-based async work: BullMQ — campaign send never blocks the request
- Relational depth: pessimistic locking, explicit migrations, indexed queries with rationale
- Race-condition handling: idempotent webhooks, idempotent creates, atomic credit operations
- Tests because production burns: 37 unit + 1 e2e (Vitest)

## Architecture

```
apps/web (vanilla HTML/CSS/JS + EventSource)
  ↕ REST + SSE
apps/api (NestJS 12 ESM · /api/v1)
  auth · workspaces · payments · campaigns · delivery · webhooks + shared SseService
  ↕                ↕
PostgreSQL (TypeORM, migrations only)   Redis (BullMQ `bull:` prefix)
  → BullMQ DeliveryProcessor → Africa's Talking SMS
  ← webhooks: Paystack (payment) + AT (delivery receipt, ?secret=)
```

## Core Technical Decisions

- **Migrations over `synchronize`.** TypeORM `synchronize: false` everywhere; schema changes are explicit, reviewable SQL files (`001`–`005`).
- **Raw body for Paystack HMAC.** `express.raw()` scoped to the single webhook route, registered before the JSON parser. Parsed-then-reserialized bodies break signatures.
- **Insert-as-check idempotency.** Paystack redeliveries serialize on `UNIQUE(event_id)`; campaign double-submits resolve via `Idempotency-Key` → `UNIQUE(key, workspace)` (replay answers 200 with the original). No check-then-act anywhere.
- **Pessimistic locking where money moves.** Workspace row lock for credit check + deduct; campaign row lock for status transitions. Optimistic locking was rejected — a double-transition sends duplicate SMS.
- **Credits move only on verified webhooks.** Initiating a charge changes nothing; `charge.success` confirms the payment and increments in the same transaction.
- **Fail fast on insufficient credits.** `422` before any row is written, priced honest: `contacts × SMS segments`.
- **Segment-aware billing.** GSM-7 (160/153) vs UCS-2 (70/67 units) — unicode costs more per recipient because carriers charge per segment.
- **Idempotent worker + boot sweeper.** Retries resume from `QUEUED` only; stale `PENDING` orphans (commit → crash before enqueue) are re-queued on boot. Duplicates no-op via the status gate.
- **Enforced send rate.** `@Processor('delivery', { limiter: 10/sec })` — providers throttle aggressive senders.
- **Poison-proof webhooks.** Signed-but-unparseable bodies ack 200-unprocessed; unknown receipts ack 200. Only bad Paystack signatures 401 (AT answers 200 even there — AT retries non-200 as deliverable).
- **Login timing.** Dummy bcrypt compare on unknown emails so misses cost what hits cost.
- **One Redis, two purposes.** BullMQ under `bull:`; app cache namespaced `ce:` (in-memory store for now).

## Running Locally

```bash
docker compose up -d        # Postgres + Redis (needs Docker/Rancher)
pnpm migrate                # TypeORM migrations (shell env required, e.g.
                            # $env:DB_PASSWORD="..." — apps/api/.env is NOT
                            # read by the CLI; copy .env.example to .env first)
pnpm dev                    # API on :3000 (reads apps/api/.env)
# open apps/web/index.html from disk
```

Sandbox conveniences: `AT_USERNAME=sandbox` sends to the AT simulator (no charge); Paystack test mode + a tunnel (`ngrok http 3000`) for public webhook URLs. Register `CampaignEng` as sender ID or leave `AT_SENDER_ID` blank (unregistered senders are rejected).

## Running Tests

```bash
pnpm test                   # unit (all externals mocked)
pnpm test:e2e               # full boot vs live Postgres + Redis (shell env)
```

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | `{email, password 8–72, workspaceName}` → user + workspace + JWT (201) |
| POST | `/auth/login` | public | credentials → user + workspace + JWT (200) |
| GET | `/workspaces/me` | JWT | `{id, name, credits, createdAt}` |
| POST | `/payments/initiate` | JWT | `{plan}` → `{checkoutUrl, reference}` (201, PENDING) |
| GET | `/payments` | JWT | history, newest first |
| POST | `/campaigns` | JWT | `{name ≤100, message 1–160, contacts[] E.164}` + optional `Idempotency-Key` → campaign + contacts (201, replay 200) |
| GET | `/campaigns` | JWT | list for workspace |
| GET | `/campaigns/:id` | JWT | one campaign with contacts |
| GET | `/campaigns/events?token=<jwt>` | query token | SSE stream (`campaign_updated`, `contact_updated`, `credit_updated`) |
| POST | `/webhooks/paystack` | HMAC | payment confirmation (always 200 except bad signature → 401) |
| POST | `/webhooks/africas-talking?secret=` | query secret | delivery receipt (always 200) |

Plans: `plan_starter` ₦1,000 → 50 · `plan_growth` ₦2,500 → 150 · `plan_pro` ₦5,000 → 350.

## Known Tradeoffs

- **No refresh tokens.** 24h JWT is a deliberate demo scope; rotation is the next step.
- **No credit refund on failed campaigns.** Refund policy belongs to the client; documented next step.
- **SSE token via query param.** `EventSource` cannot send headers; production would use short-lived stream tokens (and stop logging URLs).
- **No rate limiting.** Mentioned here; `@nestjs/throttler` is the next step.
- **SSE is in-memory.** One instance only — second replica needs Redis pub/sub fan-out.
- **No pagination.** Lists are full; cursor pagination once they grow.
- **One user per workspace.** Teams/invites are a next phase.
- **Unicode sender IDs unregistered by default.** `AT_SENDER_ID` blank until approved in the AT dashboard.
