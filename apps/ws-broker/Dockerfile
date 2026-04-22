# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune ws-broker --docker

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN corepack enable pnpm && pnpm i --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./
RUN corepack enable pnpm && pnpm exec turbo run build --filter=ws-broker --no-daemon

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wsbroker

# Fully self-contained bundle (all deps inlined by tsup — no node_modules needed)
COPY --from=builder --chown=wsbroker:nodejs /app/apps/ws-broker/dist ./dist

USER wsbroker

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "dist/index.js"]
