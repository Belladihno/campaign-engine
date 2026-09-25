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

# Stage 3 — runtime (prod deps only)
FROM node:22-alpine AS runtime
COPY --from=build /prod/api /app/apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]

# Stage 4 — development (local dev override only, never shipped)
FROM node:22-alpine AS development
RUN npm install -g pnpm@11
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "api", "run", "start:dev"]
