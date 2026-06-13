# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

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
FROM node:22-slim

WORKDIR /app

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/dist ./dist
COPY --from=builder /deploy/package.json ./package.json

# Strip runtime-irrelevant artifacts from node_modules to shrink the layer.
RUN find ./node_modules \( -name "*.map" -o -name "*.d.ts" -o -name "*.md" \) -delete \
    && find ./node_modules -type d \( -name "__tests__" -o -name "test" -o -name "tests" \) \
       -exec rm -rf {} + 2>/dev/null; true

# Install OS-level Chromium system dependencies.
# APT::Install-Recommends "0" prevents apt from pulling in optional packages
# that playwright install-deps would otherwise include (~50 MB saved).
# The browser binary itself is NOT baked into the image — it is downloaded at
# first boot by entrypoint.sh into the PVC mounted at /browsers.
RUN echo 'APT::Install-Recommends "0";' > /etc/apt/apt.conf.d/99no-recommends \
    && node_modules/.bin/playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY apps/scraper/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 4000

ENV NODE_ENV=production
# Playwright looks here for browser binaries; the PVC is mounted at this path.
ENV PLAYWRIGHT_BROWSERS_PATH=/browsers

ENTRYPOINT ["./entrypoint.sh"]
