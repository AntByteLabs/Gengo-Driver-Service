# syntax=docker/dockerfile:1
#
# Build context: REPO ROOT (docker-compose.yml sets context: .).
# Required so the @gengo/shared workspace package referenced via
# "file:../../packages/shared" in package.json is reachable.

# ── Stage 1: shared workspace package ───────────────────────────────────────
FROM node:20-alpine AS shared-builder

WORKDIR /repo/packages/shared

COPY packages/shared/package.json packages/shared/package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY packages/shared ./
RUN npm run build


# ── Stage 2: build driver-svc ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /repo/services/driver-svc

COPY --from=shared-builder /repo/packages/shared /repo/packages/shared

COPY services/driver-svc/package.json services/driver-svc/package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY services/driver-svc/tsconfig.json ./
COPY services/driver-svc/src ./src

RUN npm run build


# ── Stage 3: production image ───────────────────────────────────────────────
FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /repo/services/driver-svc

COPY --from=shared-builder /repo/packages/shared /repo/packages/shared

COPY services/driver-svc/package.json services/driver-svc/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts && npm cache clean --force

COPY --from=builder /repo/services/driver-svc/dist ./dist
COPY services/driver-svc/migrations ./migrations

RUN addgroup -S gengo && adduser -S driver-svc -G gengo \
 && mkdir -p ./uploads && chown driver-svc:gengo ./uploads
USER driver-svc

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3004/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
