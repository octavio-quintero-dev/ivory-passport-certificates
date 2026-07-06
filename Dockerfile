# Multi-stage build. Parsing is pure JS (no openssl at runtime); the only system
# package needed is procps — Crawlee's snapshotter shells out to `ps` to measure
# system load, and node:*-slim doesn't ship it.

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Batch job: runs once and exits. The scheduler (cron/systemd/k8s) invokes it.
CMD ["node", "dist/main.js"]
