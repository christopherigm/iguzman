#!/usr/bin/env bash
set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
WIN_DIST="$DIST_DIR/windows"

# ── Config ─────────────────────────────────────────────────────────────────
NODE_VERSION="22.14.0"
NODE_ZIP="node-v${NODE_VERSION}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}"
NODE_CACHE="/tmp/${NODE_ZIP}"

FFMPEG_VERSION="7.1.1"
FFMPEG_ZIP="ffmpeg-${FFMPEG_VERSION}-essentials_build.zip"
FFMPEG_URL="https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/${FFMPEG_ZIP}"
FFMPEG_CACHE="/tmp/${FFMPEG_ZIP}"

WINSW_VERSION="2.12.0"
WINSW_EXE="WinSW-x64.exe"
WINSW_URL="https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/${WINSW_EXE}"
WINSW_CACHE="/tmp/WinSW-${WINSW_VERSION}-x64.exe"

STANDALONE_DIR="$SCRIPT_DIR/.next/standalone"
STATIC_DIR="$SCRIPT_DIR/.next/static"
PUBLIC_DIR="$SCRIPT_DIR/public"

echo "▶ Cleaning dist/windows/"
rm -rf "$WIN_DIST"
mkdir -p "$WIN_DIST/app" "$WIN_DIST/node" "$WIN_DIST/ffmpeg"

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

# ── 1.5. Fix broken pnpm symlinks in standalone output ──────────────────────
# Next.js traces deps at build time; if pnpm later resolves a different patch
# version the symlink inside the standalone dir becomes dangling.  Repoint each
# broken link to the highest-version matching package that is actually present.
echo "▶ Fixing broken pnpm symlinks in standalone output…"
PNPM_HOISTED="$STANDALONE_DIR/node_modules/.pnpm/node_modules"
if [ -d "$PNPM_HOISTED" ]; then
    while IFS= read -r -d '' link; do
        [ -e "$link" ] && continue          # skip valid symlinks
        target=$(readlink "$link")
        # Only handle the common pattern  ../PKG@VER/node_modules/PKG
        versioned=$(printf '%s' "$target" | sed 's|^\.\./\([^/]*\)/.*|\1|')
        [ "$versioned" = "$target" ] && continue   # different pattern — skip
        pkg_name="${versioned%@*}"
        pnpm_dir="$STANDALONE_DIR/node_modules/.pnpm"
        # Pick the newest installed version of that package
        actual=$(find "$pnpm_dir" -maxdepth 1 -type d -name "${pkg_name}@*" 2>/dev/null \
                   | sort -V | tail -1)
        if [ -n "$actual" ]; then
            actual_name=$(basename "$actual")
            new_target="${target/$versioned/$actual_name}"
            ln -sf "$new_target" "$link"
            echo "  Fixed: $(basename "$link") $versioned → $actual_name"
        else
            echo "  Warning: no replacement found for broken symlink: $(basename "$link") -> $target"
        fi
    done < <(find "$PNPM_HOISTED" -maxdepth 2 -type l -print0 2>/dev/null)
fi

# ── 2. Assemble dist/windows/app ────────────────────────────────────────────
# Use -L to dereference pnpm symlinks — Windows has no concept of Unix symlinks.
echo "▶ Assembling app bundle…"
cp -rL "$STANDALONE_DIR/." "$WIN_DIST/app/"

mkdir -p "$WIN_DIST/app/apps/server-video-editor/.next/static"
cp -r "$STATIC_DIR/." "$WIN_DIST/app/apps/server-video-editor/.next/static/"

if [ -d "$PUBLIC_DIR" ]; then
    mkdir -p "$WIN_DIST/app/apps/server-video-editor/public"
    cp -r "$PUBLIC_DIR/." "$WIN_DIST/app/apps/server-video-editor/public/"
fi

# ── 3. Fix pnpm-deduplicated Next.js peer packages ──────────────────────────
# Next.js's file-tracing doesn't follow pnpm's virtual store symlinks, so
# @next/* and @swc/* packages land in the pnpm store but not in standalone/.
# Copy each scoped package from the store directly into app/node_modules/.
echo "▶ Copying missing @next/* and @swc/* packages…"
for scope_pattern in "@next+*" "@swc+*"; do
    while IFS= read -r store_dir; do
        # store_dir = .../node_modules/.pnpm/@next+env@1.2.3
        # Extract the scoped package path inside node_modules/
        pkg_dir=$(find -L "$store_dir/node_modules" -mindepth 2 -maxdepth 2 \
            -type d -name "$(echo "$store_dir" | sed 's|.*/@||; s|+|/|; s|@[^/]*$||')" \
            2>/dev/null | head -1)
        # Fallback: derive scope/name from store entry name
        entry=$(basename "$store_dir")              # e.g. @next+env@1.2.3
        scope=$(echo "$entry" | sed 's/+.*//')      # next
        pkg=$(echo "$entry" | sed 's/[^+]*+//; s/@[0-9].*//')  # env
        src="$store_dir/node_modules/@${scope}/${pkg}"
        [ -d "$src" ] || continue
        dest="$WIN_DIST/app/node_modules/@${scope}/${pkg}"
        [ -d "$dest" ] && continue   # already present (traced by Next.js)
        mkdir -p "$WIN_DIST/app/node_modules/@${scope}"
        cp -rL "$src/." "$dest/"
        echo "  → @${scope}/${pkg}"
    done < <(find "$REPO_ROOT/node_modules/.pnpm" -maxdepth 1 -type d \
        -name "$scope_pattern" 2>/dev/null)
done

# ── 4. Compile WS agent ─────────────────────────────────────────────────────
echo "▶ Compiling WS agent…"
cd "$SCRIPT_DIR"
pnpm exec tsc --project tsconfig.agent.json
cp "$DIST_DIR/ws-agent.js"   "$WIN_DIST/"
cp "$DIST_DIR/config.js"     "$WIN_DIST/"
cp "$DIST_DIR/ffmpeg-ops.js" "$WIN_DIST/"
echo "  → dist/windows/ws-agent.js"

# ── 5. Download & extract Node.js for Windows ───────────────────────────────
if [ ! -f "$NODE_CACHE" ]; then
    echo "▶ Downloading Node.js ${NODE_VERSION} (Windows)…"
    curl -fsSL "$NODE_URL" -o "$NODE_CACHE"
else
    echo "▶ Using cached Node.js ${NODE_VERSION} (Windows)"
fi

echo "▶ Extracting Node.js…"
TMP_NODE=$(mktemp -d)
unzip -q -o "$NODE_CACHE" -d "$TMP_NODE"
mv "$TMP_NODE"/node-v*/* "$WIN_DIST/node/"
rm -rf "$TMP_NODE"

# ── 6. Download & extract ffmpeg for Windows ────────────────────────────────
if [ ! -f "$FFMPEG_CACHE" ]; then
    echo "▶ Downloading ffmpeg ${FFMPEG_VERSION} (Windows)…"
    curl -fsSL -L "$FFMPEG_URL" -o "$FFMPEG_CACHE"
else
    echo "▶ Using cached ffmpeg ${FFMPEG_VERSION} (Windows)"
fi

echo "▶ Extracting ffmpeg…"
TMP_FFMPEG=$(mktemp -d)
unzip -q -o "$FFMPEG_CACHE" -d "$TMP_FFMPEG"
FFMPEG_BIN=$(find "$TMP_FFMPEG" -name "ffmpeg.exe" -exec dirname {} \; | head -1)
cp "$FFMPEG_BIN/ffmpeg.exe" "$WIN_DIST/ffmpeg/"
cp "$FFMPEG_BIN/ffprobe.exe" "$WIN_DIST/ffmpeg/" 2>/dev/null || true
rm -rf "$TMP_FFMPEG"

# ── 7. Download WinSW ───────────────────────────────────────────────────────
if [ ! -f "$WINSW_CACHE" ]; then
    echo "▶ Downloading WinSW v${WINSW_VERSION}…"
    curl -fsSL -L "$WINSW_URL" -o "$WINSW_CACHE"
else
    echo "▶ Using cached WinSW v${WINSW_VERSION}"
fi
cp "$WINSW_CACHE" "$WIN_DIST/WinSW-x64.exe"

# ── 8. Generate NSIS installer script ──────────────────────────────────────
# Written to $SCRIPT_DIR/installer.nsi so that File paths inside the script
# are relative to $SCRIPT_DIR (where makensis will be invoked).
# The single-quoted heredoc passes NSIS variables ($INSTDIR, ${VERSION}, etc.)
# through verbatim — they are resolved by NSIS at compile/install time.
echo "▶ Generating NSIS installer script…"
NSI_FILE="$SCRIPT_DIR/installer.nsi"

cat > "$NSI_FILE" << 'NSIS_EOF'
; === Server Video Editor — Windows Installer ===
; Built by build-exe.sh — do not edit manually.

!include "MUI2.nsh"
!include "WinMessages.nsh"

; ── Defines ─────────────────────────────────────────────────────────────────
!define APP_NAME "Server Video Editor"
!define APP_ID   "server-video-editor"
; VERSION is injected via: makensis -DVERSION=x.y.z

; ── Installer metadata ───────────────────────────────────────────────────────
Name             "${APP_NAME} ${VERSION}"
OutFile          "server-video-editor_${VERSION}.exe"
InstallDir       "$PROGRAMFILES64\${APP_ID}"
InstallDirRegKey  HKLM "Software\${APP_ID}" "InstallPath"
RequestExecutionLevel admin
ShowInstDetails   show
ShowUnInstDetails show

; ── MUI pages ────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "${APP_NAME} installed"
!define MUI_FINISHPAGE_TEXT "The agent is running as two Windows services:$\r$\n  \
  server-video-editor-nextjs$\r$\n  \
  server-video-editor-agent$\r$\n$\r$\n\
Note your UUID from config.json in the installation folder$\r$\n\
and register it at:$\r$\nhttps://vd2.iguzman.com.mx"
!define MUI_FINISHPAGE_LINK          "Open registration page"
!define MUI_FINISHPAGE_LINK_LOCATION "https://vd2.iguzman.com.mx"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Install section ───────────────────────────────────────────────────────────
Section "Install" SEC_INSTALL

  ; ── App bundle (Next.js standalone) ───────────────────────────────────────
  SetOutPath "$INSTDIR\app"
  File /r "dist/windows/app/*"

  ; ── WS Agent compiled files ────────────────────────────────────────────────
  SetOutPath "$INSTDIR\app"
  File "dist/windows/ws-agent.js"
  File "dist/windows/config.js"
  File "dist/windows/ffmpeg-ops.js"

  ; ── Bundled Node.js runtime ────────────────────────────────────────────────
  SetOutPath "$INSTDIR\node"
  File /r "dist/windows/node/*"

  ; ── Bundled FFmpeg ─────────────────────────────────────────────────────────
  SetOutPath "$INSTDIR\ffmpeg"
  File "dist/windows/ffmpeg/ffmpeg.exe"
  File /nonfatal "dist/windows/ffmpeg/ffprobe.exe"

  ; ── WinSW service wrapper ──────────────────────────────────────────────────
  ; WinSW v2: each service EXE must share its base name with its XML config.
  SetOutPath "$INSTDIR"
  File "dist/windows/WinSW-x64.exe"
  CopyFiles /SILENT "$INSTDIR\WinSW-x64.exe" "$INSTDIR\nextjs-service.exe"
  CopyFiles /SILENT "$INSTDIR\WinSW-x64.exe" "$INSTDIR\agent-service.exe"

  ; ── First-run config init script ──────────────────────────────────────────
  File "package/init-config.ps1"

  ; ── Log directory ─────────────────────────────────────────────────────────
  CreateDirectory "$INSTDIR\logs"

  ; ── Write WinSW XML — Next.js server ──────────────────────────────────────
  FileOpen $0 "$INSTDIR\nextjs-service.xml" w
  FileWrite $0 "<service>$\r$\n"
  FileWrite $0 "  <id>server-video-editor-nextjs</id>$\r$\n"
  FileWrite $0 "  <name>Server Video Editor (Next.js)</name>$\r$\n"
  FileWrite $0 "  <description>Server Video Editor - Next.js HTTP server.</description>$\r$\n"
  FileWrite $0 "  <executable>$INSTDIR\node\node.exe</executable>$\r$\n"
  FileWrite $0 "  <arguments>$\"$INSTDIR\app\apps\server-video-editor\server.js$\"</arguments>$\r$\n"
  FileWrite $0 "  <env name=$\"NODE_ENV$\" value=$\"production$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"NEXT_TELEMETRY_DISABLED$\" value=$\"1$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"PORT$\" value=$\"3001$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"HOSTNAME$\" value=$\"0.0.0.0$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"VIDEO_DOWNLOADER_URL$\" value=$\"https://vd2.iguzman.com.mx$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"CONFIG_PATH$\" value=$\"$INSTDIR\config.json$\"/>$\r$\n"
  FileWrite $0 "  <log mode=$\"roll$\">$\r$\n"
  FileWrite $0 "    <logpath>$INSTDIR\logs</logpath>$\r$\n"
  FileWrite $0 "  </log>$\r$\n"
  FileWrite $0 "  <onfailure action=$\"restart$\" delay=$\"10 sec$\"/>$\r$\n"
  FileWrite $0 "  <startmode>Automatic</startmode>$\r$\n"
  FileWrite $0 "</service>$\r$\n"
  FileClose $0

  ; ── Write WinSW XML — WS Agent ────────────────────────────────────────────
  FileOpen $0 "$INSTDIR\agent-service.xml" w
  FileWrite $0 "<service>$\r$\n"
  FileWrite $0 "  <id>server-video-editor-agent</id>$\r$\n"
  FileWrite $0 "  <name>Server Video Editor (WS Agent)</name>$\r$\n"
  FileWrite $0 "  <description>Server Video Editor - WebSocket agent.</description>$\r$\n"
  FileWrite $0 "  <executable>$INSTDIR\node\node.exe</executable>$\r$\n"
  FileWrite $0 "  <arguments>$\"$INSTDIR\app\ws-agent.js$\"</arguments>$\r$\n"
  FileWrite $0 "  <env name=$\"NODE_ENV$\" value=$\"production$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"VIDEO_DOWNLOADER_URL$\" value=$\"https://vd2.iguzman.com.mx$\"/>$\r$\n"
  FileWrite $0 "  <env name=$\"CONFIG_PATH$\" value=$\"$INSTDIR\config.json$\"/>$\r$\n"
  FileWrite $0 "  <log mode=$\"roll$\">$\r$\n"
  FileWrite $0 "    <logpath>$INSTDIR\logs</logpath>$\r$\n"
  FileWrite $0 "  </log>$\r$\n"
  FileWrite $0 "  <onfailure action=$\"restart$\" delay=$\"10 sec$\"/>$\r$\n"
  FileWrite $0 "  <startmode>Automatic</startmode>$\r$\n"
  FileWrite $0 "</service>$\r$\n"
  FileClose $0

  ; ── Generate config.json on first install (preserve UUID on upgrade) ───────
  IfFileExists "$INSTDIR\config.json" config_exists config_missing
  config_missing:
    nsExec::ExecToLog "powershell.exe -NoProfile -ExecutionPolicy Bypass \
      -File $\"$INSTDIR\init-config.ps1$\" \
      -ConfigPath $\"$INSTDIR\config.json$\""
  config_exists:

  ; ── Install Windows services ───────────────────────────────────────────────
  nsExec::ExecToLog "$\"$INSTDIR\nextjs-service.exe$\" install"
  nsExec::ExecToLog "$\"$INSTDIR\agent-service.exe$\" install"

  ; ── Start services ─────────────────────────────────────────────────────────
  nsExec::ExecToLog "$\"$INSTDIR\nextjs-service.exe$\" start"
  nsExec::ExecToLog "$\"$INSTDIR\agent-service.exe$\" start"

  ; ── Add $INSTDIR\ffmpeg to system PATH ─────────────────────────────────────
  ReadRegStr $R0 HKLM \
    "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
  StrCpy $R1 "$R0;$INSTDIR\ffmpeg"
  WriteRegExpandStr HKLM \
    "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" "$R1"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ; ── Programs & Features registry entries ──────────────────────────────────
  WriteRegStr HKLM "Software\${APP_ID}" "InstallPath" "$INSTDIR"

  WriteRegStr   HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "DisplayName"     "${APP_NAME} ${VERSION}"
  WriteRegStr   HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "Publisher"       "Christopher Guzman"
  WriteRegStr   HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr   HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "NoModify" 1
  WriteRegDWORD HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" \
    "NoRepair" 1

  WriteUninstaller "$INSTDIR\uninstall.exe"

SectionEnd

; ── Uninstall section ─────────────────────────────────────────────────────────
Section "Uninstall"

  ; Stop and remove services (ignore errors if already stopped/absent)
  nsExec::ExecToLog "$\"$INSTDIR\nextjs-service.exe$\" stop"
  nsExec::ExecToLog "$\"$INSTDIR\agent-service.exe$\" stop"
  nsExec::ExecToLog "$\"$INSTDIR\nextjs-service.exe$\" uninstall"
  nsExec::ExecToLog "$\"$INSTDIR\agent-service.exe$\" uninstall"

  ; Remove installed files
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\ffmpeg"
  RMDir /r "$INSTDIR\logs"
  Delete "$INSTDIR\WinSW-x64.exe"
  Delete "$INSTDIR\nextjs-service.exe"
  Delete "$INSTDIR\nextjs-service.xml"
  Delete "$INSTDIR\agent-service.exe"
  Delete "$INSTDIR\agent-service.xml"
  Delete "$INSTDIR\init-config.ps1"
  Delete "$INSTDIR\uninstall.exe"
  ; config.json is deliberately kept to preserve the agent UUID across reinstalls.
  ; The $INSTDIR\ffmpeg PATH entry is left in place — a stale entry pointing to
  ; a removed directory is harmless on Windows.

  ; Remove registry entries
  DeleteRegKey HKLM \
    "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
  DeleteRegKey HKLM "Software\${APP_ID}"

SectionEnd
NSIS_EOF

# ── 9. Package with makensis ─────────────────────────────────────────────────
echo "▶ Running makensis…"
cd "$SCRIPT_DIR"

if ! command -v makensis >/dev/null 2>&1; then
    echo "✗ makensis not found. Install it:"
    echo "  Ubuntu/Debian: sudo apt install nsis"
    echo "  Fedora:        sudo dnf install mingw64-nsis"
    echo "  macOS:         brew install nsis"
    rm -f "$NSI_FILE"
    exit 1
fi

VERSION=$(node -p "require('./package.json').version")
makensis -DVERSION="$VERSION" installer.nsi

rm -f "$NSI_FILE"

EXE_FILE=$(ls "$SCRIPT_DIR"/server-video-editor_*.exe 2>/dev/null | tail -1)
echo ""
echo "✔ Done: $EXE_FILE"
echo ""
echo "Transfer to a Windows machine and run as Administrator."
echo "The installer will:"
echo "  • Install to C:\\Program Files\\server-video-editor"
echo "  • Bundle Node.js ${NODE_VERSION}, FFmpeg ${FFMPEG_VERSION}"
echo "  • Register two Windows services (nextjs + ws-agent)"
echo "  • Generate a unique agent UUID in config.json"
echo ""
echo "Uninstall via Windows Settings → Apps, or run uninstall.exe."
