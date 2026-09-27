# TRD §15.2 — multi-stage build keeps the runtime image lean.
# Build context is the repo root (pnpm workspace needs root manifests).

# Stage 1 — deps
FROM node:22-alpine AS deps
RUN npm install -g pnpm@11
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile

# Stage 2 — build
FROM node:22-alpine AS build
RUN npm install -g pnpm@11
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter api run build
# Self-contained prod deploy: package files (incl. dist) + prod-only deps.
RUN pnpm --filter api deploy --prod /prod/api

# Stage 3 — development (local dev override only, never shipped).
# NOTE: `runtime` is deliberately LAST — platforms that build the default
# target (Render) must get the production image. Compose override pins
# `target: development` explicitly where needed.
FROM node:22-alpine AS development
RUN npm install -g pnpm@11
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "run", "start:dev"]

# Stage 4 — runtime (prod deps only, LAST by design — see above)
FROM node:22-alpine AS runtime
COPY --from=build /prod/api /app/apps/api
WORKDIR /app/apps/api
EXPOSE 3000
# Self-migrating boot: pending migrations apply before serving. Safe to
# re-run (no-op when current) and required on hosts with no release phase.
CMD ["sh", "-c", "node_modules/.bin/typeorm migration:run -d dist/database/data-source.js && node dist/main.js"]
