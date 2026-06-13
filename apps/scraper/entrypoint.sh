#!/bin/sh
set -e

# Download Chromium into the PVC on first boot; skip if already cached.
# The find check avoids triggering a network call on every pod restart.
if [ -z "$(find "${PLAYWRIGHT_BROWSERS_PATH}" -maxdepth 1 -name 'chromium-*' -type d 2>/dev/null)" ]; then
  echo "[entrypoint] Chromium not cached — downloading to ${PLAYWRIGHT_BROWSERS_PATH}..."
  node_modules/.bin/playwright install chromium
  echo "[entrypoint] Chromium ready."
else
  echo "[entrypoint] Chromium found in cache — skipping install."
fi

exec node dist/index.js
