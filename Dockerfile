# Multi-stage build. Runtime needs only Node + prod deps + compiled dist — no
# system packages (parsing is pure JS; openssl is not a runtime dependency).

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
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Batch job: runs once and exits. The scheduler (cron/systemd/k8s) invokes it.
CMD ["node", "dist/main.js"]
