# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune animals --docker

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
RUN corepack enable pnpm && pnpm exec turbo run build --filter=animals --no-daemon
RUN find -L /app/node_modules/.pnpm -maxdepth 5 \
      -path "*/next@*/node_modules/@swc/helpers" -type d \
    | while read src; do \
        rel="${src#/app/}"; \
        dest="/app/apps/animals/.next/standalone/${rel}"; \
        mkdir -p "$dest"; \
        cp -rL "$src/." "$dest/"; \
      done

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# ffmpeg is here because this app transcodes uploaded sighting clips itself -
# see `lib/video-pipeline.ts` for why that work cannot live in animals-api. It
# adds roughly 100 MB to the image, which is the price of not standing up a
# second service to run one binary.
RUN apk add --no-cache curl jq wget ffmpeg
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/animals/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/animals/.next/static ./apps/animals/.next/static
COPY --from=builder /app/apps/animals/public ./apps/animals/public

# Scratch for in-flight uploads and transcodes.
#
# ⚠ Creating it here is only enough for a plain `docker run`. In the cluster an
# emptyDir is mounted over this path and arrives **root-owned**, so the chown
# below is shadowed and an unprivileged container cannot write to it. What
# actually fixes that is `securityContext.fsGroup` on the pod, which is set in
# `helm/values.yaml` - the two have to agree, and dropping either gives every
# chunk write an EACCES.
RUN mkdir -p /scratch && chown nextjs:nodejs /scratch
ENV VIDEO_SCRATCH_DIR=/scratch

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/animals/server.js"]
