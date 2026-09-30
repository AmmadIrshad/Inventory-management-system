# syntax=docker/dockerfile:1
# Targets: `runner` (the web app, default) and `migrator` (runs `prisma migrate deploy` once).

ARG NODE_IMAGE=docker.io/library/node:24-slim

# ── Dependencies, including dev tools (Prisma CLI, TypeScript) ──────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Prisma's schema engine (used for migrations) needs OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma7.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, so the schema must be copied first.
RUN npm ci --no-audit --no-fund

# ── One-shot migration job ──────────────────────────────────────────────────
FROM deps AS migrator
ENV NODE_ENV=production \
    PRISMA_HIDE_UPDATE_MESSAGE=1
USER node
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# ── Production build ────────────────────────────────────────────────────────
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY . .
RUN npm run build

# ── Runtime: only the traced standalone server, running as non-root ────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# start.mjs compares these migration names against the database before starting server.js.
COPY --chown=node:node prisma/migrations ./prisma/migrations
COPY --chown=node:node docker/start.mjs ./start.mjs
USER node
EXPOSE 3000
CMD ["node", "start.mjs"]
