#!/usr/bin/env bash
set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

# ── Config ─────────────────────────────────────────────────────────────────
NODE_VERSION="22.14.0"
NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
NODE_CACHE="/tmp/${NODE_TARBALL}"

STANDALONE_DIR="$SCRIPT_DIR/.next/standalone"
STATIC_DIR="$SCRIPT_DIR/.next/static"
PUBLIC_DIR="$SCRIPT_DIR/public"

echo "▶ Cleaning dist/"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/app" "$DIST_DIR/node"

# ── 0. Bump patch version ───────────────────────────────────────────────────
echo "▶ Bumping patch version…"
NEW_VERSION=$(node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$SCRIPT_DIR/package.json', 'utf8'));
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  pkg.version = \`\${major}.\${minor}.\${patch + 1}\`;
  fs.writeFileSync('$SCRIPT_DIR/package.json', JSON.stringify(pkg, null, 2) + '\n');
  process.stdout.write(pkg.version);
")
echo "  → $NEW_VERSION"

# ── 1. Build Next.js ────────────────────────────────────────────────────────
echo "▶ Building Next.js (standalone)…"
cd "$REPO_ROOT"
pnpm build --filter=server-video-editor

# ── 2. Fix @swc/helpers (pnpm symlink not traced by Next.js) ────────────────
echo "▶ Copying @swc/helpers…"
find -L "$REPO_ROOT/node_modules/.pnpm" -maxdepth 5 \
    -path "*/next@*/node_modules/@swc/helpers" -type d \
  | while read -r src; do
      rel="${src#"$REPO_ROOT/"}"
      dest="$STANDALONE_DIR/${rel}"
      mkdir -p "$dest"
      cp -rL "$src/." "$dest/"
    done

# ── 3. Assemble dist/app ────────────────────────────────────────────────────
echo "▶ Assembling app bundle…"
cp -r "$STANDALONE_DIR/." "$DIST_DIR/app/"

# Copy static assets into the expected path inside standalone
mkdir -p "$DIST_DIR/app/apps/server-video-editor/.next/static"
cp -r "$STATIC_DIR/." "$DIST_DIR/app/apps/server-video-editor/.next/static/"

# Copy public directory if it exists
if [ -d "$PUBLIC_DIR" ]; then
    mkdir -p "$DIST_DIR/app/apps/server-video-editor/public"
    cp -r "$PUBLIC_DIR/." "$DIST_DIR/app/apps/server-video-editor/public/"
fi

# ── 4. Compile WS agent ─────────────────────────────────────────────────────
echo "▶ Compiling WS agent…"
cd "$SCRIPT_DIR"
# tsc with tsconfig.agent.json compiles src/{ws-agent,config,ffmpeg-ops}.ts
# to CommonJS in dist/ — no external npm deps, runs on the bundled Node.js 22
pnpm exec tsc --project tsconfig.agent.json
# ws-agent.js lands in dist/; nfpm picks it up from there
echo "  → dist/ws-agent.js"

# ── 6. Download & extract Node.js ───────────────────────────────────────────
if [ ! -f "$NODE_CACHE" ]; then
    echo "▶ Downloading Node.js ${NODE_VERSION}…"
    curl -fsSL "$NODE_URL" -o "$NODE_CACHE"
else
    echo "▶ Using cached Node.js ${NODE_VERSION}"
fi

echo "▶ Extracting Node.js…"
tar -xJf "$NODE_CACHE" -C "$DIST_DIR/node" --strip-components=1

# ── 7. Package with nfpm ────────────────────────────────────────────────────
echo "▶ Running nfpm…"
cd "$SCRIPT_DIR"

if ! command -v nfpm >/dev/null 2>&1; then
    echo "✗ nfpm not found. Install it:"
    echo "  go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest"
    echo "  or: https://nfpm.goreleaser.com/install/"
    exit 1
fi

VERSION=$(node -p "require('./package.json').version") nfpm package --packager deb --target .

DEB_FILE=$(ls "$SCRIPT_DIR"/server-video-editor_*.deb 2>/dev/null | head -1)
echo ""
echo "✔ Done: $DEB_FILE"
echo ""
echo "Install with:"
echo "  sudo dpkg -i $DEB_FILE"
echo "  sudo apt-get install -f   # resolve any missing deps (e.g. ffmpeg)"
