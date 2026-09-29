# Campaign Engine — Architecture

Living document of the system as built. The pitch TRD (`campaign-engine-trd.md`,
private) is the ancestor; this file describes what actually ships.

## 1. System overview

```
Browser (Vercel static React SPA)
  │ HTTPS: REST + SSE (EventSource)
  ▼
API — NestJS 12 ESM, global prefix /api/v1 (Render Docker, self-migrating)
  │                │
  ▼                ▼
Neon Postgres      Upstash Redis (rediss://, BullMQ `bull:` prefix)
(TypeORM,           │
 migrations only)   ▼
              BullMQ DeliveryProcessor (in-process worker)
                    │ Africa's Talking SDK (CJS via createRequire)
                    ▼
              SMS → simulator (sandbox) / handsets (live)

Inbound, server-to-server only:
  Paystack ──POST /webhooks/paystack──▶ verify → dedupe → credit → SSE
  Africa's Talking ──POST /webhooks/africas-talking?secret=──▶ match → advance → SSE
```

One backend process serves HTTP, runs the queue worker, and fans out SSE.
Postgres is durable truth; Redis is ephemeral queue. The browser decides
nothing — it renders contract shapes and holds a JWT.

## 2. Repository layout

```
campaign-engine/
├── apps/
│   ├── api/                     # NestJS backend
│   │   └── src/
│   │       ├── main.ts          # prefix, ValidationPipe, CORS, raw-body route
│   │       ├── app.module.ts    # Config / TypeORM / BullMQ / Cache / feature modules
│   │       ├── config/          # registerAs namespaces + fail-fast validation
│   │       ├── common/          # JwtAuthGuard (+@Public), HttpExceptionFilter,
│   │       │                   # ResponseTransformInterceptor ({data} envelope),
│   │       │                   # CurrentUser decorator
│   │       ├── database/        # data-source.ts (CLI), errors.ts, migrations 001–005
│   │       ├── modules/
│   │       │   ├── auth/        # register (user+workspace tx), login, JwtStrategy
│   │       │   ├── workspaces/  # GET /me, owner-scoped reads (exported)
│   │       │   ├── payments/    # plans, Paystack initiate, history
│   │       │   ├── campaigns/   # CRUD, locking create, idempotency keys, SSE endpoint, sms.ts
│   │       │   ├── delivery/    # AfricasTalkingService + DeliveryProcessor
│   │       │   └── webhooks/    # Paystack + AT receipt handlers
│   │       └── shared/sse/      # global SseService (per-workspace Subjects)
│   └── web/                     # React 19 + Vite + Tailwind v4 + React Router
│       └── src/
│           ├── api/             # typed client, SSE hook, shared types
│           ├── auth/            # context, hook, protected route
│           ├── components/      # AppHeader, toasts
│           ├── pages/           # Auth, Dashboard, CampaignNew, CampaignStatus
│           └── utils/           # sms segments (client mirror), formatting
├── docker-compose.yml           # local Postgres + Redis (override: empty by design)
├── render.yaml                  # Render blueprint (API + env wiring)
└── README.md                    # run + deploy guide
```

## 3. Backend modules and dependencies

```
AppModule
├── ConfigModule (global, validated, namespaces: database/redis/jwt)
├── TypeOrmModule (synchronize:false, autoLoadEntities)
├── BullModule (shared connection; queue `delivery` + retry defaults)
├── CacheModule (global, in-memory, `ce:` namespace)
├── SseModule (global)
├── AuthModule ──exports JwtModule──▶ CampaignsModule (SSE ?token= verify)
├── WorkspacesModule ──exports WorkspacesService
├── PaymentsModule ──exports PaymentsService──▶ WebhooksModule
├── CampaignsModule (owns `delivery` queue registration)
├── DeliveryModule (@Processor('delivery', limiter 10/s))
└── WebhooksModule
```

Cross-module reads go through exported services or repositories, never HTTP.

## 4. Core flows

### 4.1 Campaign send (happy path)

```
POST /campaigns {name, message ≤160, contacts[] E.164} [+ Idempotency-Key]
  → ValidationPipe (400) → JwtAuthGuard → controller (201 / replay 200)
  → tx: claim-or-find key → lock workspace (FOR UPDATE) → segment-billed
    check (422) → deduct → insert campaign (PENDING) + contacts (QUEUED)
    → link key → commit → enqueue send-campaign (post-commit only)
BullMQ worker picks up job
  → tx: lock campaign → PENDING? → PROCESSING (else no-op) → SSE
  → per QUEUED contact: AT send → SENT + at_message_id (+SSE) | FAILED (+SSE)
  → recount from DB → SENT | PARTIALLY_SENT | FAILED → SSE
AT receipts → contact DELIVERED | FAILED + SSE
```

Billing: `credits = unique contacts × SMS segments`
(GSM-7 160/153 septets · UCS-2 70/67 UTF-16 units, extension chars ×2).

### 4.2 Funding

```
POST /payments/initiate {plan} → PENDING row (reference ce_<uuid>)
  → Paystack initialize (+callback_url when FRONTEND_URL set)
  → 201 {checkoutUrl, reference} → browser redirects out
Provider failure → row flipped to `failed`, 502 (never leaks internals)
User pays → POST /webhooks/paystack (raw body)
  → HMAC-SHA256 vs X-Paystack-Signature → 401 on mismatch
  → JSON parse guard → 200-unprocessed on poison
  → charge.success? → insert event_id (UNIQUE → duplicate = 200-skip)
  → payment? confirmed? → tx: payment→confirmed + credits += creditsAdded
  → SSE credit_updated → 200 {received, processed}
```

Credits move only here. Initiate never touches balances.

### 4.3 Recovery paths

- **Orphan sweeper:** boot re-enqueues `PENDING` older than 60s (commit →
  crash before enqueue). Duplicates no-op via the status gate.
- **Job retries:** attempts 3, exponential backoff; resume QUEUED-only.
- **Exhausted retries:** `onFailed` recounts from DB into the honest
  terminal state (never trusts memory across attempts).
- **Replayed creates:** same `Idempotency-Key` → original campaign, 200,
  zero new charges. Lost insert race polls briefly, then 409.

## 5. Database

```
users (id, email UNIQUE, password_hash, created_at)
  1:1 ── workspaces (id, user_id UNIQUE FK⋈, name, credits, created_at)
           1:N ── payments (id, workspace_id FK⋈, reference UNIQUE,
           │       amount[kobo], credits_added, status, created_at)
           │       + idx_payments_workspace_id
           1:N ── campaigns (id, workspace_id FK⋈, name, message, status,
           │       total_contacts, sent_count, failed_count, created/updated)
           │       + idx_campaigns_workspace_id, idx_campaigns_status
           1:N ── contacts (id, campaign_id FK⋈, workspace_id FK⋈, phone,
           │       status, at_message_id NULL, created/updated)
           │       + idx_contacts_campaign_id/_at_message_id/_status
           1:N ── idempotency_keys ("key", workspace_id, campaign_id NULL,
                   UNIQUE(key, workspace), created_at)
                   + idx_idempotency_keys_workspace_id
processed_webhook_events (id, event_id UNIQUE, processed_at)  # global ledger
```

`⋈` = `ON DELETE CASCADE`. All UUIDs `gen_random_uuid()`. No ORM sync,
ever — `migrations/001–005` are the schema. `SELECT … FOR UPDATE` guards
workspace deducts and campaign transitions; the UNIQUE constraints guard
registration races, webhook redeliveries, and create retries.

## 6. Webhook contracts

| | Paystack | Africa's Talking |
|---|---|---|
| Route | `POST /webhooks/paystack` | `POST /webhooks/africas-talking?secret=` |
| Auth | HMAC-SHA256 raw body vs header | query secret vs `AT_WEBHOOK_SECRET` |
| Bad auth | **401** | **200** unprocessed (AT retries non-200 as deliverable) |
| Match key | `data.reference` → payments | `data.id` → contacts.at_message_id |
| DLR mapping | — | `Success` → DELIVERED, else FAILED |
| Poison/unknown | 200 unprocessed | 200 unprocessed |
| Contact states | — | QUEUED → SENT → DELIVERED \| FAILED |

## 7. Frontend

React SPA, no SSR, no state library. `VITE_API_URL` baked at build time
(local `.env`, Vercel env in production — no per-browser setup).

- `api/client.ts` — typed fetch, `{data}` unwrap, single error shape;
  401 redirects mid-session, surfaces backend messages on `/`.
- `api/useWorkspaceEvents.ts` — one EventSource per mount, ref-held
  callbacks (no resubscribe storms), token-change reconnect.
- `auth/` — context + protected routes; JWT in `localStorage`.
- Pages mirror the static shell 1:1: Auth (strength meter, live API
  probe) → Dashboard (live credits, metrics, tiers modal, filterable
  table) → CampaignNew (segment-aware cost, confirm modal, per-submit
  `Idempotency-Key`) → CampaignStatus (computed counts, recipient feed,
  real-frame SSE terminal).
- `utils/sms.ts` — client mirror of server billing (server decides).

## 8. Deployment topology

| Concern | Local | Production |
|---|---|---|
| API | `pnpm dev` :3000 | Render Docker (`runtime` stage, self-migrating boot) |
| Postgres | compose `postgres:16` | Neon (direct host, `DB_SSL=true`) |
| Redis | compose `redis:7` | Upstash (`REDIS_URL`, TLS + `maxRetriesPerRequest:null` forced) |
| Frontend | `pnpm dev:web` / file | Vercel (`apps/web`, `VITE_API_URL`, SPA rewrites) |
| Webhooks in | tunnel | public Render URL (+ `?secret=` for AT) |
| Return URL | — | `FRONTEND_URL` → `/dashboard?funded=1` |

## 9. Invariants (break glass)

1. Balances change only in: campaign deduct (locked tx), webhook credit
   (tx), manual SQL. Nowhere else.
2. No job is enqueued before its transaction commits.
3. No `200`-vs-retry confusion: providers get 200 for everything the
   server cannot heal by retrying.
4. Secrets never leave the server: AT/Paystack keys, JWT secret, webhook
   secrets. The browser holds one JWT.
5. Contact status only moves forward: QUEUED → SENT → DELIVERED | FAILED.
6. Every list is workspace-scoped by the signed token, never by a client
   parameter.
