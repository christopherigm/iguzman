#!/usr/bin/env bash
# new-nextjs-app.sh - interactive Next.js app scaffold
# Based on the cinelog / edge-folio / website architecture (i18n + auth + PWA + Helm).
#
# Auth is always wired to the shared @repo/auth package: the server owns the
# session (decoded from the access-token cookie), the auth screens and the
# identical /api/auth/* handlers are imported rather than copied. Never generate
# a per-app auth form, password policy, or a localStorage user store here - that
# is exactly the duplication @repo/auth exists to remove. See packages/auth/CLAUDE.md.
#
# Run: bash cli/new-nextjs-app/new-nextjs-app.sh

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

# Portable case helpers (macOS bash 3 does not support ${var,,} / ${var^^})
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
uc() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Nuevo App Next.js"
    SUBTITLE="Genera el scaffold para una nueva app Next.js PWA."
    APP_NAME_PROMPT="Nombre del app (ej. my-app)"
    APP_NAME_REQUIRED="El nombre es requerido."
    APP_NAME_INVALID="El nombre debe empezar con letra y contener solo minúsculas, números y guiones."
    PORT_PROMPT="Puerto de desarrollo"
    PALETTE_LABEL="Paleta:"
    PALETTE_ENTER_NUM="Ingresa número"
    REGISTRY_PROMPT="Usuario del registro Docker"
    HOST_PROMPT="Host"
    PWA_PROMPT="¿Incluir PWA? (Serwist service worker, manifest, página offline)"
    STEP_CONFIG="[1/2] Configuración"
    STEP_FILES="[2/2] Generando archivos"
    GENERATE_PROMPT="¿Generar app?"
    ABORTED_MSG="Cancelado."
    LBL_PORT="Puerto"
    LBL_PALETTE="Paleta"
    LBL_PWA="PWA"
    LBL_REGISTRY="Registro"
    LBL_HOST="Host"
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    NEXT_STEP_AUTH_API="# Configura API_URL en .env e inicia la API Django"
    NEXT_STEP_PWA_ICONS="# Agrega íconos PWA a"
    COPYING_ENV_MSG="Copiando .env.example → .env…"
    INSTALLING_DEPS_MSG="Instalando dependencias (pnpm install)…"
    ENV_REMINDER="Recuerda actualizar los valores en apps/APP_NAME/.env si es necesario."
  else
    WELCOME="New Next.js App"
    SUBTITLE="Scaffold a new Next.js PWA application."
    APP_NAME_PROMPT="App name (e.g. my-app)"
    APP_NAME_REQUIRED="App name is required."
    APP_NAME_INVALID="Name must start with a letter and contain only lowercase letters, numbers, and hyphens."
    PORT_PROMPT="Dev port"
    PALETTE_LABEL="Palette:"
    PALETTE_ENTER_NUM="Enter number"
    REGISTRY_PROMPT="Docker registry user"
    HOST_PROMPT="Host"
    PWA_PROMPT="Include PWA? (Serwist service worker, manifest, offline page)"
    STEP_CONFIG="[1/2] Configuration"
    STEP_FILES="[2/2] Generating files"
    GENERATE_PROMPT="Generate app?"
    ABORTED_MSG="Aborted."
    LBL_PORT="Port"
    LBL_PALETTE="Palette"
    LBL_PWA="PWA"
    LBL_REGISTRY="Registry"
    LBL_HOST="Host"
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    NEXT_STEP_AUTH_API="# Set API_URL in .env and start the Django API"
    NEXT_STEP_PWA_ICONS="# Add PWA icons to"
    COPYING_ENV_MSG="Copying .env.example → .env…"
    INSTALLING_DEPS_MSG="Installing dependencies (pnpm install)…"
    ENV_REMINDER="Remember to update the values in apps/APP_NAME/.env if needed."
  fi
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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


# ── File Generators ───────────────────────────────────────────────────────────
# Globals used by all generators: name title port palette accent registry_user host include_pwa

gen_package_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  local ts_comma="," pwa_devdep="" deps_tail=""
  # @simplewebauthn/browser is a direct dep because the passkey calls in
  # @repo/auth/client import it lazily; @repo/auth itself carries the rest.
  deps_tail=',
    "@simplewebauthn/browser": "^13.1.0"'
  if [[ "${include_pwa}" == "y" ]]; then
    deps_tail=',
    "@serwist/next": "^9.5.11",
    "@simplewebauthn/browser": "^13.1.0"'
  fi
  if [[ "${include_pwa}" == "y" ]]; then
    pwa_devdep='
    "serwist": "^9.5.11"'
  else
    ts_comma=""
  fi
  cat > "$out" << EOF
{
  "name": "${name}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev --port ${port}",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "check-types": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@repo/auth": "workspace:*",
    "@repo/helpers": "workspace:*",
    "@swc/helpers": "^0.5.23",
    "@repo/ui": "workspace:*",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "swiper": "^12.2.0",
    "pino": "^10.3.1",
    "@repo/i18n": "workspace:^",
    "next-intl": "^4",
    "next": "16.3.0-canary.66"${deps_tail}
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^26.0.0",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "^9.39.4",
    "typescript": "6.0.3"${ts_comma}${pwa_devdep}
  }
}
EOF
}

gen_next_config_js() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  local base_config='  output: '"'"'standalone'"'"',
  outputFileTracingRoot: process.env.NODE_ENV === '"'"'production'"'"' ? path.join(__dirname, '"'"'../../'"'"') : undefined,
  allowedDevOrigins: ['"'"'127.0.0.1'"'"', '"'"'*'"'"'],
  logging: { incomingRequests: false },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 80, 85, 90],
    remotePatterns: [
      { protocol: '"'"'http'"'"', hostname: '"'"'127.0.0.1'"'"' },
      { protocol: '"'"'http'"'"', hostname: '"'"'localhost'"'"' },
      { protocol: '"'"'https'"'"', hostname: '"'"'r2.iguzman.com.mx'"'"' },
    ],
  },'

  if [[ "${include_pwa}" == "y" ]]; then
    cat > "$out" << EOF
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
${base_config}
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withSerwist(withNextIntl(nextConfig));
EOF
  else
    cat > "$out" << EOF
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
${base_config}
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
EOF
  fi
}

gen_tsconfig_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  if [[ "${include_pwa}" == "y" ]]; then
    cat > "$out" << 'JSONEOF'
{
  "extends": "@repo/typescript-config/nextjs.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "allowArbitraryExtensions": true,
    "lib": ["es2022", "DOM", "DOM.Iterable", "webworker"],
    "types": ["@serwist/next/typings"],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts", "next.config.js", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "public/sw.js"]
}
JSONEOF
  else
    cat > "$out" << 'JSONEOF'
{
  "extends": "@repo/typescript-config/nextjs.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "allowArbitraryExtensions": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts", "next.config.js", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
JSONEOF
  fi
}

gen_eslint_config_js() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'JSEOF'
import { nextJsConfig } from "@repo/eslint-config/next-js";
/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
JSEOF
}

gen_gitignore() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TXTEOF'
/node_modules
/.pnp
.pnp.js
/coverage
/.next/
/out/
/build
.DS_Store
*.pem
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.env*
!.env.example
.vercel
*.tsbuildinfo
next-env.d.ts
TXTEOF
  [[ "${include_pwa}" == "y" ]] && printf '\npublic/sw*\npublic/swe-worker*\n' >> "$out"
}

gen_dockerignore() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TXTEOF'
node_modules
.next
.turbo
.env
.env.*
!.env.example
.DS_Store
.vscode
.idea
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
helm
TXTEOF
}

gen_dockerfile() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune ${name} --docker

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
RUN corepack enable pnpm && pnpm exec turbo run build --filter=${name} --no-daemon
RUN find -L /app/node_modules/.pnpm -maxdepth 5 \\
      -path "*/next@*/node_modules/@swc/helpers" -type d \\
    | while read src; do \\
        rel="\${src#/app/}"; \\
        dest="/app/apps/${name}/.next/standalone/\${rel}"; \\
        mkdir -p "\$dest"; \\
        cp -rL "\$src/." "\$dest/"; \\
      done

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache curl jq wget
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/static ./apps/${name}/.next/static
COPY --from=builder /app/apps/${name}/public ./apps/${name}/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/${name}/server.js"]
EOF
}

gen_css_dts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
declare module 'swiper/css';
declare module 'swiper/css/*';
TSEOF
}

gen_global_dts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import type sharedMessages from '@repo/i18n/messages/en';
import type localMessages from './messages/en.json';

type Messages = typeof sharedMessages & typeof localMessages;

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
TSEOF
}

gen_env_example() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
DOCKER_REGISTRY=${registry_user}
NAMESPACE=${name}

# Django API base URL - server-side only, never NEXT_PUBLIC_
# Local: http://localhost:8000
API_URL=http://localhost:8000
EOF
}


gen_turbo_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  # Without this, `turbo/no-undeclared-env-vars` fails lint on the first run
  # (lint is --max-warnings 0), and API_URL would not reach the build.
  cat > "$out" << 'JSONEOF'
{
  "$schema": "https://turbo.build/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "passThroughEnv": ["API_URL", "LOG_LEVEL"]
    }
  }
}
JSONEOF
}

gen_proxy_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { createAuthProxy } from '@repo/auth/proxy';

// Locale-less prefixes that require a session. Everything else renders for
// anonymous visitors - the proxy still refreshes their token on every page, so a
// public page with auth-dependent UI (the navbar account menu) paints correctly.
export default createAuthProxy({
  protectedPrefixes: ['/account'],
});

// The matcher must be an inline literal: Next.js statically analyses it at build
// time and an imported constant silently fails to parse, which would run the
// proxy on /api/* and break login. See @repo/auth/proxy.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
TSEOF
}

gen_globals_css() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'CSSEOF'
@import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap');

html, body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: 'Roboto', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
}

body {
  color: var(--foreground);
  background: var(--surface-2);
  touch-action: pan-x pan-y;
}

* { box-sizing: border-box; padding: 0; margin: 0; }
a { color: inherit; text-decoration: none; }
CSSEOF
}

gen_i18n_request_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@repo/i18n/routing';
import { getSharedMessages } from '@repo/i18n/request';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const [sharedMessages, localMessages] = await Promise.all([
    getSharedMessages(locale),
    import(`../messages/${locale}.json`).then((m) => m.default),
  ]);

  return { locale, messages: { ...sharedMessages, ...localMessages } };
});
TSEOF
}

gen_lib_logger_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: '${name}' },
});

export default logger;
EOF
}

gen_lib_api_fetch_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
/**
 * The API fetcher lives in `@repo/auth` so all the frontends share one
 * refresh-and-retry implementation. Re-exported here because every route handler
 * imports it from `@/lib/api-fetch` (see apps/CLAUDE.md).
 */
export {
  apiFetch,
  refreshAccessToken,
  setAuthCookies,
  clearAuthCookies,
  type ApiFetchInit,
} from '@repo/auth/api-fetch';
TSEOF
}

gen_page_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << TSEOF
import { setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';

type Props = { params: Promise<{ locale: string }> };

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container display="flex" alignItems="center" justifyContent="center" styles={{ minHeight: '100vh' }}>
      <Box width={360} padding={32} borderRadius={12} flexDirection="column" alignItems="center">
        <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>
          ${title}
        </h1>
        <ThemeSwitch hideOnMobile />
      </Box>
    </Container>
  );
}
TSEOF
}

gen_layout_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  local meta_import navbar_import tNav_decl navbar_jsx viewport_export meta_extra splash_links=""
  local serwist_import="" serwist_open="" serwist_close=""

  if [[ "${include_pwa}" == "y" ]]; then
    meta_import="import type { Metadata, Viewport } from 'next';"
    viewport_export="
export const viewport: Viewport = {
  themeColor: '${accent}',
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
};"
    meta_extra="    manifest: '/manifest.webmanifest',
    icons: { icon: '/favicon.ico', apple: '/icons/icon-192x192.png' },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('title') },
    formatDetection: { telephone: false },"
    splash_links='
        {/* iOS PWA splash screens */}
        <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1170x2532.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1179x2556.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1290x2796.jpg" />'
  else
    meta_import="import type { Metadata } from 'next';"
    viewport_export=""
    meta_extra=""
  fi

  navbar_import="import { getSession } from '@repo/auth/session';
import { SessionProvider } from '@repo/auth/session-provider';
import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';"
  tNav_decl="
  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (key: string) => string;

  // Decoded from the access-token cookie during this request, so the HTML we
  // send already reflects who the user is - no logged-out flash, no reload.
  const session = await getSession();"
  navbar_jsx="            <NavbarWrapper
              logo=\"/logo-navbar.png\"
              version={\`v\${packageJson.version}\`}
              labels={{ home: tNav('home'), account: tNav('account'), signOut: tNav('signOut') }}
            />
            {children}
            <Footer logo=\"/logo-navbar.png\" />"

  if [[ "${include_pwa}" == "y" ]]; then
    serwist_import="import { SerwistProvider } from '@serwist/next/react';"
    serwist_open="      <SerwistProvider swUrl=\"/sw.js\">"
    serwist_close="      </SerwistProvider>"
  fi

  cat > "$out" << EOF
${meta_import}
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider, ThemeScript, RESOLVED_COOKIE_NAME } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { palettes } from '@repo/ui/palettes';
import { routing } from '@repo/i18n/routing';
${navbar_import}
${serwist_import}
import packageJson from '@/package.json';
import '../globals.css';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
${viewport_export}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'Metadata' })) as (key: string) => string;
  return {
    title: t('title'),
    description: t('description'),
${meta_extra}
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) { notFound(); }
  setRequestLocale(locale);
  const messages = await getMessages();
${tNav_decl}
  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as ThemeMode | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as ResolvedTheme | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'system' ? (themeResolvedCookie ?? 'light') : (initialMode as ResolvedTheme);

  const paletteVars = palettes['${palette}']?.[initialResolved] ?? {};
  const bodyStyle = Object.fromEntries(Object.entries(paletteVars)) as React.CSSProperties;
  (bodyStyle as Record<string, string>)['--accent'] = '${accent}';

  return (
    <html lang={locale} data-theme={initialResolved} style={{ colorScheme: initialResolved }} suppressHydrationWarning>
      <head>
        <ThemeScript />${splash_links}
      </head>
      <body style={bodyStyle}>
${serwist_open}
      <NextIntlClientProvider messages={messages}>
        <SessionProvider session={session}>
          <ThemeProvider initialMode={initialMode} initialResolved={initialResolved}>
            <PaletteProvider palette="${palette}" accent="${accent}">
${navbar_jsx}
            </PaletteProvider>
          </ThemeProvider>
        </SessionProvider>
      </NextIntlClientProvider>
${serwist_close}
      </body>
    </html>
  );
}
EOF
}


gen_navbar_wrapper_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
'use client';

import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { useSession } from '@repo/auth/session-provider';
import { useAuthActions } from '@repo/auth/use-auth-actions';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; account: string; signOut: string };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  // Comes from the server via SessionProvider, so it is already correct in the
  // first HTML - the navbar never renders logged-out for a logged-in user.
  const session = useSession();
  const { signOut } = useAuthActions();
  const displayName = session?.displayName ?? null;

  const handleSignOut = () => void signOut('/auth');

  const accountItem: MenuItem = displayName
    ? { label: displayName, children: [{ label: labels.account, href: '/account' }, { label: labels.signOut, onClick: handleSignOut }] }
    : { label: labels.account, href: '/account' };

  return (
    <Navbar
      logo={logo}
      items={[{ label: labels.home, href: '/' }, accountItem]}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
TSEOF
}

gen_footer_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << TSEOF
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { LocaleSwitcher } from '@repo/ui/core-elements/locale-switcher';
import { routing } from '@repo/i18n/routing';
import { version } from '../../package.json';
import './footer.css';

export async function Footer({ logo }: { logo: string }) {
  const [t, locale] = await Promise.all([getTranslations('Footer'), getLocale()]);

  const appLinks = [
    { label: t('home'), href: '/' },
    { label: t('account'), href: '/account' },
  ];
  const legalLinks = [
    { label: t('privacyPolicy'), href: '/privacy-policy' },
    { label: t('terms'), href: '/terms' },
    { label: t('userData'), href: '/user-data' },
  ];

  return (
    <footer className="footer">
      <Container paddingX={10}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Image src={logo} alt="${title}" width={140} height={44} className="footer__logo" />
              <Typography as="span" variant="h5" fontWeight={700}>${title}</Typography>
              <Box display="flex" alignItems="center" gap="12px" flexWrap="wrap">
                <ThemeSwitch />
                <LocaleSwitcher locales={routing.locales} currentLocale={locale} />
              </Box>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography as="h3" variant="h5" fontWeight={700} className="footer__col-heading">{t('appHeading')}</Typography>
            <Grid container spacingY={1} spacingX={2}>
              {appLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">{link.label}</Link>
                </Grid>
              ))}
            </Grid>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography as="h3" variant="h5" fontWeight={700} className="footer__col-heading">{t('legalHeading')}</Typography>
            <Grid container spacingY={1} spacingX={2}>
              {legalLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">{link.label}</Link>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
        <Box className="footer__bottom">
          <Typography as="p" variant="body" textAlign="center" className="footer__description">
            {t('copyright', { year: new Date().getFullYear(), version })}
          </Typography>
        </Box>
      </Container>
    </footer>
  );
}
TSEOF
}

gen_footer_css() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'CSSEOF'
.footer {
  width: 100%;
  background: var(--background);
  border-top: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent);
  padding-top: 56px;
}
.footer__logo { object-fit: contain; object-position: left center; }
.footer__description { color: color-mix(in srgb, var(--foreground) 60%, transparent); line-height: 1.6; overflow-wrap: break-word; }
.footer__col-heading { margin-bottom: 20px; }
.footer__link { font-size: 14px; color: color-mix(in srgb, var(--foreground) 65%, transparent); text-decoration: none; transition: color 0.2s ease; width: fit-content; }
.footer__link:hover { color: var(--accent); }
.footer__bottom { border-top: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent); padding: 20px 0; margin-top: 40px; }
@media (max-width: 599px) { .footer { padding-top: 40px; } }
CSSEOF
}

gen_manifest_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << EOF
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '${title}',
    short_name: '${title}',
    description: '${title} application',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '${accent}',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
EOF
}

gen_sw_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

self.addEventListener('install', serwist.handleInstall);
self.addEventListener('activate', serwist.handleActivate);
self.addEventListener('fetch', (event: FetchEvent) => {
  if (!event.request.url.startsWith('http')) return;
  // Never intercept Next.js API routes - let them go straight to the network.
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  serwist.handleFetch(event);
});
self.addEventListener('message', serwist.handleCache);
TSEOF
}

gen_offline_page_tsx() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
export default function OfflinePage() {
  return (
    <body>
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>You are offline</h1>
        <p style={{ fontSize: '1.125rem', opacity: 0.7, maxWidth: '28rem' }}>
          It looks like you lost your internet connection. Please check your network and try again.
        </p>
      </main>
    </body>
  );
}
TSEOF
}


gen_lib_auth_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  cat > "$out" << 'TSEOF'
/**
 * Auth for this app. The whole surface (login, signup, passkeys, password reset,
 * the profile calls) lives in `@repo/auth/client`; this module only re-exports it
 * so app code keeps importing from `@/lib/auth`.
 *
 * There is no client-side user store. Identity comes from the server via
 * `getSession()` / `useSession()`, decoded from the access-token cookie - so the
 * first render already knows who you are. Never reintroduce a localStorage user
 * or an `app-auth` event: the server cannot read them, which is what used to make
 * every page render logged-out until hydration corrected it.
 *
 * If this app's profile carries extra fields, declare
 * `interface UserProfile extends BaseUserProfile` and bind the generic:
 *
 *   import { getProfile as getSharedProfile } from '@repo/auth/client';
 *   export function getProfile(): Promise<UserProfile> {
 *     return getSharedProfile<UserProfile>();
 *   }
 */
export {
  ApiError,
  LoginError,
  login,
  logout,
  signUp,
  verifyEmail,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  uploadProfilePicture,
  getPasskeyCredentials,
  deletePasskeyCredential,
  registerPasskey,
  loginWithPasskey,
  getProfile,
  updateProfile,
  type PasskeyCredential,
  type UserProfile,
} from '@repo/auth/client';
TSEOF
}

# The /api/auth/* route handlers.
#
# The five that are byte-identical in every app are re-exported from
# @repo/auth/route-handlers in one line each. The rest stay here because they
# genuinely differ per app (they set cookies, or an app may inject extra fields).
gen_api_auth_routes() {
  local base="$1"

  # ── Shared handlers: one-line re-exports ────────────────────────────────────
  mkdir -p "${base}/logout" "${base}/change-password" "${base}/profile/picture" \
           "${base}/passkey/credentials" "${base}/passkey/credentials/[id]"

  echo "export { logoutRoute as POST } from '@repo/auth/route-handlers';" \
    > "${base}/logout/route.ts"
  echo "export { changePasswordRoute as POST } from '@repo/auth/route-handlers';" \
    > "${base}/change-password/route.ts"
  echo "export { uploadProfilePictureRoute as POST } from '@repo/auth/route-handlers';" \
    > "${base}/profile/picture/route.ts"
  echo "export { listPasskeyCredentialsRoute as GET } from '@repo/auth/route-handlers';" \
    > "${base}/passkey/credentials/route.ts"
  echo "export { deletePasskeyCredentialRoute as DELETE } from '@repo/auth/route-handlers';" \
    > "${base}/passkey/credentials/[id]/route.ts"

  # ── App-specific handlers ───────────────────────────────────────────────────

  # login - sets the cookies, so it cannot be shared as-is
  mkdir -p "${base}/login"
  cat > "${base}/login/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '@repo/auth/api-fetch';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  // setAuthCookies gives the access cookie a 7d maxAge so it outlives the 1h JWT
  // and the proxy can refresh it. A cookie that expired with the token would make
  // a still-valid session look like a logout.
  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
TSEOF

  # signup
  mkdir -p "${base}/signup"
  cat > "${base}/signup/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/signup/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # profile - GET/PUT; the PUT must reissue tokens
  mkdir -p "${base}/profile"
  cat > "${base}/profile/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';
import { reissueTokens } from '@repo/auth/api-fetch';

export async function GET() {
  const res = await apiFetch('/api/auth/profile/');
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/profile/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();

  // The name is a token claim, and claims ride on the refresh token - so without
  // a reissue a rename would not reach the navbar until the refresh token expired.
  if (res.ok) await reissueTokens();

  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # verify-email
  mkdir -p "${base}/verify-email/[token]"
  cat > "${base}/verify-email/[token]/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${apiUrl()}/api/auth/verify-email/${token}/`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # password-reset - request the email
  mkdir -p "${base}/password-reset"
  cat > "${base}/password-reset/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/password-reset/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # password-reset/confirm - the endpoint the emailed link posts to. The reset
  # email points at /reset-password/<token>, so this and its page must both exist.
  mkdir -p "${base}/password-reset/confirm"
  cat > "${base}/password-reset/confirm/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/password-reset/confirm/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # passkey register options/verify - authenticated, so they go through apiFetch
  mkdir -p "${base}/passkey/register/options"
  cat > "${base}/passkey/register/options/route.ts" << 'TSEOF'
import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST() {
  const res = await apiFetch('/api/auth/passkey/register/options/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  mkdir -p "${base}/passkey/register/verify"
  cat > "${base}/passkey/register/verify/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/passkey/register/verify/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # passkey authenticate options/verify - anonymous (this IS the login), and the
  # verify sets the cookies
  mkdir -p "${base}/passkey/authenticate/options"
  cat > "${base}/passkey/authenticate/options/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/passkey/authenticate/options/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  mkdir -p "${base}/passkey/authenticate/verify"
  cat > "${base}/passkey/authenticate/verify/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '@repo/auth/api-fetch';
import { apiUrl } from '@repo/auth/tokens';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/passkey/authenticate/verify/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json'))
    return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
TSEOF
}

# The auth screens. Every one of these is a shared component from @repo/auth - the
# page is just a server wrapper that sets the locale. The copy still comes from
# this app's own AuthPage / ResetPasswordPage / VerifyEmailPage namespaces.
gen_auth_pages() {
  local base="$1"   # apps/<name>/app/[locale]/(auth)

  mkdir -p "${base}/auth"
  cat > "${base}/auth/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import { AuthForm } from '@repo/auth/auth-form';

type Props = { params: Promise<{ locale: string }> };

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // AuthForm takes an optional `resolveRedirect` - where to land once the user is
  // authenticated (it defaults to '/'). An app that needs to send, say, a user with
  // an incomplete profile to /onboarding wraps this in a thin 'use client' component:
  // a function cannot cross the server/client boundary.
  return (
    <>
      <NavbarSpacer />
      <AuthForm />
    </>
  );
}
TSEOF

  # The page the password-reset email links to. The API mails
  # `${FRONTEND_URL}/reset-password/<token>`, so this route must exist.
  mkdir -p "${base}/reset-password/[token]"
  cat > "${base}/reset-password/[token]/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { ResetPasswordForm } from '@repo/auth/reset-password-form';

type Props = { params: Promise<{ locale: string; token: string }> };

export default async function ResetPasswordPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <ResetPasswordForm token={token} />;
}
TSEOF

  # The page the verification email links to.
  mkdir -p "${base}/verify-email/[token]"
  cat > "${base}/verify-email/[token]/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { VerifyEmail } from '@repo/auth/verify-email';

type Props = { params: Promise<{ locale: string; token: string }> };

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <VerifyEmail token={token} />;
}
TSEOF
}

# The account page: profile + avatar, password, passkeys. All of it is AccountForm
# from @repo/auth, reading this app's own AccountPage namespace.
gen_account_pages() {
  local base="$1"   # apps/<name>/app/[locale]/account

  mkdir -p "${base}"
  cat > "${base}/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { AccountForm } from '@repo/auth/account-form';

type Props = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AccountForm />;
}
TSEOF
}
gen_messages_json() {
  local out="$1" locale="${2:-en}"; mkdir -p "$(dirname "$out")"

  if [[ "${locale}" == "es" ]]; then
    local copyright_val="© {year} ${title} v{version}. Todos los derechos reservados."
    cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" },
  "Navbar": { "home": "Inicio", "account": "Cuenta", "signOut": "Cerrar sesión" },
  "Footer": {
    "appHeading": "Aplicación", "legalHeading": "Legal",
    "home": "Inicio", "account": "Cuenta",
    "privacyPolicy": "Política de privacidad", "terms": "Términos de servicio", "userData": "Mis datos",
    "copyright": "${copyright_val}"
  },
  "VerifyEmailPage": {
    "loading": "Verificando tu correo…",
    "successTitle": "Correo verificado", "successDetail": "Tu correo ha sido verificado. Ya puedes iniciar sesión.",
    "redirecting": "Redirigiendo en {seconds}…", "redirectProgress": "Progreso de redirección",
    "expiredTitle": "Enlace expirado", "expiredDetail": "Este enlace de verificación ha expirado. Regístrate de nuevo para solicitar uno nuevo.",
    "invalidTitle": "Enlace inválido", "invalidDetail": "Este enlace de verificación no es válido. Revisa tu correo o regístrate de nuevo."
  },
  "AuthPage": {
    "tabSignIn": "Iniciar sesión", "tabSignUp": "Registrarse", "tabReset": "Restablecer contraseña",
    "signIn": {
      "title": "Iniciar sesión", "subtitle": "Bienvenido de nuevo",
      "emailLabel": "Correo", "passwordLabel": "Contraseña",
      "submitButton": "Iniciar sesión", "submitting": "Iniciando sesión…",
      "errorInvalidCredentials": "Correo o contraseña incorrectos.",
      "errorGeneric": "Algo salió mal. Por favor intenta de nuevo.",
      "forgotPassword": "¿Olvidaste tu contraseña?",
      "noAccount": "¿No tienes cuenta? Regístrate",
      "orDivider": "o", "passkeyButton": "Iniciar sesión con llave de acceso",
      "errorPasskeyFailed": "La autenticación con llave falló. Por favor intenta de nuevo.",
      "errorEmailRequired": "Por favor ingresa tu correo primero.",
      "rememberEmail": "Recordar correo"
    },
    "signUp": {
      "title": "Crear cuenta", "subtitle": "Únete a ${title} hoy",
      "emailLabel": "Correo", "firstNameLabel": "Nombre", "lastNameLabel": "Apellido",
      "passwordLabel": "Contraseña", "confirmPasswordLabel": "Confirmar contraseña",
      "submitButton": "Crear cuenta", "submitting": "Creando cuenta…",
      "successDetail": "¡Cuenta creada! Revisa tu correo para verificar tu cuenta.",
      "errorEmailTaken": "Ya existe una cuenta con este correo.",
      "errorPasswordMismatch": "Las contraseñas no coinciden.",
      "errorGeneric": "Algo salió mal. Por favor intenta de nuevo.",
      "haveAccount": "¿Ya tienes cuenta? Inicia sesión",
      "forgotPassword": "¿Olvidaste tu contraseña?"
    },
    "resetPassword": {
      "title": "Restablecer contraseña", "subtitle": "Ingresa tu correo para recibir un enlace de restablecimiento",
      "emailLabel": "Correo", "submitButton": "Enviar enlace", "submitting": "Enviando…",
      "successDetail": "Si existe una cuenta con ese correo, se ha enviado un enlace para restablecer la contraseña.",
      "errorGeneric": "Algo salió mal. Por favor intenta de nuevo.",
      "backToSignIn": "Volver a iniciar sesión"
    },
    "passkey": {
      "promptTitle": "¿Configurar una llave de acceso?",
      "promptDescription": "Inicia sesión más rápido y con mayor seguridad. Usa tu huella, rostro o PIN del dispositivo.",
      "registerButton": "Configurar llave", "skipButton": "Omitir por ahora",
      "successMessage": "¡Llave de acceso registrada exitosamente!",
      "errorGeneric": "No se pudo registrar la llave. Puedes intentarlo más tarde."
    }
  },
  "AccountPage": {
    "title": "Mi cuenta", "subtitle": "Administra tu perfil y configuración de seguridad",
    "profileSection": "Perfil", "securitySection": "Seguridad", "passkeySection": "Llaves de acceso",
    "emailLabel": "Correo", "firstNameLabel": "Nombre", "lastNameLabel": "Apellido",
    "changePhoto": "Cambiar foto", "saveProfile": "Guardar perfil", "savingProfile": "Guardando…",
    "profileSaved": "Perfil guardado.", "profileError": "No se pudo guardar el perfil. Por favor intenta de nuevo.",
    "currentPasswordLabel": "Contraseña actual", "newPasswordLabel": "Nueva contraseña", "confirmPasswordLabel": "Confirmar nueva contraseña",
    "savePassword": "Actualizar contraseña", "savingPassword": "Actualizando…",
    "passwordSaved": "Contraseña actualizada.", "passwordError": "No se pudo actualizar la contraseña. Por favor intenta de nuevo.",
    "passwordMismatch": "Las contraseñas no coinciden.", "passwordWrong": "La contraseña actual es incorrecta.",
    "noPasskeys": "Sin llaves de acceso registradas.", "deletePasskey": "Eliminar",
    "confirmDeletePasskeyTitle": "Eliminar llave de acceso",
    "confirmDeletePasskeyText": "¿Estás seguro de que quieres eliminar esta llave? No podrás usarla para iniciar sesión.",
    "passkeyDeleted": "Llave eliminada.", "passkeyDeleteError": "No se pudo eliminar la llave. Por favor intenta de nuevo.",
    "addPasskey": "Agregar llave", "passkeyAdded": "Llave agregada.", "passkeyAddError": "No se pudo agregar la llave. Por favor intenta de nuevo.",
    "loading": "Cargando…"
  },
  "ResetPasswordPage": {
    "title": "Establecer nueva contraseña",
    "subtitle": "Ingresa tu nueva contraseña a continuación",
    "newPasswordLabel": "Nueva contraseña",
    "confirmPasswordLabel": "Confirmar nueva contraseña",
    "submitButton": "Restablecer contraseña",
    "submitting": "Restableciendo contraseña…",
    "errorPasswordMismatch": "Las contraseñas no coinciden.",
    "errorGeneric": "Algo salió mal. Por favor, inténtalo de nuevo.",
    "successTitle": "¡Contraseña restablecida!",
    "successDetail": "Tu contraseña ha sido actualizada. Ahora puedes iniciar sesión con tu nueva contraseña.",
    "backToSignIn": "Volver a iniciar sesión",
    "invalidTitle": "Enlace inválido o expirado",
    "invalidDetail": "Este enlace para restablecer la contraseña es inválido o ha expirado. Por favor, solicita uno nuevo.",
    "requestNewLink": "Solicitar un nuevo enlace"
  }
}
EOF

  elif [[ "${locale}" == "de" ]]; then
    local copyright_val="© {year} ${title} v{version}. Alle Rechte vorbehalten."
    cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" },
  "Navbar": { "home": "Startseite", "account": "Konto", "signOut": "Abmelden" },
  "Footer": {
    "appHeading": "App", "legalHeading": "Rechtliches",
    "home": "Startseite", "account": "Konto",
    "privacyPolicy": "Datenschutz", "terms": "Nutzungsbedingungen", "userData": "Nutzerdaten",
    "copyright": "${copyright_val}"
  },
  "VerifyEmailPage": {
    "loading": "E-Mail wird verifiziert…",
    "successTitle": "E-Mail verifiziert", "successDetail": "Deine E-Mail wurde verifiziert. Du kannst dich jetzt anmelden.",
    "redirecting": "Weiterleitung in {seconds}…", "redirectProgress": "Weiterleitungsfortschritt",
    "expiredTitle": "Link abgelaufen", "expiredDetail": "Dieser Bestätigungslink ist abgelaufen. Bitte registriere dich erneut, um einen neuen anzufordern.",
    "invalidTitle": "Ungültiger Link", "invalidDetail": "Dieser Bestätigungslink ist ungültig. Bitte prüfe deine E-Mails oder registriere dich erneut."
  },
  "AuthPage": {
    "tabSignIn": "Anmelden", "tabSignUp": "Registrieren", "tabReset": "Passwort zurücksetzen",
    "signIn": {
      "title": "Anmelden", "subtitle": "Willkommen zurück",
      "emailLabel": "E-Mail", "passwordLabel": "Passwort",
      "submitButton": "Anmelden", "submitting": "Anmeldung läuft…",
      "errorInvalidCredentials": "Ungültige E-Mail oder Passwort.",
      "errorGeneric": "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
      "forgotPassword": "Passwort vergessen?",
      "noAccount": "Noch kein Konto? Jetzt registrieren",
      "orDivider": "oder", "passkeyButton": "Mit Passkey anmelden",
      "errorPasskeyFailed": "Passkey-Authentifizierung fehlgeschlagen. Bitte erneut versuchen.",
      "errorEmailRequired": "Bitte zuerst E-Mail eingeben.",
      "rememberEmail": "E-Mail merken"
    },
    "signUp": {
      "title": "Konto erstellen", "subtitle": "Jetzt bei ${title} registrieren",
      "emailLabel": "E-Mail", "firstNameLabel": "Vorname", "lastNameLabel": "Nachname",
      "passwordLabel": "Passwort", "confirmPasswordLabel": "Passwort bestätigen",
      "submitButton": "Konto erstellen", "submitting": "Konto wird erstellt…",
      "successDetail": "Konto erstellt! Bitte prüfe deine E-Mails zur Verifizierung.",
      "errorEmailTaken": "Es existiert bereits ein Konto mit dieser E-Mail.",
      "errorPasswordMismatch": "Passwörter stimmen nicht überein.",
      "errorGeneric": "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
      "haveAccount": "Bereits ein Konto? Anmelden",
      "forgotPassword": "Passwort vergessen?"
    },
    "resetPassword": {
      "title": "Passwort zurücksetzen", "subtitle": "Gib deine E-Mail ein, um einen Link zu erhalten",
      "emailLabel": "E-Mail", "submitButton": "Link senden", "submitting": "Wird gesendet…",
      "successDetail": "Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.",
      "errorGeneric": "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
      "backToSignIn": "Zurück zur Anmeldung"
    },
    "passkey": {
      "promptTitle": "Passkey einrichten?",
      "promptDescription": "Melde dich schneller und sicherer mit Fingerabdruck, Gesicht oder Geräte-PIN an.",
      "registerButton": "Passkey einrichten", "skipButton": "Jetzt überspringen",
      "successMessage": "Passkey erfolgreich registriert!",
      "errorGeneric": "Passkey konnte nicht registriert werden. Du kannst es später erneut versuchen."
    }
  },
  "AccountPage": {
    "title": "Mein Konto", "subtitle": "Profil und Sicherheitseinstellungen verwalten",
    "profileSection": "Profil", "securitySection": "Sicherheit", "passkeySection": "Passkeys",
    "emailLabel": "E-Mail", "firstNameLabel": "Vorname", "lastNameLabel": "Nachname",
    "changePhoto": "Foto ändern", "saveProfile": "Profil speichern", "savingProfile": "Wird gespeichert…",
    "profileSaved": "Profil gespeichert.", "profileError": "Profil konnte nicht gespeichert werden. Bitte erneut versuchen.",
    "currentPasswordLabel": "Aktuelles Passwort", "newPasswordLabel": "Neues Passwort", "confirmPasswordLabel": "Neues Passwort bestätigen",
    "savePassword": "Passwort aktualisieren", "savingPassword": "Wird aktualisiert…",
    "passwordSaved": "Passwort aktualisiert.", "passwordError": "Passwort konnte nicht aktualisiert werden. Bitte erneut versuchen.",
    "passwordMismatch": "Passwörter stimmen nicht überein.", "passwordWrong": "Das aktuelle Passwort ist falsch.",
    "noPasskeys": "Keine Passkeys registriert.", "deletePasskey": "Löschen",
    "confirmDeletePasskeyTitle": "Passkey löschen",
    "confirmDeletePasskeyText": "Bist du sicher, dass du diesen Passkey entfernen möchtest? Du kannst ihn danach nicht mehr zur Anmeldung verwenden.",
    "passkeyDeleted": "Passkey entfernt.", "passkeyDeleteError": "Passkey konnte nicht entfernt werden. Bitte erneut versuchen.",
    "addPasskey": "Passkey hinzufügen", "passkeyAdded": "Passkey hinzugefügt.", "passkeyAddError": "Passkey konnte nicht hinzugefügt werden. Bitte erneut versuchen.",
    "loading": "Lädt…"
  },
  "ResetPasswordPage": {
    "title": "Neues Passwort festlegen",
    "subtitle": "Geben Sie unten Ihr neues Passwort ein",
    "newPasswordLabel": "Neues Passwort",
    "confirmPasswordLabel": "Neues Passwort bestätigen",
    "submitButton": "Passwort zurücksetzen",
    "submitting": "Passwort wird zurückgesetzt…",
    "errorPasswordMismatch": "Passwörter stimmen nicht überein.",
    "errorGeneric": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "successTitle": "Passwort zurückgesetzt!",
    "successDetail": "Ihr Passwort wurde aktualisiert. Sie können sich jetzt mit Ihrem neuen Passwort anmelden.",
    "backToSignIn": "Zurück zur Anmeldung",
    "invalidTitle": "Link ungültig oder abgelaufen",
    "invalidDetail": "Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.",
    "requestNewLink": "Neuen Reset-Link anfordern"
  }
}
EOF

  elif [[ "${locale}" == "fr" ]]; then
    local copyright_val="© {year} ${title} v{version}. Tous droits réservés."
    cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" },
  "Navbar": { "home": "Accueil", "account": "Mon Compte", "signOut": "Se déconnecter" },
  "Footer": {
    "appHeading": "Application", "legalHeading": "Légal",
    "home": "Accueil", "account": "Mon Compte",
    "privacyPolicy": "Politique de Confidentialité", "terms": "Conditions d'Utilisation", "userData": "Données Utilisateur",
    "copyright": "${copyright_val}"
  },
  "VerifyEmailPage": {
    "loading": "Vérification de votre e-mail…",
    "successTitle": "E-mail vérifié", "successDetail": "Votre e-mail a été vérifié. Vous pouvez maintenant vous connecter.",
    "redirecting": "Redirection dans {seconds}…", "redirectProgress": "Progression de la redirection",
    "expiredTitle": "Lien expiré", "expiredDetail": "Ce lien de vérification a expiré. Veuillez vous inscrire à nouveau pour en obtenir un nouveau.",
    "invalidTitle": "Lien invalide", "invalidDetail": "Ce lien de vérification est invalide. Vérifiez votre e-mail ou inscrivez-vous à nouveau."
  },
  "AuthPage": {
    "tabSignIn": "Se connecter", "tabSignUp": "S'inscrire", "tabReset": "Réinitialiser le mot de passe",
    "signIn": {
      "title": "Se connecter", "subtitle": "Bon retour parmi nous",
      "emailLabel": "E-mail", "passwordLabel": "Mot de passe",
      "submitButton": "Se connecter", "submitting": "Connexion en cours…",
      "errorInvalidCredentials": "E-mail ou mot de passe incorrect.",
      "errorGeneric": "Quelque chose s'est mal passé. Veuillez réessayer.",
      "forgotPassword": "Mot de passe oublié ?",
      "noAccount": "Pas encore de compte ? S'inscrire",
      "orDivider": "ou", "passkeyButton": "Se connecter avec une clé d'accès",
      "errorPasskeyFailed": "L'authentification par clé d'accès a échoué. Veuillez réessayer.",
      "errorEmailRequired": "Veuillez d'abord saisir votre e-mail.",
      "rememberEmail": "Se souvenir de l'e-mail"
    },
    "signUp": {
      "title": "Créer un compte", "subtitle": "Rejoignez ${title} aujourd'hui",
      "emailLabel": "E-mail", "firstNameLabel": "Prénom", "lastNameLabel": "Nom de famille",
      "passwordLabel": "Mot de passe", "confirmPasswordLabel": "Confirmer le mot de passe",
      "submitButton": "Créer un compte", "submitting": "Création du compte…",
      "successDetail": "Compte créé ! Vérifiez votre e-mail pour activer votre compte.",
      "errorEmailTaken": "Un compte avec cet e-mail existe déjà.",
      "errorPasswordMismatch": "Les mots de passe ne correspondent pas.",
      "errorGeneric": "Quelque chose s'est mal passé. Veuillez réessayer.",
      "haveAccount": "Vous avez déjà un compte ? Se connecter",
      "forgotPassword": "Mot de passe oublié ?"
    },
    "resetPassword": {
      "title": "Réinitialiser le mot de passe", "subtitle": "Saisissez votre e-mail pour recevoir un lien",
      "emailLabel": "E-mail", "submitButton": "Envoyer le lien", "submitting": "Envoi en cours…",
      "successDetail": "Si un compte avec cet e-mail existe, un lien de réinitialisation a été envoyé.",
      "errorGeneric": "Quelque chose s'est mal passé. Veuillez réessayer.",
      "backToSignIn": "Retour à la connexion"
    },
    "passkey": {
      "promptTitle": "Configurer une clé d'accès ?",
      "promptDescription": "Connectez-vous plus rapidement et en toute sécurité avec votre empreinte, visage ou code PIN.",
      "registerButton": "Configurer la clé d'accès", "skipButton": "Ignorer pour l'instant",
      "successMessage": "Clé d'accès enregistrée avec succès !",
      "errorGeneric": "Impossible d'enregistrer la clé d'accès. Vous pouvez réessayer plus tard."
    }
  },
  "AccountPage": {
    "title": "Mon Compte", "subtitle": "Gérez votre profil et vos paramètres de sécurité",
    "profileSection": "Profil", "securitySection": "Sécurité", "passkeySection": "Clés d'accès",
    "emailLabel": "E-mail", "firstNameLabel": "Prénom", "lastNameLabel": "Nom de famille",
    "changePhoto": "Changer la photo", "saveProfile": "Enregistrer le profil", "savingProfile": "Enregistrement…",
    "profileSaved": "Profil enregistré.", "profileError": "Impossible d'enregistrer le profil. Veuillez réessayer.",
    "currentPasswordLabel": "Mot de passe actuel", "newPasswordLabel": "Nouveau mot de passe", "confirmPasswordLabel": "Confirmer le nouveau mot de passe",
    "savePassword": "Mettre à jour le mot de passe", "savingPassword": "Mise à jour…",
    "passwordSaved": "Mot de passe mis à jour.", "passwordError": "Impossible de mettre à jour le mot de passe. Veuillez réessayer.",
    "passwordMismatch": "Les mots de passe ne correspondent pas.", "passwordWrong": "Le mot de passe actuel est incorrect.",
    "noPasskeys": "Aucune clé d'accès enregistrée.", "deletePasskey": "Supprimer",
    "confirmDeletePasskeyTitle": "Supprimer la clé d'accès",
    "confirmDeletePasskeyText": "Êtes-vous sûr de vouloir supprimer cette clé d'accès ? Vous ne pourrez plus l'utiliser pour vous connecter.",
    "passkeyDeleted": "Clé d'accès supprimée.", "passkeyDeleteError": "Impossible de supprimer la clé d'accès. Veuillez réessayer.",
    "addPasskey": "Ajouter une clé d'accès", "passkeyAdded": "Clé d'accès ajoutée.", "passkeyAddError": "Impossible d'ajouter la clé d'accès. Veuillez réessayer.",
    "loading": "Chargement…"
  },
  "ResetPasswordPage": {
    "title": "Définir un nouveau mot de passe",
    "subtitle": "Entrez votre nouveau mot de passe ci-dessous",
    "newPasswordLabel": "Nouveau mot de passe",
    "confirmPasswordLabel": "Confirmer le nouveau mot de passe",
    "submitButton": "Réinitialiser le mot de passe",
    "submitting": "Réinitialisation en cours…",
    "errorPasswordMismatch": "Les mots de passe ne correspondent pas.",
    "errorGeneric": "Une erreur s'est produite. Veuillez réessayer.",
    "successTitle": "Mot de passe réinitialisé !",
    "successDetail": "Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
    "backToSignIn": "Retour à la connexion",
    "invalidTitle": "Lien invalide ou expiré",
    "invalidDetail": "Ce lien de réinitialisation est invalide ou a expiré. Veuillez en demander un nouveau.",
    "requestNewLink": "Demander un nouveau lien"
  }
}
EOF

  elif [[ "${locale}" == "pt" ]]; then
    local copyright_val="© {year} ${title} v{version}. Todos os direitos reservados."
    cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" },
  "Navbar": { "home": "Início", "account": "Minha Conta", "signOut": "Sair" },
  "Footer": {
    "appHeading": "App", "legalHeading": "Legal",
    "home": "Início", "account": "Minha Conta",
    "privacyPolicy": "Política de Privacidade", "terms": "Termos de Serviço", "userData": "Dados do Usuário",
    "copyright": "${copyright_val}"
  },
  "VerifyEmailPage": {
    "loading": "Verificando seu e-mail…",
    "successTitle": "E-mail verificado", "successDetail": "Seu e-mail foi verificado. Você já pode entrar.",
    "redirecting": "Redirecionando em {seconds}…", "redirectProgress": "Progresso do redirecionamento",
    "expiredTitle": "Link expirado", "expiredDetail": "Este link de verificação expirou. Por favor, cadastre-se novamente para solicitar um novo.",
    "invalidTitle": "Link inválido", "invalidDetail": "Este link de verificação é inválido. Verifique seu e-mail ou cadastre-se novamente."
  },
  "AuthPage": {
    "tabSignIn": "Entrar", "tabSignUp": "Cadastrar", "tabReset": "Redefinir senha",
    "signIn": {
      "title": "Entrar", "subtitle": "Bem-vindo de volta",
      "emailLabel": "E-mail", "passwordLabel": "Senha",
      "submitButton": "Entrar", "submitting": "Entrando…",
      "errorInvalidCredentials": "E-mail ou senha inválidos.",
      "errorGeneric": "Algo deu errado. Por favor, tente novamente.",
      "forgotPassword": "Esqueceu sua senha?",
      "noAccount": "Não tem uma conta? Cadastre-se",
      "orDivider": "ou", "passkeyButton": "Entrar com chave de acesso",
      "errorPasskeyFailed": "Falha na autenticação com chave de acesso. Tente novamente.",
      "errorEmailRequired": "Por favor, insira seu e-mail primeiro.",
      "rememberEmail": "Lembrar e-mail"
    },
    "signUp": {
      "title": "Criar conta", "subtitle": "Junte-se ao ${title} hoje",
      "emailLabel": "E-mail", "firstNameLabel": "Nome", "lastNameLabel": "Sobrenome",
      "passwordLabel": "Senha", "confirmPasswordLabel": "Confirmar senha",
      "submitButton": "Criar conta", "submitting": "Criando conta…",
      "successDetail": "Conta criada! Verifique seu e-mail para ativar sua conta.",
      "errorEmailTaken": "Já existe uma conta com este e-mail.",
      "errorPasswordMismatch": "As senhas não correspondem.",
      "errorGeneric": "Algo deu errado. Por favor, tente novamente.",
      "haveAccount": "Já tem uma conta? Entrar",
      "forgotPassword": "Esqueceu sua senha?"
    },
    "resetPassword": {
      "title": "Redefinir senha", "subtitle": "Insira seu e-mail para receber um link",
      "emailLabel": "E-mail", "submitButton": "Enviar link", "submitting": "Enviando…",
      "successDetail": "Se existir uma conta com esse e-mail, um link de redefinição foi enviado.",
      "errorGeneric": "Algo deu errado. Por favor, tente novamente.",
      "backToSignIn": "Voltar ao login"
    },
    "passkey": {
      "promptTitle": "Configurar uma chave de acesso?",
      "promptDescription": "Entre mais rápido e com mais segurança usando sua impressão digital, rosto ou PIN.",
      "registerButton": "Configurar chave de acesso", "skipButton": "Pular por agora",
      "successMessage": "Chave de acesso registrada com sucesso!",
      "errorGeneric": "Falha ao registrar chave de acesso. Você pode tentar novamente mais tarde."
    }
  },
  "AccountPage": {
    "title": "Minha Conta", "subtitle": "Gerencie seu perfil e configurações de segurança",
    "profileSection": "Perfil", "securitySection": "Segurança", "passkeySection": "Chaves de acesso",
    "emailLabel": "E-mail", "firstNameLabel": "Nome", "lastNameLabel": "Sobrenome",
    "changePhoto": "Alterar foto", "saveProfile": "Salvar perfil", "savingProfile": "Salvando…",
    "profileSaved": "Perfil salvo.", "profileError": "Não foi possível salvar o perfil. Tente novamente.",
    "currentPasswordLabel": "Senha atual", "newPasswordLabel": "Nova senha", "confirmPasswordLabel": "Confirmar nova senha",
    "savePassword": "Atualizar senha", "savingPassword": "Atualizando…",
    "passwordSaved": "Senha atualizada.", "passwordError": "Não foi possível atualizar a senha. Tente novamente.",
    "passwordMismatch": "As senhas não correspondem.", "passwordWrong": "A senha atual está incorreta.",
    "noPasskeys": "Nenhuma chave de acesso registrada.", "deletePasskey": "Excluir",
    "confirmDeletePasskeyTitle": "Excluir chave de acesso",
    "confirmDeletePasskeyText": "Tem certeza de que deseja remover esta chave de acesso? Você não poderá usá-la para entrar.",
    "passkeyDeleted": "Chave de acesso removida.", "passkeyDeleteError": "Não foi possível remover a chave. Tente novamente.",
    "addPasskey": "Adicionar chave de acesso", "passkeyAdded": "Chave de acesso adicionada.", "passkeyAddError": "Não foi possível adicionar a chave. Tente novamente.",
    "loading": "Carregando…"
  },
  "ResetPasswordPage": {
    "title": "Definir nova senha",
    "subtitle": "Digite sua nova senha abaixo",
    "newPasswordLabel": "Nova senha",
    "confirmPasswordLabel": "Confirmar nova senha",
    "submitButton": "Redefinir senha",
    "submitting": "Redefinindo senha…",
    "errorPasswordMismatch": "As senhas não coincidem.",
    "errorGeneric": "Algo deu errado. Por favor, tente novamente.",
    "successTitle": "Senha redefinida!",
    "successDetail": "Sua senha foi atualizada. Agora você pode entrar com sua nova senha.",
    "backToSignIn": "Voltar para entrar",
    "invalidTitle": "Link inválido ou expirado",
    "invalidDetail": "Este link de redefinição de senha é inválido ou expirou. Por favor, solicite um novo.",
    "requestNewLink": "Solicitar um novo link"
  }
}
EOF

  else
    # English (default)
    local copyright_val="© {year} ${title} v{version}. All rights reserved."
    cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" },
  "Navbar": { "home": "Home", "account": "Account", "signOut": "Sign out" },
  "Footer": {
    "appHeading": "App", "legalHeading": "Legal",
    "home": "Home", "account": "Account",
    "privacyPolicy": "Privacy Policy", "terms": "Terms of Service", "userData": "User Data",
    "copyright": "${copyright_val}"
  },
  "VerifyEmailPage": {
    "loading": "Verifying your email…",
    "successTitle": "Email Verified", "successDetail": "Your email has been verified. You can now sign in.",
    "redirecting": "Redirecting in {seconds}…", "redirectProgress": "Redirect progress",
    "expiredTitle": "Link Expired", "expiredDetail": "This verification link has expired. Please sign up again to request a new one.",
    "invalidTitle": "Invalid Link", "invalidDetail": "This verification link is invalid. Please check your email or sign up again."
  },
  "AuthPage": {
    "tabSignIn": "Sign In", "tabSignUp": "Sign Up", "tabReset": "Reset Password",
    "signIn": {
      "title": "Sign In", "subtitle": "Welcome back",
      "emailLabel": "Email", "passwordLabel": "Password",
      "submitButton": "Sign In", "submitting": "Signing in…",
      "errorInvalidCredentials": "Invalid email or password.",
      "errorGeneric": "Something went wrong. Please try again.",
      "forgotPassword": "Forgot your password?",
      "noAccount": "Don't have an account? Sign up",
      "orDivider": "or", "passkeyButton": "Sign in with passkey",
      "errorPasskeyFailed": "Passkey authentication failed. Please try again.",
      "errorEmailRequired": "Please enter your email first.",
      "rememberEmail": "Remember email"
    },
    "signUp": {
      "title": "Create Account", "subtitle": "Join ${title} today",
      "emailLabel": "Email", "firstNameLabel": "First Name", "lastNameLabel": "Last Name",
      "passwordLabel": "Password", "confirmPasswordLabel": "Confirm Password",
      "submitButton": "Create Account", "submitting": "Creating account…",
      "successDetail": "Account created! Please check your email to verify your account.",
      "errorEmailTaken": "An account with this email already exists.",
      "errorPasswordMismatch": "Passwords do not match.",
      "errorGeneric": "Something went wrong. Please try again.",
      "haveAccount": "Already have an account? Sign in",
      "forgotPassword": "Forgot your password?"
    },
    "resetPassword": {
      "title": "Reset Password", "subtitle": "Enter your email to receive a reset link",
      "emailLabel": "Email", "submitButton": "Send Reset Link", "submitting": "Sending…",
      "successDetail": "If an account with that email exists, a password reset link has been sent.",
      "errorGeneric": "Something went wrong. Please try again.",
      "backToSignIn": "Back to Sign In"
    },
    "passkey": {
      "promptTitle": "Set up a passkey?",
      "promptDescription": "Sign in faster and more securely with a passkey. Use your fingerprint, face, or device PIN.",
      "registerButton": "Set up passkey", "skipButton": "Skip for now",
      "successMessage": "Passkey registered successfully!",
      "errorGeneric": "Failed to register passkey. You can try again later."
    }
  },
  "AccountPage": {
    "title": "My Account", "subtitle": "Manage your profile and security settings",
    "profileSection": "Profile", "securitySection": "Security", "passkeySection": "Passkeys",
    "emailLabel": "Email", "firstNameLabel": "First Name", "lastNameLabel": "Last Name",
    "changePhoto": "Change Photo", "saveProfile": "Save Profile", "savingProfile": "Saving…",
    "profileSaved": "Profile saved.", "profileError": "Failed to save profile. Please try again.",
    "currentPasswordLabel": "Current Password", "newPasswordLabel": "New Password", "confirmPasswordLabel": "Confirm New Password",
    "savePassword": "Update Password", "savingPassword": "Updating…",
    "passwordSaved": "Password updated.", "passwordError": "Failed to update password. Please try again.",
    "passwordMismatch": "Passwords do not match.", "passwordWrong": "Current password is incorrect.",
    "noPasskeys": "No passkeys registered.", "deletePasskey": "Delete",
    "confirmDeletePasskeyTitle": "Delete Passkey",
    "confirmDeletePasskeyText": "Are you sure you want to remove this passkey? You won't be able to use it to sign in.",
    "passkeyDeleted": "Passkey removed.", "passkeyDeleteError": "Failed to remove passkey. Please try again.",
    "addPasskey": "Add Passkey", "passkeyAdded": "Passkey added.", "passkeyAddError": "Failed to add passkey. Please try again.",
    "loading": "Loading…"
  },
  "ResetPasswordPage": {
    "title": "Set New Password",
    "subtitle": "Enter your new password below",
    "newPasswordLabel": "New Password",
    "confirmPasswordLabel": "Confirm New Password",
    "submitButton": "Reset Password",
    "submitting": "Resetting password…",
    "errorPasswordMismatch": "Passwords do not match.",
    "errorGeneric": "Something went wrong. Please try again.",
    "successTitle": "Password reset!",
    "successDetail": "Your password has been updated. You can now sign in with your new password.",
    "backToSignIn": "Back to Sign In",
    "invalidTitle": "Link invalid or expired",
    "invalidDetail": "This password reset link is invalid or has expired. Please request a new one.",
    "requestNewLink": "Request a new reset link"
  }
}
EOF
  fi
}

gen_helm_files() {
  local base="$1"
  mkdir -p "${base}/templates"

  # Chart.yaml
  cat > "${base}/Chart.yaml" << EOF
apiVersion: v2
name: ${name}
description: Helm chart for the Next.js ${name} application
type: application
version: 0.1.0
appVersion: '0.1.0'
EOF

  # values.yaml
  # API_URL is server-only (never NEXT_PUBLIC_) and is injected at runtime from a
  # k8s secret, not baked at build time.
  local secret_block="envFromSecret:
  - name: API_URL
    secretName: ${name}-secrets
    secretKey: API_URL"

  cat > "${base}/values.yaml" << EOF
revisionHistoryLimit: 2
replicaCount: 1

image:
  # Overridden at deploy time from DOCKER_REGISTRY (.env) → \${DOCKER_REGISTRY}/${name}
  repository: ${name}
  tag: 'latest'
  pullPolicy: IfNotPresent

imagePullSecrets: []
nameOverride: ''
fullnameOverride: ''

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

ingress:
  enabled: true
  className: 'nginx'
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
  hosts:
    - host: ${host}
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${name}-tls
      hosts:
        - ${host}

env:
  NODE_ENV: 'production'
  NEXT_TELEMETRY_DISABLED: '1'

${secret_block}

probes:
  startupProbe:
    httpGet:
      path: /
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 30
  livenessProbe:
    httpGet:
      path: /
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 3

nodeAffinity:
  enabled: false
  nodeNames: []

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
EOF

  # _helpers.tpl
  cat > "${base}/templates/_helpers.tpl" << EOF
{{- define "${name}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "${name}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- \$name := default .Chart.Name .Values.nameOverride }}
{{- if contains \$name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name \$name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "${name}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "${name}.labels" -}}
helm.sh/chart: {{ include "${name}.chart" . }}
{{ include "${name}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "${name}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${name}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

EOF

  # deployment.yaml
  cat > "${base}/templates/deployment.yaml" << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit }}
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- if .Values.nodeAffinity.enabled }}
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values:
                      {{- toYaml .Values.nodeAffinity.nodeNames | nindent 22 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          {{- if or .Values.env .Values.envFromSecret }}
          env:
            {{- range \$key, \$value := .Values.env }}
            - name: {{ \$key }}
              value: {{ \$value | quote }}
            {{- end }}
            {{- range .Values.envFromSecret }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ .secretName }}
                  key: {{ .secretKey }}
            {{- end }}
          {{- end }}
          startupProbe:
            httpGet:
              path: {{ .Values.probes.startupProbe.httpGet.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.startupProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.startupProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.startupProbe.failureThreshold }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.livenessProbe.httpGet.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.livenessProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.livenessProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.livenessProbe.failureThreshold }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
EOF

  # service.yaml
  cat > "${base}/templates/service.yaml" << EOF
apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
EOF

  # ingress.yaml
  cat > "${base}/templates/ingress.yaml" << 'HELMEOF'
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "APP_NAME.fullname" . }}
  labels:
    {{- include "APP_NAME.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - secretName: {{ .secretName | default (printf "%s-tls" (index .hosts 0 | default "app")) }}
      hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- $paths := .paths | default (list (dict "path" "/" "pathType" "Prefix")) }}
          {{- range $paths }}
          - path: {{ .path }}
            pathType: {{ .pathType | default "Prefix" }}
            backend:
              service:
                name: {{ include "APP_NAME.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
HELMEOF
  # Replace APP_NAME placeholder with actual name
  sed -i.bak "s/APP_NAME/${name}/g" "${base}/templates/ingress.yaml" && rm -f "${base}/templates/ingress.yaml.bak"

  # NOTES.txt
  cat > "${base}/templates/NOTES.txt" << EOF
{{ include "${name}.fullname" . }} has been deployed!

{{- if .Values.ingress.enabled }}
Application URL:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}
{{- end }}
{{- end }}
EOF
}


# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # ── Language ─────────────────────────────────────────────────────────────────
  local lang="en"
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # ── [1/2] Configuration ───────────────────────────────────────────────────
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_CONFIG} ──")"

  # App name
  local err=""
  while true; do
    name="$(prompt_visible "${APP_NAME_PROMPT}")"
    err="$(validate_app_name "${name}")"
    if [[ -z "${err}" ]]; then break; fi
    printf "  %s\n\n" "$(clr_bold_red "${err}")" >/dev/tty
  done

  title="$(to_title_case "${name}")"

  port="$(prompt_visible "${PORT_PROMPT}" '3000')"
  [[ -z "${port}" ]] && port="3000"

  palette="$(select_palette)"
  accent="$(palette_to_accent "${palette}")"

  registry_user="$(prompt_visible "${REGISTRY_PROMPT}" 'my-username')"
  [[ -z "${registry_user}" ]] && registry_user="my-username"

  host="$(prompt_visible "${HOST_PROMPT}" "${name}.iguzman.com.mx")"
  [[ -z "${host}" ]] && host="${name}.iguzman.com.mx"

  echo ""
  include_pwa="n";  confirm_yn "${PWA_PROMPT}" 'y'  && include_pwa="y"

  echo ""
  echo "  ┌─────────────────────────────────┐"
  printf "  │  %-31s│\n" "$(clr_bold "${name}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_PORT}: ${port}  ${LBL_PALETTE}: ${palette}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_PWA}: ${include_pwa}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_REGISTRY}: ${registry_user}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_HOST}: ${host}")"
  echo "  └─────────────────────────────────┘"
  echo ""
  confirm_yn "${GENERATE_PROMPT}" 'y' || { echo ""; echo "  $(clr_bold_yellow "${ABORTED_MSG}")"; echo ""; exit 0; }

  # ── [2/2] Generating files ────────────────────────────────────────────────
  echo ""
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_FILES} ──")"

  local app_dir="${repo_root}/apps/${name}"

  gen_package_json                   "${app_dir}/package.json"
  gen_turbo_json                     "${app_dir}/turbo.json"
  gen_next_config_js                 "${app_dir}/next.config.js"
  gen_tsconfig_json                  "${app_dir}/tsconfig.json"
  gen_eslint_config_js               "${app_dir}/eslint.config.js"
  gen_gitignore                      "${app_dir}/.gitignore"
  gen_dockerignore                   "${app_dir}/.dockerignore"
  gen_dockerfile                     "${app_dir}/Dockerfile"
  gen_css_dts                        "${app_dir}/css.d.ts"
  gen_global_dts                     "${app_dir}/global.d.ts"
  gen_env_example                    "${app_dir}/.env.example"
  gen_proxy_ts                       "${app_dir}/proxy.ts"
  gen_globals_css                    "${app_dir}/app/globals.css"
  gen_i18n_request_ts                "${app_dir}/i18n/request.ts"
  gen_lib_logger_ts                  "${app_dir}/lib/logger.ts"
  gen_layout_tsx                     "${app_dir}/app/[locale]/layout.tsx"
  gen_page_tsx                       "${app_dir}/app/[locale]/page.tsx"

  # messages - translated per locale
  for locale in en es de fr pt; do
    gen_messages_json                "${app_dir}/messages/${locale}.json" "${locale}"
  done

  # PWA files
  if [[ "${include_pwa}" == "y" ]]; then
    gen_manifest_ts                  "${app_dir}/app/manifest.ts"
    gen_sw_ts                        "${app_dir}/app/sw.ts"
    gen_offline_page_tsx             "${app_dir}/app/[locale]/~offline/page.tsx"
  fi

  # Auth files - all of it wired to @repo/auth (see packages/auth/CLAUDE.md)
  gen_navbar_wrapper_tsx             "${app_dir}/app/[locale]/navbar-wrapper.tsx"
  gen_footer_tsx                     "${app_dir}/app/[locale]/footer.tsx"
  gen_footer_css                     "${app_dir}/app/[locale]/footer.css"
  gen_lib_auth_ts                    "${app_dir}/lib/auth.ts"
  gen_lib_api_fetch_ts               "${app_dir}/lib/api-fetch.ts"
  gen_auth_pages                     "${app_dir}/app/[locale]/(auth)"
  gen_account_pages                  "${app_dir}/app/[locale]/account"
  gen_api_auth_routes                "${app_dir}/app/api/auth"

  # Helm
  gen_helm_files                     "${app_dir}/helm"

  # Public placeholder dirs + core UI icons required by @repo/ui components.
  # fingerprint.svg (passkey prompts) and delete-trash-icon.svg (the account
  # page's passkey list) are rendered by the shared @repo/auth forms.
  mkdir -p "${app_dir}/public/icons/splash"
  touch "${app_dir}/public/icons/splash/.gitkeep"
  local cli_icons="${repo_root}/cli/new-nextjs-app/public/icons"
  cp "${cli_icons}/hamburger.svg" "${cli_icons}/close.svg" "${cli_icons}/search.svg" \
     "${cli_icons}/chevron-down.svg" "${cli_icons}/mic.svg" "${cli_icons}/fingerprint.svg" \
     "${cli_icons}/delete-trash-icon.svg" \
     "${app_dir}/public/icons/"

  # Copy .env.example → .env
  printf "  %s\n" "$(clr_dim "${COPYING_ENV_MSG}")"
  cp "${app_dir}/.env.example" "${app_dir}/.env"

  # Install dependencies
  printf "  %s\n\n" "$(clr_dim "${INSTALLING_DEPS_MSG}")"
  (cd "${repo_root}" && pnpm install)

  # ── Done ──────────────────────────────────────────────────────────────────
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "── ${DONE_MSG} ──")"
  echo ""
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "apps/${name} created!")"
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "── ${NEXT_STEPS} ──")"
  echo ""
  printf "  %s  %s\n" "$(clr_dim '1.')" "$(clr_cyan "${NEXT_STEP_AUTH_API}")"
  printf "  %s  %s\n" "$(clr_dim '2.')" "$(clr_cyan "pnpm dev --filter=${name}")"
  [[ "${include_pwa}" == "y" ]] && \
  printf "  %s  %s\n" "$(clr_dim '3.')" "$(clr_cyan "${NEXT_STEP_PWA_ICONS} apps/${name}/public/icons/")"
  echo ""
  printf "  %s  %s\n" "$(clr_bold_yellow '!')" "$(clr_bold_yellow "${ENV_REMINDER/APP_NAME/${name}}")"
  echo ""
}

main "$@"
