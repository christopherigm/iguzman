# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune help --docker

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=pruner /app/out/json/ ./
RUN corepack enable pnpm && pnpm i --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN corepack enable pnpm && pnpm exec turbo run build --filter=help --no-daemon
RUN find -L /app/node_modules/.pnpm -maxdepth 5 \
      -path "*/next@*/node_modules/@swc/helpers" -type d \
    | while read src; do \
        rel="${src#/app/}"; \
        dest="/app/apps/help/.next/standalone/${rel}"; \
        mkdir -p "$dest"; \
        cp -rL "$src/." "$dest/"; \
      done

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache curl jq wget
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/help/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/help/.next/static ./apps/help/.next/static
COPY --from=builder /app/apps/help/public ./apps/help/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/help/server.js"]
