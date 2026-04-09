# ── Build ─────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble AS builder

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace root files so pnpm can resolve workspace:* deps
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/scraper/package.json ./apps/scraper/package.json
COPY apps/scraper/tsconfig.json ./apps/scraper/tsconfig.json

RUN pnpm install --frozen-lockfile

COPY apps/scraper/src ./apps/scraper/src

RUN pnpm --filter=scraper build

# Produce a self-contained prod bundle (resolves workspace:* within context)
RUN pnpm deploy --filter=scraper --prod /deploy

# Copy compiled output (pnpm deploy only copies package files, not dist/)
RUN cp -r /repo/apps/scraper/dist /deploy/dist

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/dist ./dist
COPY --from=builder /deploy/package.json ./package.json

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
