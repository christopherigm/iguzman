#!/usr/bin/env bash
# new-smarttv-app.sh - interactive Samsung Smart TV (Tizen) app scaffold
# Generates a Vite + React SPA under apps/<name> that packages to a Tizen .wgt,
# wired to the @repo/ui-tv component package (Norigin spatial navigation for the
# D-pad). On first run it also seeds packages/ui-tv with starter TV components.
# Run: bash cli/new-smarttv-app/new-smarttv-app.sh   (append "es" for Spanish)

set -euo pipefail

RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# Portable case helpers (macOS bash 3 has no ${var,,} / ${var^^}).
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
uc() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Nuevo App Samsung Smart TV"
    SUBTITLE="Genera el scaffold de una app Tizen (Vite + React + @repo/ui-tv)."
    APP_NAME_PROMPT="Nombre del app (ej. cinelog-tv)"
    APP_NAME_REQUIRED="El nombre es requerido."
    APP_NAME_INVALID="El nombre debe empezar con letra y contener solo minúsculas, números y guiones."
    PORT_PROMPT="Puerto de desarrollo"
    API_PROMPT="URL del API (Django)"
    PALETTE_LABEL="Paleta de acento:"
    PALETTE_ENTER_NUM="Ingresa número"
    STEP_CONFIG="[1/2] Configuración"
    STEP_FILES="[2/2] Generando archivos"
    GENERATE_PROMPT="¿Generar app?"
    ABORTED_MSG="Cancelado."
    LBL_PORT="Puerto"
    LBL_PALETTE="Paleta"
    LBL_API="API"
    LBL_UITV="Paquete ui-tv"
    UITV_NEW="se creará"
    UITV_EXISTS="ya existe (se reutiliza)"
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    INSTALLING_DEPS_MSG="Instalando dependencias (pnpm install)…"
    COPYING_ENV_MSG="Copiando env.example → .env…"
  else
    WELCOME="New Samsung Smart TV App"
    SUBTITLE="Scaffold a Tizen app (Vite + React + @repo/ui-tv)."
    APP_NAME_PROMPT="App name (e.g. cinelog-tv)"
    APP_NAME_REQUIRED="App name is required."
    APP_NAME_INVALID="Name must start with a letter and contain only lowercase letters, numbers, and hyphens."
    PORT_PROMPT="Dev port"
    API_PROMPT="API base URL (Django)"
    PALETTE_LABEL="Accent palette:"
    PALETTE_ENTER_NUM="Enter number"
    STEP_CONFIG="[1/2] Configuration"
    STEP_FILES="[2/2] Generating files"
    GENERATE_PROMPT="Generate app?"
    ABORTED_MSG="Aborted."
    LBL_PORT="Port"
    LBL_PALETTE="Palette"
    LBL_API="API"
    LBL_UITV="ui-tv package"
    UITV_NEW="will be created"
    UITV_EXISTS="already exists (reused)"
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    INSTALLING_DEPS_MSG="Installing dependencies (pnpm install)…"
    COPYING_ENV_MSG="Copying env.example → .env…"
  fi
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── UI helpers ──────────────────────────────────────────────────────────────────

print_header() {
  local line; line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val; IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

confirm_yn() {
  local label="$1" default="${2:-y}"
  local suffix default_upper; default_upper="$(uc "${default}")"; suffix="[Y/N] (${default_upper})"
  printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${suffix}")" >/dev/tty
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${default}}"; local char="${val:0:1}"; char="$(lc "${char}")"
  [[ "${char}" == "y" || "${char}" == "s" ]]
}

select_palette() {
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${PALETTE_LABEL}")" >/dev/tty
  printf "   1) cyan    2) ocean   3) rose    4) emerald\n" >/dev/tty
  printf "   5) amber   6) violet  7) slate   8) coral\n" >/dev/tty
  printf "   9) teal   10) fuchsia\n" >/dev/tty
  printf "  %s (%s): " "$(clr_bold "${PALETTE_ENTER_NUM}")" "$(clr_dim '1')" >/dev/tty
  local n; IFS= read -r n </dev/tty || true; n="${n:-1}"
  case "$n" in
    1)  echo "cyan"    ;; 2)  echo "ocean"   ;; 3)  echo "rose"    ;;
    4)  echo "emerald" ;; 5)  echo "amber"   ;; 6)  echo "violet"  ;;
    7)  echo "slate"   ;; 8)  echo "coral"   ;; 9)  echo "teal"    ;;
    10) echo "fuchsia" ;; *)  echo "cyan"    ;;
  esac
}

palette_to_accent() {
  case "$1" in
    cyan)    echo '#06b6d4' ;; ocean)   echo '#2563eb' ;; rose)    echo '#e11d48' ;;
    emerald) echo '#059669' ;; amber)   echo '#d97706' ;; violet)  echo '#7c3aed' ;;
    slate)   echo '#475569' ;; coral)   echo '#ea580c' ;; teal)    echo '#0d9488' ;;
    fuchsia) echo '#c026d3' ;; *)       echo '#06b6d4' ;;
  esac
}

to_title_case() {
  local str="$1" result="" word
  IFS='-' read -ra words <<< "${str}"
  for word in "${words[@]}"; do [[ -n "${word}" ]] && result+="$(echo "${word:0:1}" | tr '[:lower:]' '[:upper:]')${word:1} "; done
  echo "${result% }"
}

validate_app_name() {
  local n="$1"
  [[ -z "${n}" ]]                      && echo "${APP_NAME_REQUIRED}" && return
  [[ ! "${n}" =~ ^[a-z][a-z0-9-]*$ ]] && echo "${APP_NAME_INVALID}"  && return
  [[ -d "${repo_root}/apps/${n}" ]]    && echo "Directory apps/${n} already exists." && return
  echo ""
}

# ── App file generators ─────────────────────────────────────────────────────────
# Globals used by generators: name title port palette accent api_url pkg_id app_id_name

gen_app_package_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{
  "name": "${name}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite --port ${port} --host",
    "build": "vite build",
    "preview": "vite preview --port ${port}",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/ui-tv": "workspace:*",
    "@noriginmedia/norigin-spatial-navigation": "^3.2.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.39.4",
    "typescript": "6.0.3",
    "vite": "^6.0.0"
  }
}
EOF
}

gen_app_vite_config() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Tizen runs the packaged .wgt from the widget's local filesystem (an opaque,
// file://-like origin). ES-module scripts are fetched with CORS semantics, so a
// \`<script type="module" crossorigin>\` entry is blocked there and never executes
// - React never mounts and only the static HTML renders. This plugin rewrites the
// entry into a classic <script>, which loads fine from the filesystem. Pair it
// with an IIFE bundle (see build.rollupOptions.output.format) so the body has no
// module syntax.
function tizenClassicScript(): Plugin {
  return {
    name: 'tizen-classic-script',
    transformIndexHtml: {
      order: 'post',
      // \`defer\` preserves the module script's implicit "run after DOM parsed"
      // timing - a plain head script would run before #root exists and throw.
      handler: (html) =>
        html
          .replace(/<script type="module"/g, '<script defer')
          .replace(/\s+crossorigin/g, ''),
    },
  };
}

// base: './' keeps asset URLs relative so the packaged .wgt loads from the TV
// filesystem. target es2015 stays safe across older Tizen webviews.
export default defineConfig({
  base: './',
  plugins: [react(), tizenClassicScript()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: ${port}, host: true },
  build: {
    outDir: 'dist',
    target: 'es2015',
    // No module preload links (they assume a module entry).
    modulePreload: false,
    // Single self-contained classic bundle - no module imports between chunks.
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
EOF
}

gen_app_index_html() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
}

gen_app_index_css() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
/* Palette/theme variable contract shared with @repo/ui-tv tokens.css. */
:root {
  --accent: ${accent};
  --background: #0b0b0f;
  --foreground: #f5f5f7;
  --surface-2: #1a1a22;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; width: 100%; }

body {
  background: var(--background);
  color: var(--foreground);
  font-family: 'Roboto', system-ui, sans-serif;
  overflow: hidden;
}

/* TV overscan-safe area for 1080p (5% margin). */
#root { padding: 48px; }
EOF
}

gen_app_tsconfig() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSONEOF'
{
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["es2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
JSONEOF
}

gen_app_eslint() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSEOF'
import { config } from '@repo/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config[]} */
export default [...config, { ignores: ['dist'] }];
JSEOF
}

gen_app_gitignore() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TXTEOF'
node_modules
dist
.buildResult
.DS_Store
*.wgt
*.tsbuildinfo
.env
.env.*
!env.example
TXTEOF
}

gen_app_env_example() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
# Vite exposes only VITE_-prefixed vars to the client bundle.
VITE_API_URL=${api_url}
EOF
}

gen_app_config_xml() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://iguzman.com.mx/${name}" version="1.0.0" viewmodes="maximized">
    <tizen:application id="${pkg_id}.${app_id_name}" package="${pkg_id}" required_version="6.0"/>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
    <icon src="icon.png"/>
    <name>${title}</name>
    <tizen:privilege name="http://tizen.org/privilege/application.launch"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:profile name="tv"/>
    <tizen:setting screen-orientation="landscape" context-menu="enable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
    <access origin="*" subdomains="true"/>
</widget>
EOF
}

# Eclipse project descriptor. Tizen Studio's Import Wizard lists a folder as a
# project only when its .project declares the Tizen WebNature/WebBuilder; without
# these the wizard accepts the dist/ folder but shows an empty project list.
gen_app_project() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
	<name>${name}</name>
	<comment></comment>
	<projects>
	</projects>
	<buildSpec>
		<buildCommand>
			<name>org.eclipse.wst.jsdt.core.javascriptValidator</name>
			<arguments>
			</arguments>
		</buildCommand>
		<buildCommand>
			<name>org.tizen.web.project.builder.WebBuilder</name>
			<arguments>
			</arguments>
		</buildCommand>
	</buildSpec>
	<natures>
		<nature>org.tizen.web.project.builder.WebNature</nature>
		<nature>org.eclipse.wst.jsdt.core.jsNature</nature>
	</natures>
</projectDescription>
EOF
}

# Tizen project metadata; carries the build profile so the Import Wizard
# pre-selects tv-samsung instead of leaving the profile blank.
# The platform name must match an installed TV platform; current Tizen Studio
# ships "tv-samsung-10.0" (the legacy generic "tv-0.1" tag is no longer
# recognised and triggers "Cannot support tv-0.1 ..."). The concrete TV API
# level is still pinned by required_version in config.xml.
# The empty <blacklist/> child is mandatory: Tizen Studio's TprojectHandler
# dereferences it on launch, so a self-closed <package/> throws a
# NullPointerException ("An internal error occurred during: Launching ...").
gen_app_tproject() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'EOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tproject xmlns="http://www.tizen.org/tproject">
    <platforms>
        <platform>
            <name>tv-samsung-10.0</name>
        </platform>
    </platforms>
    <package>
        <blacklist/>
    </package>
</tproject>
EOF
}

gen_app_main_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initSpatialNav } from '@repo/ui-tv/spatial-nav-provider';
import { I18nProvider } from './i18n/provider';
import { App } from './App';
import './index.css';

// Initialise D-pad spatial navigation once, before the first render.
initSpatialNav();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// HashRouter keeps routing working when the .wgt is served from the TV
// filesystem (no HTML5 history server).
createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </StrictMode>,
);
TSEOF
}

gen_app_app_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { Routes, Route } from 'react-router-dom';
import { Home } from './screens/home';
import { DevScreenGuide } from './dev-screen-guide';

export function App() {
  return (
    <>
      {/* Dev-only: frames the 1920x1080 TV screen + safe area in the browser.
          Compiled out of the production .wgt via import.meta.env.DEV. */}
      {import.meta.env.DEV && <DevScreenGuide />}
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  );
}
TSEOF
}

gen_app_dev_screen_guide_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { useEffect } from "react";
import "./dev-screen-guide.css";

// Dev-only visual guide. Outlines the 1920x1080 TV screen bounds and the inner
// overscan-safe area so the layout can be checked in a desktop browser, where
// the `width=1920` viewport meta is ignored. Render it behind
// `import.meta.env.DEV` (see App.tsx) so it is excluded from the production
// .wgt shipped to the TV/emulator.
export function DevScreenGuide() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dev-tv-frame");
    return () => root.classList.remove("dev-tv-frame");
  }, []);

  // Positioned absolutely against #root (made `position: relative` by the
  // frame styles), so labels track the frame edges at any window size.
  return (
    <div aria-hidden="true">
      <span className="dev-tv-frame__label dev-tv-frame__label--screen">
        TV screen · 1920×1080
      </span>
      <span className="dev-tv-frame__label dev-tv-frame__label--safe">
        Safe area
      </span>
    </div>
  );
}
TSEOF
}

gen_app_dev_screen_guide_css() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'CSSEOF'
/* Dev-only TV-screen guides. Activated by the `.dev-tv-frame` class that
   DevScreenGuide adds to <html> while `vite dev` is running. None of this is
   present in the built .wgt: the component (and this stylesheet's import) are
   gated behind `import.meta.env.DEV` and tree-shaken out of production. */

/* Lock the desktop-browser preview to an exact 1920x1080 box so it mirrors the
   real TV regardless of window size. `safe center` keeps the frame reachable
   (no clipped top/left) when the browser window is smaller than the frame. */
.dev-tv-frame body {
  display: flex;
  align-items: safe center;
  justify-content: safe center;
  overflow: auto;
  background: #000;
}

.dev-tv-frame #root {
  position: relative;
  flex: 0 0 auto;
  width: 1920px;
  height: 1080px;
  /* Outer border = the 1920x1080 TV screen bounds. `outline` draws over the
     edge without shifting the existing layout. */
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Inner border = the overscan-safe area. The inset matches #root's existing
   48px padding, so this line sits exactly where content begins. */
.dev-tv-frame #root::after {
  content: "";
  position: absolute;
  inset: 48px;
  border: 1px dashed rgba(245, 245, 247, 0.45);
  pointer-events: none;
  z-index: 9998;
}

.dev-tv-frame__label {
  position: absolute;
  z-index: 9999;
  padding: 2px 6px;
  font-family: system-ui, sans-serif;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
}

.dev-tv-frame__label--screen {
  top: 4px;
  left: 8px;
  color: var(--accent);
}

.dev-tv-frame__label--safe {
  top: 58px;
  left: 100px;
  color: rgba(245, 245, 247, 0.55);
}
CSSEOF
}

gen_app_home_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { useState } from 'react';
import { Focusable } from '@repo/ui-tv/focusable';
import { TvButton } from '@repo/ui-tv/tv-button';
import { TvTextInput } from '@repo/ui-tv/tv-text-input';
import { TvText } from '@repo/ui-tv/tv-typography';
import { launchDigitalCopy } from '@/lib/launch-app';
import { useT } from '@/i18n/provider';

export function Home() {
  const { t } = useT();
  const [query, setQuery] = useState('');

  return (
    <Focusable group focusOnMount>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40, maxWidth: 1825 }}>
        <TvText variant="hero">{t('homeTitle')}</TvText>

        <TvTextInput
          ariaLabel={t('search')}
          placeholder={t('search')}
          value={query}
          onChange={setQuery}
        />

        <div style={{ display: 'flex', gap: 24 }}>
          <TvButton onPress={() => launchDigitalCopy('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}>
            {t('openYoutube')}
          </TvButton>
        </div>
      </div>
    </Focusable>
  );
}
TSEOF
}

gen_app_launch_app() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
/**
 * Best-effort launch of a digital-copy URL into the matching Samsung TV app.
 *
 * Launching the target app (YouTube, Prime, etc.) is supported via the Tizen
 * ApplicationControl API. For YouTube we can also deep-link to a *specific*
 * video: the Tizen YouTube app parses a `PAYLOAD` app-control entry of the form
 * `v=<videoId>` passed with the `default` operation. The generic `view`
 * operation with a `url` data key (used before) is ignored by YouTube and only
 * opens its home screen. Falls back to a new tab when not running on Tizen
 * (e.g. browser dev).
 */

// Tizen numeric app IDs (region-dependent; verify on the target fleet).
const HOST_TO_APP_ID: Record<string, string> = {
  'youtube.com': '111299001912',
  'youtu.be': '111299001912',
  'm.youtube.com': '111299001912',
  'primevideo.com': '3201512006785',
  'amazon.com': '3201512006785',
  'netflix.com': '3201907018807',
  'disneyplus.com': '3201901017640',
};

const YOUTUBE_APP_ID = '111299001912';

export function appIdForUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '');
    return HOST_TO_APP_ID[host] ?? null;
  } catch {
    return null;
  }
}

/** Extract the YouTube video id from any common YouTube URL shape. */
export function youtubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery) return fromQuery;
      // /embed/<id>, /shorts/<id>, /v/<id>
      const match = url.pathname.match(/^\/(?:embed|shorts|v)\/([^/?]+)/);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function launchDigitalCopy(rawUrl: string): void {
  const tizen = window.tizen;
  const appId = appIdForUrl(rawUrl);

  if (!tizen || !appId) {
    // Dev fallback (browser) or unknown host: open in a new tab.
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // YouTube: deep-link straight to the video via the PAYLOAD `v=<id>` contract.
  const videoId = appId === YOUTUBE_APP_ID ? youtubeVideoId(rawUrl) : null;
  const control = videoId
    ? new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/default',
        null,
        null,
        null,
        [new tizen.ApplicationControlData('PAYLOAD', [`v=${videoId}`])],
      )
    : new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        rawUrl,
        null,
        null,
        [new tizen.ApplicationControlData('url', [rawUrl])],
      );

  // If launchAppControl fails, fall back to a plain launch of the app.
  tizen.application.launchAppControl(
    control,
    appId,
    () => undefined,
    () => tizen.application.launch(appId),
  );
}
TSEOF
}

gen_app_tizen_dts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
// Minimal ambient typings for the Tizen Web Device API surface this app uses.
export {};

interface TizenApplicationControlData {
  key: string;
  value: string[];
}

interface TizenApplicationControl {
  operation: string;
}

interface TizenApplicationManager {
  launch(id: string, onSuccess?: () => void, onError?: (error: unknown) => void): void;
  launchAppControl(
    control: TizenApplicationControl,
    id?: string | null,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
    replyCallback?: unknown,
  ): void;
}

interface TizenStatic {
  application: TizenApplicationManager;
  ApplicationControl: new (
    operation: string,
    uri?: string | null,
    mime?: string | null,
    category?: string | null,
    data?: TizenApplicationControlData[],
  ) => TizenApplicationControl;
  ApplicationControlData: new (key: string, value: string[]) => TizenApplicationControlData;
}

declare global {
  interface Window {
    tizen?: TizenStatic;
  }
}
TSEOF
}

gen_app_i18n_provider() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import en from './messages/en.json';
import es from './messages/es.json';

const MESSAGES = { en, es } as const;
type Locale = keyof typeof MESSAGES;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    navigator.language.startsWith('es') ? 'es' : 'en',
  );

  const value = useMemo<I18nContextValue>(() => {
    const dict = MESSAGES[locale] as Record<string, string>;
    return { locale, setLocale, t: (key: string) => dict[key] ?? key };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within <I18nProvider>');
  return ctx;
}
TSEOF
}

gen_app_messages_en() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{
  "homeTitle": "${title}",
  "search": "Search a movie",
  "openYoutube": "Open YouTube"
}
EOF
}

gen_app_messages_es() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
{
  "homeTitle": "${title}",
  "search": "Buscar una película",
  "openYoutube": "Abrir YouTube"
}
EOF
}

gen_app_readme() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
# ${title} (Samsung Smart TV)

Tizen web app scaffolded by cli/new-smarttv-app. Built with Vite + React and the
@repo/ui-tv component package (Norigin spatial navigation for D-pad focus). This
app is packaged with Samsung tooling, not Docker/Helm.

## Develop in a browser

    pnpm dev --filter=${name}

Open the printed localhost URL. App-launch calls fall back to opening a new tab
when not running on a real TV.

## Build the web bundle

    pnpm build --filter=${name}

Output goes to apps/${name}/dist.

## Package + run on a Samsung TV (Tizen Studio / tizen CLI)

Install Tizen Studio and create a TV certificate profile first. Then:

    # from apps/${name}
    cp config.xml icon.png .project .tproject dist/
    tizen package -t wgt -s <your-cert-profile> -- dist
    tizen install -n dist/${app_id_name}.wgt -t <tv-device>
    tizen run -p ${pkg_id} -t <tv-device>

Connect a physical TV in Developer Mode with: sdb connect <tv-ip>

## Notes

- config.xml is the Tizen manifest. The package id is a placeholder; Tizen Studio
  rewrites it to match your certificate author when you sign.
- .project / .tproject are the Tizen Studio project metadata. The Import Wizard
  (File > Import > Tizen > Tizen Project) only lists dist/ as a project when these
  are present, so copy them into dist/ alongside config.xml before importing.
- Add an icon.png (512x512) at the app root before packaging.
- Deep-linking into a specific video is not a supported Tizen contract; launching
  the target app (YouTube, Prime, etc.) is best-effort. See src/lib/launch-app.ts.
EOF
}

# ── @repo/ui-tv package generators (seeded once) ─────────────────────────────────

gen_uitv_package_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSONEOF'
{
  "name": "@repo/ui-tv",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./*": "./src/*.tsx",
    "./tokens.css": "./src/tokens.css",
    "./remote-keys": "./src/remote-keys.ts"
  },
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": ">=19",
    "react-dom": ">=19"
  },
  "dependencies": {
    "@noriginmedia/norigin-spatial-navigation": "^3.2.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "^9.39.4",
    "typescript": "6.0.3"
  }
}
JSONEOF
}

gen_uitv_tsconfig() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSONEOF'
{
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
JSONEOF
}

gen_uitv_eslint() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSEOF'
import { config } from '@repo/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config[]} */
export default [...config, { ignores: ['dist'] }];
JSEOF
}

gen_uitv_css_dts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
TSEOF
}

gen_uitv_tokens_css() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'CSSEOF'
/* TV component tokens. Consumes the palette variable contract (--accent,
   --foreground, --surface-2) that the host app defines in its index.css. */
:root {
  --tv-focus-color: var(--accent, #06b6d4);
  --tv-radius: 12px;
}

.tv-focusable {
  outline: none;
  border-radius: var(--tv-radius);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tv-focusable--focused {
  box-shadow: 0 0 0 4px var(--tv-focus-color);
  transform: scale(1.05);
}

.tv-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px 36px;
  border: none;
  cursor: pointer;
  background: var(--surface-2, #1a1a22);
  color: var(--foreground, #f5f5f7);
  font-size: 1.5rem;
  font-weight: 600;
}

.tv-text-input {
  display: block;
  background: var(--surface-2, #1a1a22);
  padding: 6px;
}
.tv-text-input__field {
  width: 100%;
  padding: 16px 20px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--foreground, #f5f5f7);
  font-size: 1.5rem;
}
.tv-text-input__field::placeholder {
  color: color-mix(in srgb, var(--foreground, #f5f5f7) 50%, transparent);
}

.tv-text { color: var(--foreground, #f5f5f7); display: inline-block; }
.tv-text--hero { font-size: 3.5rem; font-weight: 700; line-height: 1.1; }
.tv-text--title { font-size: 2.25rem; font-weight: 700; }
.tv-text--body { font-size: 1.5rem; font-weight: 400; }
.tv-text--label { font-size: 1.125rem; font-weight: 500; opacity: 0.7; }
CSSEOF
}

gen_uitv_spatial_provider() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { init } from '@noriginmedia/norigin-spatial-navigation';

let started = false;

/**
 * Initialise Norigin spatial navigation once for the whole app. Call from the
 * entry point before the first render. Safe to call more than once.
 *
 * Tizen TV remotes emit standard arrow + enter keycodes, which Norigin maps by
 * default. Back (10009) is handled per-screen via `@repo/ui-tv/remote-keys`.
 */
export function initSpatialNav(): void {
  if (started) return;
  started = true;
  init({ debug: false, visualDebug: false });
}
TSEOF
}

gen_uitv_focusable() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

interface FocusableRenderProps {
  focused: boolean;
}

export interface FocusableProps {
  onEnterPress?: () => void;
  onFocus?: () => void;
  className?: string;
  /** Wrap children in a FocusContext so they form a navigable group. */
  group?: boolean;
  /**
   * Grab the initial D-pad focus when this mounts. Norigin focuses nothing by
   * default, so without a node claiming focus the remote's arrows and Enter are
   * all no-ops. Set this on the top-level container of a screen. For a `group`,
   * focus delegates to the first focusable child.
   */
  focusOnMount?: boolean;
  children: ReactNode | ((props: FocusableRenderProps) => ReactNode);
}

/**
 * Generic D-pad-focusable wrapper. Use `group` for a container whose children
 * should be navigated as a unit; otherwise it is a single focusable item.
 */
export function Focusable({
  onEnterPress,
  onFocus,
  className,
  group,
  focusOnMount,
  children,
}: FocusableProps) {
  const { ref, focused, focusKey, focusSelf } = useFocusable({
    onEnterPress,
    onFocus,
    trackChildren: group,
  });

  useEffect(() => {
    if (focusOnMount) focusSelf();
  }, [focusOnMount, focusSelf]);

  const cls = ['tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');

  const content = typeof children === 'function' ? children({ focused }) : children;
  const node = (
    <div ref={ref as Ref<HTMLDivElement>} className={cls}>
      {content}
    </div>
  );

  return group ? <FocusContext.Provider value={focusKey}>{node}</FocusContext.Provider> : node;
}
TSEOF
}

gen_uitv_tv_button() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import type { ReactNode, Ref } from 'react';
import './tokens.css';

export interface TvButtonProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
}

/** D-pad-focusable button. Enter on the remote triggers `onPress`. */
export function TvButton({ children, onPress, className }: TvButtonProps) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  const cls = ['tv-button', 'tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref as Ref<HTMLButtonElement>} className={cls} onClick={onPress} type="button">
      {children}
    </button>
  );
}
TSEOF
}

gen_uitv_tv_text_input() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useRef } from 'react';
import type { Ref } from 'react';
import './tokens.css';

export interface TvTextInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Required for accessibility - there is no visible <label> on TV. */
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * D-pad-focusable text field. There is no "native TV input" widget on Tizen -
 * pressing Enter focuses a plain <input>, which opens the TV's system on-screen
 * keyboard (IME).
 */
export function TvTextInput({ value, onChange, ariaLabel, placeholder, className }: TvTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { ref, focused } = useFocusable({ onEnterPress: () => inputRef.current?.focus() });

  const cls = ['tv-text-input', 'tv-focusable', focused ? 'tv-focusable--focused' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={cls}>
      <input
        ref={inputRef}
        className="tv-text-input__field"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
TSEOF
}

gen_uitv_tv_typography() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import type { ReactNode } from 'react';
import './tokens.css';

export type TvTextVariant = 'hero' | 'title' | 'body' | 'label';

export interface TvTextProps {
  variant?: TvTextVariant;
  children: ReactNode;
  className?: string;
}

/** 10-foot text scale. Sizing lives in tokens.css (.tv-text--*). */
export function TvText({ variant = 'body', children, className }: TvTextProps) {
  const cls = ['tv-text', `tv-text--${variant}`, className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
TSEOF
}

gen_uitv_remote_keys() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
/** Samsung TV remote key codes (KeyboardEvent.keyCode). */
export const TV_KEYS = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 10009,
  MEDIA_PLAY_PAUSE: 10252,
} as const;

/**
 * Register a handler for the remote Back button. Returns an unsubscribe fn.
 *
 * @example
 * useEffect(() => onBackButton(() => navigate(-1)), []);
 */
export function onBackButton(handler: () => void): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.keyCode === TV_KEYS.BACK) handler();
  };
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}
TSEOF
}

gen_uitv_claude_md() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'MDEOF'
# `@repo/ui-tv` - Smart TV Component Library

TV-tuned React primitives for Tizen (Samsung Smart TV) apps. Separate from
`@repo/ui` because the web package depends on `next/*` (image, link, navigation,
next-intl) which does not run in a Vite/Tizen SPA, and because every interactive
TV element needs D-pad focus handling that pointer-driven web components lack.

## What "native" means on TV

Tizen has **no native HTML UI widgets**. A Tizen web app renders ordinary HTML.
The only "native" affordance is the system on-screen keyboard (IME), which opens
when a plain `<input>` is focused. `TvTextInput` wraps that.

## Components

| Import | Purpose |
| ------ | ------- |
| `@repo/ui-tv/spatial-nav-provider` → `initSpatialNav()` | Init Norigin spatial navigation once at startup. |
| `@repo/ui-tv/focusable` → `Focusable` | Generic D-pad-focusable wrapper; `group` for navigable containers. |
| `@repo/ui-tv/tv-button` → `TvButton` | Focusable button (`onPress` fires on remote Enter). |
| `@repo/ui-tv/tv-text-input` → `TvTextInput` | Focusable field; Enter opens the TV IME. Requires `ariaLabel`. |
| `@repo/ui-tv/tv-typography` → `TvText` | 10-foot text scale (`hero`/`title`/`body`/`label`). |
| `@repo/ui-tv/remote-keys` → `TV_KEYS`, `onBackButton` | Remote key codes + Back-button helper. |

## Conventions

- Focus engine: `@noriginmedia/norigin-spatial-navigation` (`useFocusable`).
- Styling: `tokens.css` (sizing/focus ring). It consumes the host app's palette
  variable contract (`--accent`, `--foreground`, `--surface-2`).
- Every interactive component composes the `.tv-focusable` / `.tv-focusable--focused`
  classes so the focus ring is consistent.
- No `next/*` imports - this package must stay bundler-agnostic for Vite/Tizen.
MDEOF
}

create_uitv_package() {
  local pkg="${repo_root}/packages/ui-tv"
  gen_uitv_package_json     "${pkg}/package.json"
  gen_uitv_tsconfig         "${pkg}/tsconfig.json"
  gen_uitv_eslint           "${pkg}/eslint.config.mjs"
  gen_uitv_css_dts          "${pkg}/src/css.d.ts"
  gen_uitv_tokens_css       "${pkg}/src/tokens.css"
  gen_uitv_spatial_provider "${pkg}/src/spatial-nav-provider.tsx"
  gen_uitv_focusable        "${pkg}/src/focusable.tsx"
  gen_uitv_tv_button        "${pkg}/src/tv-button.tsx"
  gen_uitv_tv_text_input    "${pkg}/src/tv-text-input.tsx"
  gen_uitv_tv_typography    "${pkg}/src/tv-typography.tsx"
  gen_uitv_remote_keys      "${pkg}/src/remote-keys.ts"
  gen_uitv_claude_md        "${pkg}/CLAUDE.md"
}

create_app() {
  local app="${repo_root}/apps/${name}"
  gen_app_package_json "${app}/package.json"
  gen_app_vite_config  "${app}/vite.config.ts"
  gen_app_index_html   "${app}/index.html"
  gen_app_index_css    "${app}/src/index.css"
  gen_app_tsconfig     "${app}/tsconfig.json"
  gen_app_eslint       "${app}/eslint.config.js"
  gen_app_gitignore    "${app}/.gitignore"
  gen_app_env_example  "${app}/env.example"
  gen_app_config_xml   "${app}/config.xml"
  gen_app_project      "${app}/.project"
  gen_app_tproject     "${app}/.tproject"
  gen_app_main_tsx     "${app}/src/main.tsx"
  gen_app_app_tsx      "${app}/src/App.tsx"
  gen_app_dev_screen_guide_tsx "${app}/src/dev-screen-guide.tsx"
  gen_app_dev_screen_guide_css "${app}/src/dev-screen-guide.css"
  gen_app_home_tsx     "${app}/src/screens/home.tsx"
  gen_app_launch_app   "${app}/src/lib/launch-app.ts"
  gen_app_tizen_dts    "${app}/src/lib/tizen.d.ts"
  gen_app_i18n_provider "${app}/src/i18n/provider.tsx"
  gen_app_messages_en  "${app}/src/i18n/messages/en.json"
  gen_app_messages_es  "${app}/src/i18n/messages/es.json"
  gen_app_readme       "${app}/README.md"
}

# ── Orchestration ───────────────────────────────────────────────────────────────

main() {
  local lang="en"; [[ "${1:-}" == "es" ]] && lang="es"
  setup_strings "${lang}"
  print_header

  echo "  $(clr_bold "${STEP_CONFIG}")"
  echo ""

  # App name (loop until valid).
  local err
  while true; do
    name="$(prompt_visible "${APP_NAME_PROMPT}")"
    name="$(lc "${name}")"
    err="$(validate_app_name "${name}")"
    [[ -z "${err}" ]] && break
    printf "  %s\n" "$(clr_red "${err}")" >/dev/tty
  done

  port="$(prompt_visible "${PORT_PROMPT}" "4180")"
  api_url="$(prompt_visible "${API_PROMPT}" "http://localhost:8000")"
  palette="$(select_palette)"
  accent="$(palette_to_accent "${palette}")"

  title="$(to_title_case "${name}")"
  app_id_name="$(printf '%s' "${title}" | tr -dc 'a-zA-Z0-9')"
  pkg_id="$(printf '%s' "${app_id_name}" | cut -c1-10)"
  while [ ${#pkg_id} -lt 10 ]; do pkg_id="${pkg_id}0"; done

  local uitv_status
  if [[ -d "${repo_root}/packages/ui-tv" ]]; then uitv_status="${UITV_EXISTS}"; else uitv_status="${UITV_NEW}"; fi

  # Summary.
  echo "" >/dev/tty
  printf "  %-14s %s\n" "App:"             "$(clr_bold_cyan "${name}")" >/dev/tty
  printf "  %-14s %s\n" "${LBL_PORT}:"     "${port}" >/dev/tty
  printf "  %-14s %s\n" "${LBL_API}:"      "${api_url}" >/dev/tty
  printf "  %-14s %s (%s)\n" "${LBL_PALETTE}:" "${palette}" "${accent}" >/dev/tty
  printf "  %-14s %s\n" "${LBL_UITV}:"     "$(clr_dim "${uitv_status}")" >/dev/tty
  echo "" >/dev/tty

  if ! confirm_yn "${GENERATE_PROMPT}" "y"; then
    printf "  %s\n" "$(clr_bold_red "${ABORTED_MSG}")" >/dev/tty
    exit 1
  fi

  echo "" >/dev/tty
  echo "  $(clr_bold "${STEP_FILES}")" >/dev/tty

  if [[ ! -d "${repo_root}/packages/ui-tv" ]]; then
    create_uitv_package
    printf "  %s packages/ui-tv\n" "$(clr_bold_green '✓')" >/dev/tty
  fi
  create_app
  printf "  %s apps/%s\n" "$(clr_bold_green '✓')" "${name}" >/dev/tty

  # .env from example.
  printf "  %s\n" "$(clr_dim "${COPYING_ENV_MSG}")" >/dev/tty
  cp "${repo_root}/apps/${name}/env.example" "${repo_root}/apps/${name}/.env"

  # Install workspace deps.
  printf "  %s\n" "$(clr_dim "${INSTALLING_DEPS_MSG}")" >/dev/tty
  ( cd "${repo_root}" && pnpm install )

  echo "" >/dev/tty
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_MSG}")" >/dev/tty
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${NEXT_STEPS}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "pnpm dev --filter=${name}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "# package for a TV: see apps/${name}/README.md")" >/dev/tty
  echo "" >/dev/tty
}

# Only run main when executed directly (allows sourcing for tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
