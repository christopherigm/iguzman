#!/usr/bin/env bash
# new-nextjs-app.sh — interactive Next.js app scaffold
# Based on apps/edge-folio architecture (i18n + auth + PWA + Helm)
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
    AUTH_PROMPT="¿Incluir autenticación? (JWT cookies, passkeys, páginas auth, proxy API)"
    PWA_PROMPT="¿Incluir PWA? (Serwist service worker, manifest, página offline)"
    STEP_CONFIG="[1/2] Configuración"
    STEP_FILES="[2/2] Generando archivos"
    GENERATE_PROMPT="¿Generar app?"
    ABORTED_MSG="Cancelado."
    LBL_PORT="Puerto"
    LBL_PALETTE="Paleta"
    LBL_AUTH="Auth"
    LBL_PWA="PWA"
    LBL_REGISTRY="Registro"
    LBL_HOST="Host"
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    NEXT_STEP_AUTH_API="# Configura API_URL en .env.local e inicia la API Django"
    NEXT_STEP_PWA_ICONS="# Agrega íconos PWA a"
    COPYING_ENV_MSG="Copiando .env.local…"
    INSTALLING_DEPS_MSG="Instalando dependencias (pnpm install)…"
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
    AUTH_PROMPT="Include auth? (JWT cookies, passkeys, auth pages, API proxy)"
    PWA_PROMPT="Include PWA? (Serwist service worker, manifest, offline page)"
    STEP_CONFIG="[1/2] Configuration"
    STEP_FILES="[2/2] Generating files"
    GENERATE_PROMPT="Generate app?"
    ABORTED_MSG="Aborted."
    LBL_PORT="Port"
    LBL_PALETTE="Palette"
    LBL_AUTH="Auth"
    LBL_PWA="PWA"
    LBL_REGISTRY="Registry"
    LBL_HOST="Host"
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    NEXT_STEP_AUTH_API="# Set API_URL in .env.local and start the Django API"
    NEXT_STEP_PWA_ICONS="# Add PWA icons to"
    COPYING_ENV_MSG="Copying .env.local…"
    INSTALLING_DEPS_MSG="Installing dependencies (pnpm install)…"
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
  local suffix default_upper="${default^^}"; suffix="[Y/N] (${default_upper})"
  printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${suffix}")" >/dev/tty
  local val; IFS= read -r val </dev/tty || true
  val="${val:-${default}}"; local char="${val:0:1}"; char="${char,,}"
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
  for word in "${words[@]}"; do [[ -n "${word}" ]] && result+="${word^} "; done
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
# Globals used by all generators: name title port palette accent registry_user host include_auth include_pwa

gen_package_json() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  local ts_comma="," pwa_devdep="" deps_tail=""
  if [[ "${include_pwa}" == "y" && "${include_auth}" == "y" ]]; then
    deps_tail=',
    "@serwist/next": "^9.5.11",
    "@simplewebauthn/browser": "^13.1.0"'
  elif [[ "${include_pwa}" == "y" ]]; then
    deps_tail=',
    "@serwist/next": "^9.5.11"'
  elif [[ "${include_auth}" == "y" ]]; then
    deps_tail=',
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
    "@repo/helpers": "workspace:*",
    "@swc/helpers": "^0.5.21",
    "@repo/ui": "workspace:*",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "swiper": "^12.1.3",
    "pino": "^10.3.1",
    "@repo/i18n": "workspace:^",
    "next-intl": "^4"${deps_tail}
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^25.5.2",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "eslint": "^10.2.0",
    "typescript": "6.0.2"${ts_comma}${pwa_devdep}
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
EOF
  [[ "${include_auth}" == "y" ]] && cat >> "$out" << 'TXTEOF'

# Django API base URL — server-side only, never NEXT_PUBLIC_
# Local: http://localhost:8000
API_URL=http://localhost:8000
TXTEOF
}


gen_proxy_ts() {
  local out="$1"; mkdir -p "$(dirname "$out")"
  if [[ "${include_auth}" == "y" ]]; then
    cat > "$out" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ['/account'];

function isProtectedPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '');
  return PROTECTED_PREFIXES.some((prefix) => withoutLocale.startsWith(prefix));
}

export default function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname)) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      const locale = request.nextUrl.pathname.split('/')[1] ?? 'en';
      return NextResponse.redirect(new URL(`/${locale}/auth`, request.url));
    }
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
TSEOF
  else
    cat > "$out" << 'TSEOF'
import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*)*)',
};
TSEOF
  fi
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
  background: var(--background);
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
import { cookies } from 'next/headers';

const API = process.env.API_URL;
const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_OPTS = { httpOnly: true, secure: IS_PROD, sameSite: 'strict' as const, path: '/' };

async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refresh = cookieStore.get('refresh_token')?.value;
  if (!refresh) return null;

  const res = await fetch(`${API}/api/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    cookieStore.delete('access_token');
    cookieStore.delete('refresh_token');
    return null;
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  cookieStore.set('access_token', data.access, { ...COOKIE_OPTS, maxAge: 60 * 60 });
  if (data.refresh) {
    cookieStore.set('refresh_token', data.refresh, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });
  }
  return data.access;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  let token = cookieStore.get('access_token')?.value;
  if (!token) return Response.json({ detail: 'Unauthorized' }, { status: 401 });

  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` },
  });

  let res = await fetch(`${API}${path}`, withAuth(token));

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return Response.json({ detail: 'Unauthorized' }, { status: 401 });
    res = await fetch(`${API}${path}`, withAuth(newToken));
  }

  return res;
}
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

  if [[ "${include_auth}" == "y" ]]; then
    navbar_import="import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';"
    tNav_decl="
  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (key: string) => string;"
    navbar_jsx="            <NavbarWrapper
              logo=\"/logo-navbar.png\"
              version={\`v\${packageJson.version}\`}
              labels={{ home: tNav('home'), account: tNav('account'), signOut: tNav('signOut') }}
            />
            {children}
            <Footer />"
  else
    navbar_import="import { Navbar } from '@repo/ui/core-elements/navbar';"
    tNav_decl=""
    navbar_jsx="            <Navbar
              logo=\"/logo.png\"
              items={[{ label: 'Home', href: '/' }]}
              fixedItems={[]}
              version={\`v\${packageJson.version}\`}
            />
            {children}"
  fi

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
        <ThemeProvider initialMode={initialMode} initialResolved={initialResolved}>
          <PaletteProvider palette="${palette}" accent="${accent}">
${navbar_jsx}
          </PaletteProvider>
        </ThemeProvider>
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

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { logout, clearUser, getStoredUser } from '@/lib/auth';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; account: string; signOut: string };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(getStoredUser()?.displayName ?? null);
    const handler = (e: Event) => {
      setDisplayName((e as CustomEvent<{ displayName: string | null }>).detail.displayName);
    };
    window.addEventListener('app-auth', handler);
    return () => window.removeEventListener('app-auth', handler);
  }, []);

  const handleSignOut = async () => {
    await logout();
    clearUser();
    router.push('/auth');
  };

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
import './footer.css';

export async function Footer() {
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
              <Image src="/logo-navbar.png" alt="${title}" width={140} height={44} className="footer__logo" />
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
          <Typography as="p" variant="body-sm" textAlign="center" className="footer__description">
            {t('copyright', { year: new Date().getFullYear() })}
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
export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
}

const USER_PROFILE_KEY = 'app_user';

export function storeUser(profile: UserProfile): void {
  const raw = (profile.first_name?.trim() || profile.email) ?? '';
  const displayName = raw.substring(0, 10);
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify({ displayName }));
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName } }));
}

export function clearUser(): void {
  localStorage.removeItem(USER_PROFILE_KEY);
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName: null } }));
}

export function getStoredUser(): { displayName: string } | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { displayName: string }) : null;
  } catch { return null; }
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly data: Record<string, unknown>) {
    super('API request failed');
  }
}

export class LoginError extends Error {
  constructor(public readonly status: number, public readonly data: Record<string, unknown>) {
    super('Login failed');
  }
}

export async function login(payload: { email: string; password: string }): Promise<void> {
  const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new LoginError(res.status, data); }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function signUp(payload: { email: string; password: string; password2: string; first_name?: string; last_name?: string }): Promise<void> {
  const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
}

export async function verifyEmail(token: string): Promise<void> {
  const res = await fetch(`/api/auth/verify-email/${token}`);
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch('/api/auth/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile');
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
  return res.json() as Promise<UserProfile>;
}

export async function updateProfile(payload: { first_name?: string; last_name?: string }): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
  return res.json() as Promise<UserProfile>;
}

export async function uploadProfilePicture(base64Image: string): Promise<{ profile_picture: string | null }> {
  const res = await fetch('/api/auth/profile/picture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64_image: base64Image }) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
  return res.json() as Promise<{ profile_picture: string | null }>;
}

export async function changePassword(currentPassword: string, newPassword: string, newPassword2: string): Promise<void> {
  const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, new_password2: newPassword2 }) });
  if (!res.ok) { const data: Record<string, unknown> = await res.json().catch(() => ({})); throw new ApiError(res.status, data); }
}

export async function deletePasskeyCredential(id: number): Promise<void> {
  const res = await fetch(`/api/auth/passkey/credentials/${id}`, { method: 'DELETE' });
  if (!res.ok) { throw new ApiError(res.status, {}); }
}

export async function getPasskeyCredentials(): Promise<{ count: number; credentials: { id: number; name: string; created_at: string }[] }> {
  const res = await fetch('/api/auth/passkey/credentials');
  if (!res.ok) return { count: 0, credentials: [] };
  return res.json() as Promise<{ count: number; credentials: { id: number; name: string; created_at: string }[] }>;
}

export async function registerPasskey(name = 'My passkey'): Promise<{ id: number; name: string }> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const optionsRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
  if (!optionsRes.ok) { const data: Record<string, unknown> = await optionsRes.json().catch(() => ({})); throw new ApiError(optionsRes.status, data); }
  const { options, challenge_id } = (await optionsRes.json()) as { options: Parameters<typeof startRegistration>[0]['optionsJSON']; challenge_id: string };
  const credential = await startRegistration({ optionsJSON: options });
  const verifyRes = await fetch('/api/auth/passkey/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, challenge_id, name }) });
  if (!verifyRes.ok) { const data: Record<string, unknown> = await verifyRes.json().catch(() => ({})); throw new ApiError(verifyRes.status, data); }
  return verifyRes.json() as Promise<{ id: number; name: string }>;
}

export async function loginWithPasskey(email: string): Promise<void> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const optionsRes = await fetch('/api/auth/passkey/authenticate/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!optionsRes.ok) { const data: Record<string, unknown> = await optionsRes.json().catch(() => ({})); throw new LoginError(optionsRes.status, data); }
  const { options, challenge_id } = (await optionsRes.json()) as { options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challenge_id: string };
  const credential = await startAuthentication({ optionsJSON: options });
  const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, credential, challenge_id }) });
  if (!verifyRes.ok) { const data: Record<string, unknown> = await verifyRes.json().catch(() => ({})); throw new LoginError(verifyRes.status, data); }
}
TSEOF
}


gen_api_auth_routes() {
  local base="$1"

  # login
  mkdir -p "${base}/login"
  cat > "${base}/login/route.ts" << 'TSEOF'
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieStore = await cookies();
  cookieStore.set('access_token', data.access as string, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 60 * 60 });
  cookieStore.set('refresh_token', data.refresh as string, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 7 });
  return NextResponse.json({ ok: true });
}
TSEOF

  # logout
  mkdir -p "${base}/logout"
  cat > "${base}/logout/route.ts" << 'TSEOF'
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
  return NextResponse.json({ ok: true });
}
TSEOF

  # signup
  mkdir -p "${base}/signup"
  cat > "${base}/signup/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/signup/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # profile
  mkdir -p "${base}/profile"
  cat > "${base}/profile/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET() {
  const res = await apiFetch('/api/auth/profile/');
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/profile/', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # profile/picture
  mkdir -p "${base}/profile/picture"
  cat > "${base}/profile/picture/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/profile/picture/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # change-password
  mkdir -p "${base}/change-password"
  cat > "${base}/change-password/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/change-password/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # verify-email/[token]
  mkdir -p "${base}/verify-email/[token]"
  cat > "${base}/verify-email/[token]/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${process.env.API_URL}/api/auth/verify-email/${token}/`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # password-reset
  mkdir -p "${base}/password-reset"
  cat > "${base}/password-reset/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/password-reset/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  # passkey routes
  mkdir -p "${base}/passkey/register/options"
  cat > "${base}/passkey/register/options/route.ts" << 'TSEOF'
import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST() {
  const res = await apiFetch('/api/auth/passkey/register/options/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  if (!res.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  mkdir -p "${base}/passkey/authenticate/options"
  cat > "${base}/passkey/authenticate/options/route.ts" << 'TSEOF'
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/passkey/authenticate/options/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
TSEOF

  mkdir -p "${base}/passkey/authenticate/verify"
  cat > "${base}/passkey/authenticate/verify/route.ts" << 'TSEOF'
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/passkey/authenticate/verify/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieStore = await cookies();
  cookieStore.set('access_token', data.access as string, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 60 * 60 });
  cookieStore.set('refresh_token', data.refresh as string, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 7 });
  return NextResponse.json({ ok: true });
}
TSEOF

  mkdir -p "${base}/passkey/credentials"
  cat > "${base}/passkey/credentials/route.ts" << 'TSEOF'
import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET() {
  const res = await apiFetch('/api/auth/passkey/credentials/');
  if (!res.ok) return NextResponse.json({ count: 0, credentials: [] });
  const data: unknown = await res.json();
  return NextResponse.json(data);
}
TSEOF

  mkdir -p "${base}/passkey/credentials/[id]"
  cat > "${base}/passkey/credentials/[id]/route.ts" << 'TSEOF'
import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await apiFetch(`/api/auth/passkey/credentials/${id}/`, { method: 'DELETE' });
  return new NextResponse(null, { status: res.status });
}
TSEOF
}


gen_auth_pages() {
  local base="$1"   # apps/<name>/app/[locale]/(auth)

  # auth/page.tsx
  mkdir -p "${base}/auth"
  cat > "${base}/auth/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from './auth-form';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';

type Props = { params: Promise<{ locale: string }> };

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (<><NavbarSpacer /><AuthForm /></>);
}
TSEOF

  # auth/auth-form.css
  cat > "${base}/auth/auth-form.css" << 'CSSEOF'
.auth-form__form { display: flex; flex-direction: column; gap: 16px; }
.auth-form__tabs { display: flex; border-bottom: 1px solid var(--border, #e5e7eb); margin-bottom: 4px; }
.auth-form__tab-btn { flex: 1; padding: 10px 4px; font-size: 13px; font-weight: 400; color: var(--muted-foreground, #6b7280); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.15s; margin-bottom: -1px; }
.auth-form__tab-btn[data-active='true'] { font-weight: 600; color: var(--foreground); border-bottom-color: var(--foreground); }
.auth-form__error { color: var(--error, #ef4444); padding: 8px 12px; border-radius: 6px; background: var(--error-bg, rgba(239,68,68,0.08)); }
.auth-form__divider { display: flex; align-items: center; gap: 12px; color: var(--muted-foreground, #6b7280); font-size: 13px; }
.auth-form__divider::before, .auth-form__divider::after { content: ''; flex: 1; height: 1px; background: var(--border, #e5e7eb); }
.auth-form__passkey-icon-btn { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; border: 1.5px solid var(--border, #e5e7eb); background: transparent; cursor: pointer; transition: background 0.15s, opacity 0.15s; padding: 0; }
.auth-form__passkey-icon-btn:hover:not(:disabled) { background: var(--surface-2, #f3f4f6); }
.auth-form__passkey-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.auth-form__success { color: var(--success, #22c55e); padding: 8px 12px; border-radius: 6px; background: var(--success-bg, rgba(34,197,94,0.08)); text-align: center; }
CSSEOF

  # auth/auth-form.tsx
  cat > "${base}/auth/auth-form.tsx" << 'TSEOF'
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { LinkButton } from '@repo/ui/core-elements/link-button';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import { Switch } from '@repo/ui/core-elements/switch';
import './auth-form.css';
import { login, LoginError, signUp, requestPasswordReset, ApiError, loginWithPasskey, registerPasskey, getPasskeyCredentials, getProfile, storeUser } from '@/lib/auth';

const REMEMBERED_EMAIL_KEY = 'auth_remembered_email';
const REMEMBER_EMAIL_PREF_KEY = 'auth_remember_email';

type Tab = 'sign-in' | 'sign-up' | 'reset-password';

function ErrorMessage({ message }: { message: string }) {
  return <Typography variant="caption" role="alert" className="auth-form__error">{message}</Typography>;
}

function SignInTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyPrompt, setPasskeyPrompt] = useState(false);
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    const pref = localStorage.getItem(REMEMBER_EMAIL_PREF_KEY) === 'true';
    setRememberEmail(pref);
    if (pref) { const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''; if (saved) setEmail(saved); }
  }, []);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, value);
  }

  function handleRememberEmailChange(checked: boolean) {
    setRememberEmail(checked);
    localStorage.setItem(REMEMBER_EMAIL_PREF_KEY, String(checked));
    if (checked) { if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email); }
    else { localStorage.removeItem(REMEMBERED_EMAIL_KEY); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      await login({ email, password });
      storeUser(await getProfile());
      const { count } = await getPasskeyCredentials();
      if (count === 0) { setPasskeyPrompt(true); setLoading(false); return; }
      router.push('/');
    } catch (err) {
      setError(err instanceof LoginError && err.status === 401 ? t('signIn.errorInvalidCredentials') : t('signIn.errorGeneric'));
    } finally { setLoading(false); }
  }

  async function handlePasskeySignIn() {
    if (!email) { setError(t('signIn.errorEmailRequired')); return; }
    setError(null); setLoading(true);
    try { await loginWithPasskey(email); storeUser(await getProfile()); router.push('/'); }
    catch (err) { setError(err instanceof LoginError ? t('signIn.errorPasskeyFailed') : t('signIn.errorGeneric')); }
    finally { setLoading(false); }
  }

  async function handleRegisterPasskey() {
    setError(null); setLoading(true);
    try { await registerPasskey(); setPasskeySuccess(true); setTimeout(() => router.push('/'), 1500); }
    catch { setError(t('passkey.errorGeneric')); }
    finally { setLoading(false); }
  }

  if (passkeyPrompt) {
    return (
      <Box display="flex" flexDirection="column" gap={16} alignItems="center">
        <Typography variant="body-sm" fontWeight={600}>{t('passkey.promptTitle')}</Typography>
        <Typography variant="caption" styles={{ textAlign: 'center' }}>{t('passkey.promptDescription')}</Typography>
        {passkeySuccess && <Typography variant="caption" className="auth-form__success">{t('passkey.successMessage')}</Typography>}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar />}
        {!passkeySuccess && (
          <>
            <Button text={t('passkey.registerButton')} type="button" onClick={handleRegisterPasskey} size="md" width="100%" kind="success" />
            <LinkButton onClick={() => router.push('/')} label={t('passkey.skipButton')} />
          </>
        )}
      </Box>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form__form">
      <TextInput label={t('signIn.emailLabel')} type="email" value={email} onChange={handleEmailChange} required autoComplete="email" />
      <TextInput label={t('signIn.passwordLabel')} type="password" value={password} onChange={setPassword} required autoComplete="current-password" />
      <Box display="flex" alignItems="center" gap={8}>
        <Switch checked={rememberEmail} onChange={handleRememberEmailChange} />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">{t('signIn.rememberEmail')}</Typography>
      </Box>
      {error && <ErrorMessage message={error} />}
      {loading && <ProgressBar label={t('signIn.submitting')} />}
      <Button text={loading ? t('signIn.submitting') : t('signIn.submitButton')} type="submit" size="md" width="100%" marginTop={4} kind={email && password ? 'success' : undefined} disabled={!email || !password} />
      <Typography variant="none" className="auth-form__divider">{t('signIn.orDivider')}</Typography>
      <Box display="flex" justifyContent="center" gap={12}>
        <Button unstyled type="button" onClick={handlePasskeySignIn} disabled={!email} className="auth-form__passkey-icon-btn" aria-label={t('signIn.passkeyButton')} title={t('signIn.passkeyButton')}>
          <Image src="/icons/fingerprint.svg" width={28} height={28} alt="" />
        </Button>
      </Box>
      <Box display="flex" flexDirection="column" gap={8} alignItems="center">
        <LinkButton onClick={() => switchTab('reset-password')} label={t('signIn.forgotPassword')} />
        <LinkButton onClick={() => switchTab('sign-up')} label={t('signIn.noAccount')} />
      </Box>
    </form>
  );
}

function SignUpTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState(''); const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState(''); const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSuccess(null);
    if (password !== password2) { setError(t('signUp.errorPasswordMismatch')); return; }
    setLoading(true);
    try {
      await signUp({ email, password, password2, first_name: firstName || undefined, last_name: lastName || undefined });
      setSuccess(t('signUp.successDetail'));
    } catch (err) {
      if (err instanceof ApiError) {
        const emailErr = (err.data as Record<string, string[]>)?.email;
        setError(emailErr ? (Array.isArray(emailErr) ? (emailErr[0] ?? t('signUp.errorGeneric')) : String(emailErr)) : t('signUp.errorGeneric'));
      } else { setError(t('signUp.errorGeneric')); }
    } finally { setLoading(false); }
  }

  if (success) return (
    <Box display="flex" flexDirection="column" gap={16} alignItems="center" styles={{ textAlign: 'center' }}>
      <Typography variant="body-sm">{success}</Typography>
      <LinkButton onClick={() => switchTab('sign-in')} label={t('signUp.haveAccount')} />
    </Box>
  );

  return (
    <form onSubmit={handleSubmit} className="auth-form__form">
      <Box display="flex" gap={12}>
        <TextInput label={t('signUp.firstNameLabel')} type="text" value={firstName} onChange={setFirstName} autoComplete="given-name" />
        <TextInput label={t('signUp.lastNameLabel')} type="text" value={lastName} onChange={setLastName} autoComplete="family-name" />
      </Box>
      <TextInput label={t('signUp.emailLabel')} type="email" value={email} onChange={setEmail} required autoComplete="email" />
      <TextInput label={t('signUp.passwordLabel')} type="password" value={password} onChange={setPassword} required autoComplete="new-password" />
      <TextInput label={t('signUp.confirmPasswordLabel')} type="password" value={password2} onChange={setPassword2} required autoComplete="new-password" />
      {error && <ErrorMessage message={error} />}
      {loading && <ProgressBar label={t('signUp.submitting')} />}
      <Button text={loading ? t('signUp.submitting') : t('signUp.submitButton')} type="submit" size="md" width="100%" marginTop={4} kind={email && password && password2 && password === password2 ? 'success' : undefined} disabled={!email || !password || !password2 || password !== password2} />
      <Box display="flex" flexDirection="column" gap={8} alignItems="center">
        <LinkButton onClick={() => switchTab('sign-in')} label={t('signUp.haveAccount')} />
        <LinkButton onClick={() => switchTab('reset-password')} label={t('signUp.forgotPassword')} />
      </Box>
    </form>
  );
}

function ResetPasswordTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState(''); const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSuccess(null); setLoading(true);
    try { await requestPasswordReset(email); setSuccess(t('resetPassword.successDetail')); }
    catch { setError(t('resetPassword.errorGeneric')); }
    finally { setLoading(false); }
  }

  return success ? (
    <Box display="flex" flexDirection="column" gap={16}>
      <Typography variant="body-sm">{success}</Typography>
      <LinkButton onClick={() => switchTab('sign-in')} label={t('resetPassword.backToSignIn')} />
    </Box>
  ) : (
    <form onSubmit={handleSubmit} className="auth-form__form">
      <TextInput label={t('resetPassword.emailLabel')} type="email" value={email} onChange={setEmail} required autoComplete="email" />
      {error && <ErrorMessage message={error} />}
      {loading && <ProgressBar label={t('resetPassword.submitting')} />}
      <Button text={loading ? t('resetPassword.submitting') : t('resetPassword.submitButton')} type="submit" size="md" width="100%" marginTop={4} kind={email ? 'success' : undefined} disabled={!email} />
      <Box display="flex" justifyContent="center">
        <LinkButton onClick={() => switchTab('sign-in')} label={t('resetPassword.backToSignIn')} />
      </Box>
    </form>
  );
}

export function AuthForm() {
  const t = useTranslations('AuthPage');
  const [tab, setTab] = useState<Tab>('sign-in');

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace('#', '');
      setTab(hash === 'sign-up' || hash === 'reset-password' ? (hash as Tab) : 'sign-in');
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  const switchTab = (newTab: Tab) => { window.location.hash = newTab; setTab(newTab); };

  const tabLabels: Record<Tab, string> = { 'sign-in': t('tabSignIn'), 'sign-up': t('tabSignUp'), 'reset-password': t('tabReset') };
  const tabHeadings: Record<Tab, { title: string; subtitle: string }> = {
    'sign-in': { title: t('signIn.title'), subtitle: t('signIn.subtitle') },
    'sign-up': { title: t('signUp.title'), subtitle: t('signUp.subtitle') },
    'reset-password': { title: t('resetPassword.title'), subtitle: t('resetPassword.subtitle') },
  };
  const { title, subtitle } = tabHeadings[tab];

  return (
    <Container display="flex" alignItems="center" styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'flex-start' }} paddingTop={16} paddingX={10}>
      <Box width="100%" maxWidth={420} marginBottom={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>{title}</Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">{subtitle}</Typography>
      </Box>
      <Box width="100%" maxWidth={420} padding={10} borderRadius={12} flexDirection="column" gap={20} elevation={5} backgroundColor="var(--surface-1)">
        <Box className="auth-form__tabs">
          {(['sign-in', 'sign-up', 'reset-password'] as Tab[]).map((id) => (
            <button key={id} onClick={() => switchTab(id)} data-active={String(tab === id)} className="auth-form__tab-btn">{tabLabels[id]}</button>
          ))}
        </Box>
        {tab === 'sign-in' && <SignInTab switchTab={switchTab} />}
        {tab === 'sign-up' && <SignUpTab switchTab={switchTab} />}
        {tab === 'reset-password' && <ResetPasswordTab switchTab={switchTab} />}
      </Box>
    </Container>
  );
}
TSEOF

  # verify-email/[token]/page.tsx
  mkdir -p "${base}/verify-email/[token]"
  cat > "${base}/verify-email/[token]/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { VerifyEmailClient } from './verify-email-client';

type Props = { params: Promise<{ locale: string; token: string }> };

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return <VerifyEmailClient token={token} />;
}
TSEOF

  # verify-email/[token]/verify-email-client.tsx
  cat > "${base}/verify-email/[token]/verify-email-client.tsx" << 'TSEOF'
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import { verifyEmail, ApiError } from '@/lib/auth';

type Status = 'loading' | 'success' | 'expired' | 'invalid';
const REDIRECT_SECONDS = 3;

export function VerifyEmailClient({ token }: { token: string }) {
  const t = useTranslations('VerifyEmailPage');
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        if (err instanceof ApiError) {
          const detail = String((err.data as Record<string, unknown>).detail ?? '');
          setStatus(detail.toLowerCase().includes('expired') ? 'expired' : 'invalid');
        } else { setStatus('invalid'); }
      });
  }, [token]);

  useEffect(() => {
    if (status !== 'success') return;
    if (countdown === 0) { router.push('/'); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, router]);

  return (
    <Container display="flex" alignItems="center" styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center' }} paddingX={10}>
      <Box width="100%" maxWidth={420} padding={10} borderRadius={12} flexDirection="column" gap={20} elevation={5} backgroundColor="var(--surface-1)">
        {status === 'loading' && <Box display="flex" flexDirection="column" gap={16}><ProgressBar label={t('loading')} /><Typography variant="body-sm" color="var(--muted-foreground, #6b7280)" textAlign="center">{t('loading')}</Typography></Box>}
        {status === 'success' && <Box display="flex" flexDirection="column" gap={12} alignItems="center" styles={{ textAlign: 'center' }}><Typography variant="h5">{t('successTitle')}</Typography><Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">{t('successDetail')}</Typography><Typography variant="caption" color="var(--muted-foreground, #6b7280)">{t('redirecting', { seconds: countdown })}</Typography><ProgressBar value={((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100} label={t('redirectProgress')} /></Box>}
        {status === 'expired' && <Box display="flex" flexDirection="column" gap={12} alignItems="center" styles={{ textAlign: 'center' }}><Typography variant="h5" role="alert" color="var(--error, #ef4444)">{t('expiredTitle')}</Typography><Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">{t('expiredDetail')}</Typography></Box>}
        {status === 'invalid' && <Box display="flex" flexDirection="column" gap={12} alignItems="center" styles={{ textAlign: 'center' }}><Typography variant="h5" role="alert" color="var(--error, #ef4444)">{t('invalidTitle')}</Typography><Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">{t('invalidDetail')}</Typography></Box>}
      </Box>
    </Container>
  );
}
TSEOF
}


gen_account_pages() {
  local base="$1"   # apps/<name>/app/[locale]/account

  mkdir -p "${base}"
  cat > "${base}/page.tsx" << 'TSEOF'
import { setRequestLocale } from 'next-intl/server';
import { AccountForm } from './account-form';

type Props = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AccountForm />;
}
TSEOF

  cat > "${base}/account-form.css" << 'CSSEOF'
.account__form { display: flex; flex-direction: column; gap: 16px; }
.account__section-title { margin-bottom: 4px; }
.account__picture-area { display: flex; align-items: center; gap: 16px; }
.account__avatar { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.account__avatar-initials { width: 72px; height: 72px; border-radius: 50%; background: var(--primary, #06b6d4); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 600; flex-shrink: 0; user-select: none; }
.account__passkey-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border, #e5e7eb); gap: 12px; }
.account__passkey-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.account__passkey-date { color: var(--muted-foreground, #6b7280); font-size: 12px; }
.account__success { color: var(--success, #22c55e); padding: 8px 12px; border-radius: 6px; background: var(--success-bg, rgba(34,197,94,0.08)); }
.account__error { color: var(--error, #ef4444); padding: 8px 12px; border-radius: 6px; background: var(--error-bg, rgba(239,68,68,0.08)); }
CSSEOF

  cat > "${base}/account-form.tsx" << 'TSEOF'
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { getProfile, updateProfile, uploadProfilePicture, changePassword, getPasskeyCredentials, deletePasskeyCredential, registerPasskey, ApiError, type UserProfile } from '@/lib/auth';
import './account-form.css';

function SuccessMessage({ message }: { message: string }) {
  return <Typography variant="caption" className="account__success">{message}</Typography>;
}
function ErrorMessage({ message }: { message: string }) {
  return <Typography variant="caption" role="alert" className="account__error">{message}</Typography>;
}

function ProfileSection({ profile }: { profile: UserProfile }) {
  const t = useTranslations('AccountPage');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [pendingPicture, setPendingPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingPicture(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSuccess(null); setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [updateProfile({ first_name: firstName, last_name: lastName })];
      if (pendingPicture) tasks.push(uploadProfilePicture(pendingPicture));
      await Promise.all(tasks);
      setPendingPicture(null);
      setSuccess(t('profileSaved'));
    } catch { setError(t('profileError')); }
    finally { setLoading(false); }
  }

  const initials = (profile.first_name[0] ?? profile.email[0] ?? '?').toUpperCase();

  return (
    <Box width="100%" maxWidth={520} padding={10} borderRadius={12} flexDirection="column" gap={20} elevation={5} backgroundColor="var(--surface-1)">
      <Typography as="h2" variant="h3" fontWeight={600} className="account__section-title">{t('profileSection')}</Typography>
      <form onSubmit={handleSubmit} className="account__form">
        <div className="account__picture-area">
          {pendingPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingPicture} alt="" className="account__avatar" />
          ) : profile.profile_picture ? (
            <Image src={profile.profile_picture} width={72} height={72} alt="" className="account__avatar" />
          ) : (
            <div className="account__avatar-initials" aria-hidden="true">{initials}</div>
          )}
          <input ref={fileInputRef} type="file" aria-hidden="true" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          <Button text={t('changePhoto')} type="button" size="sm" onClick={() => fileInputRef.current?.click()} />
        </div>
        <TextInput label={t('emailLabel')} type="email" value={profile.email} disabled />
        <Box display="flex" gap={12}>
          <TextInput label={t('firstNameLabel')} type="text" value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <TextInput label={t('lastNameLabel')} type="text" value={lastName} onChange={setLastName} autoComplete="family-name" />
        </Box>
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t('savingProfile')} />}
        <Button text={loading ? t('savingProfile') : t('saveProfile')} type="submit" size="md" width="100%" marginTop={4} kind="success" />
      </form>
    </Box>
  );
}

function ChangePasswordSection() {
  const t = useTranslations('AccountPage');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSuccess(null);
    if (newPassword !== confirmPassword) { setError(t('passwordMismatch')); return; }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(t('passwordSaved'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const data = err.data as Record<string, unknown>;
        setError(data.current_password ? t('passwordWrong') : t('passwordError'));
      } else { setError(t('passwordError')); }
    } finally { setLoading(false); }
  }

  return (
    <Box width="100%" maxWidth={520} padding={10} borderRadius={12} flexDirection="column" gap={20} elevation={5} backgroundColor="var(--surface-1)">
      <Typography as="h2" variant="h3" fontWeight={600} className="account__section-title">{t('securitySection')}</Typography>
      <form onSubmit={handleSubmit} className="account__form">
        <TextInput label={t('currentPasswordLabel')} type="password" value={currentPassword} onChange={setCurrentPassword} required autoComplete="current-password" />
        <TextInput label={t('newPasswordLabel')} type="password" value={newPassword} onChange={setNewPassword} required autoComplete="new-password" />
        <TextInput label={t('confirmPasswordLabel')} type="password" value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t('savingPassword')} />}
        <Button text={loading ? t('savingPassword') : t('savePassword')} type="submit" size="md" width="100%" marginTop={4} kind="success" />
      </form>
    </Box>
  );
}

function PasskeySection() {
  const t = useTranslations('AccountPage');
  const [credentials, setCredentials] = useState<{ id: number; name: string; created_at: string }[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    getPasskeyCredentials()
      .then(({ credentials: creds }) => setCredentials(creds))
      .catch(() => setCredentials([]))
      .finally(() => setLoadingCreds(false));
  }, []);

  async function handleDelete() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId; setConfirmDeleteId(null); setDeletingId(id);
    try { await deletePasskeyCredential(id); setCredentials((prev) => prev.filter((c) => c.id !== id)); setToast({ message: t('passkeyDeleted'), isError: false }); }
    catch { setToast({ message: t('passkeyDeleteError'), isError: true }); }
    finally { setDeletingId(null); }
  }

  async function handleAddPasskey() {
    setAddingPasskey(true); setToast(null);
    try { await registerPasskey(); const { credentials: creds } = await getPasskeyCredentials(); setCredentials(creds); setToast({ message: t('passkeyAdded'), isError: false }); }
    catch { setToast({ message: t('passkeyAddError'), isError: true }); }
    finally { setAddingPasskey(false); }
  }

  return (
    <>
      {confirmDeleteId !== null && <ConfirmationModal title={t('confirmDeletePasskeyTitle')} text={t('confirmDeletePasskeyText')} okCallback={handleDelete} cancelCallback={() => setConfirmDeleteId(null)} />}
      <Box width="100%" maxWidth={520} padding={10} borderRadius={12} flexDirection="column" gap={20} elevation={5} backgroundColor="var(--surface-1)">
        <Typography as="h2" variant="h3" fontWeight={600} className="account__section-title">{t('passkeySection')}</Typography>
        <Box display="flex" flexDirection="column" gap={8}>
          {loadingCreds && <ProgressBar />}
          {!loadingCreds && credentials.length === 0 && <Typography variant="caption" color="var(--muted-foreground, #6b7280)">{t('noPasskeys')}</Typography>}
          {credentials.map((cred) => (
            <Box key={cred.id} className="account__passkey-row">
              <Box display="flex" alignItems="center" gap={10}>
                <Image src="/icons/fingerprint.svg" width={24} height={24} alt="" />
                <Box className="account__passkey-meta">
                  <Typography variant="caption" fontWeight={600}>{cred.name}</Typography>
                  <span className="account__passkey-date">{new Date(cred.created_at).toLocaleDateString()}</span>
                </Box>
              </Box>
              <Button text={t('deletePasskey')} type="button" size="sm" kind="error" disabled={deletingId === cred.id} onClick={() => setConfirmDeleteId(cred.id)} />
            </Box>
          ))}
        </Box>
        {toast && (toast.isError ? <ErrorMessage message={toast.message} /> : <SuccessMessage message={toast.message} />)}
        {addingPasskey && <ProgressBar />}
        <Button text={t('addPasskey')} type="button" onClick={handleAddPasskey} disabled={addingPasskey} size="md" width="100%" marginTop={4} kind="success" />
      </Box>
    </>
  );
}

export function AccountForm() {
  const t = useTranslations('AccountPage');
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile().then(setProfile).catch(() => router.push('/auth')).finally(() => setLoading(false));
  }, [router]);

  if (loading || !profile) {
    return (
      <Container display="flex" alignItems="center" styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'center' }}>
        <ProgressBar label={t('loading')} />
      </Container>
    );
  }

  return (
    <Container display="flex" alignItems="center" styles={{ minHeight: '100vh', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 'var(--ui-navbar-height)' }} paddingX={10}>
      <Box width="100%" maxWidth={520} marginBottom={20} marginTop={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>{t('title')}</Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">{t('subtitle')}</Typography>
      </Box>
      <Box display="flex" flexDirection="column" gap={24} width="100%" maxWidth={520} marginBottom={40}>
        <ProfileSection profile={profile} />
        <ChangePasswordSection />
        <PasskeySection />
      </Box>
    </Container>
  );
}
TSEOF
}


gen_messages_json() {
  local out="$1" locale="${2:-en}"; mkdir -p "$(dirname "$out")"

  if [[ "${locale}" == "es" ]]; then
    local copyright_val="© {year} ${title}. Todos los derechos reservados."
    if [[ "${include_auth}" == "y" ]]; then
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
  }
}
EOF
    else
      cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" }
}
EOF
    fi

  elif [[ "${locale}" == "de" ]]; then
    local copyright_val="© {year} ${title}. Alle Rechte vorbehalten."
    if [[ "${include_auth}" == "y" ]]; then
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
  }
}
EOF
    else
      cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" }
}
EOF
    fi

  elif [[ "${locale}" == "fr" ]]; then
    local copyright_val="© {year} ${title}. Tous droits réservés."
    if [[ "${include_auth}" == "y" ]]; then
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
  }
}
EOF
    else
      cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" }
}
EOF
    fi

  elif [[ "${locale}" == "pt" ]]; then
    local copyright_val="© {year} ${title}. Todos os direitos reservados."
    if [[ "${include_auth}" == "y" ]]; then
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
  }
}
EOF
    else
      cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" }
}
EOF
    fi

  else
    # English (default)
    local copyright_val="© {year} ${title}. All rights reserved."
    if [[ "${include_auth}" == "y" ]]; then
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
  }
}
EOF
    else
      cat > "$out" << EOF
{
  "Metadata": { "title": "${title}", "description": "" },
  "HomePage": { "title": "${title}" }
}
EOF
    fi
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
  local secret_block=""
  if [[ "${include_auth}" == "y" ]]; then
    secret_block="envFromSecret:
  - name: API_URL
    secretName: ${name}-secrets
    secretKey: API_URL"
  else
    secret_block="# envFromSecret:
#   - name: SOME_SECRET
#     secretName: ${name}-secrets
#     secretKey: some-key"
  fi

  cat > "${base}/values.yaml" << EOF
revisionHistoryLimit: 2
replicaCount: 1

image:
  repository: ${registry_user}/${name}
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
  sed -i "s/APP_NAME/${name}/g" "${base}/templates/ingress.yaml"

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
  [[ "${raw_lang,,}" == es* ]] && lang="es"
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
  include_auth="n"; confirm_yn "${AUTH_PROMPT}" 'y' && include_auth="y"
  include_pwa="n";  confirm_yn "${PWA_PROMPT}" 'y'  && include_pwa="y"

  echo ""
  echo "  ┌─────────────────────────────────┐"
  printf "  │  %-31s│\n" "$(clr_bold "${name}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_PORT}: ${port}  ${LBL_PALETTE}: ${palette}")"
  printf "  │  %-31s│\n" "$(clr_dim "${LBL_AUTH}: ${include_auth}  ${LBL_PWA}: ${include_pwa}")"
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
  gen_next_config_js                 "${app_dir}/next.config.js"
  gen_tsconfig_json                  "${app_dir}/tsconfig.json"
  gen_eslint_config_js               "${app_dir}/eslint.config.js"
  gen_gitignore                      "${app_dir}/.gitignore"
  gen_dockerignore                   "${app_dir}/.dockerignore"
  gen_dockerfile                     "${app_dir}/Dockerfile"
  gen_css_dts                        "${app_dir}/css.d.ts"
  gen_global_dts                     "${app_dir}/global.d.ts"
  gen_env_example                    "${app_dir}/env.example"
  gen_proxy_ts                       "${app_dir}/proxy.ts"
  gen_globals_css                    "${app_dir}/app/globals.css"
  gen_i18n_request_ts                "${app_dir}/i18n/request.ts"
  gen_lib_logger_ts                  "${app_dir}/lib/logger.ts"
  gen_layout_tsx                     "${app_dir}/app/[locale]/layout.tsx"
  gen_page_tsx                       "${app_dir}/app/[locale]/page.tsx"

  # messages — translated per locale
  for locale in en es de fr pt; do
    gen_messages_json                "${app_dir}/messages/${locale}.json" "${locale}"
  done

  # PWA files
  if [[ "${include_pwa}" == "y" ]]; then
    gen_manifest_ts                  "${app_dir}/app/manifest.ts"
    gen_sw_ts                        "${app_dir}/app/sw.ts"
    gen_offline_page_tsx             "${app_dir}/app/[locale]/~offline/page.tsx"
  fi

  # Auth files
  if [[ "${include_auth}" == "y" ]]; then
    gen_navbar_wrapper_tsx           "${app_dir}/app/[locale]/navbar-wrapper.tsx"
    gen_footer_tsx                   "${app_dir}/app/[locale]/footer.tsx"
    gen_footer_css                   "${app_dir}/app/[locale]/footer.css"
    gen_lib_auth_ts                  "${app_dir}/lib/auth.ts"
    gen_lib_api_fetch_ts             "${app_dir}/lib/api-fetch.ts"
    gen_auth_pages                   "${app_dir}/app/[locale]/(auth)"
    gen_account_pages                "${app_dir}/app/[locale]/account"
    gen_api_auth_routes              "${app_dir}/app/api/auth"
  fi

  # Helm
  gen_helm_files                     "${app_dir}/helm"

  # Public placeholder dirs
  mkdir -p "${app_dir}/public/icons/splash"
  touch "${app_dir}/public/icons/.gitkeep"
  touch "${app_dir}/public/icons/splash/.gitkeep"

  # Copy env.example → .env.local
  printf "  %s\n" "$(clr_dim "${COPYING_ENV_MSG}")"
  cp "${app_dir}/env.example" "${app_dir}/.env.local"

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
  [[ "${include_auth}" == "y" ]] && \
  printf "  %s  %s\n" "$(clr_dim '1.')" "$(clr_cyan "${NEXT_STEP_AUTH_API}")"
  printf "  %s  %s\n" "$(clr_dim '2.')" "$(clr_cyan "pnpm dev --filter=${name}")"
  [[ "${include_pwa}" == "y" ]] && \
  printf "  %s  %s\n" "$(clr_dim '3.')" "$(clr_cyan "${NEXT_STEP_PWA_ICONS} apps/${name}/public/icons/")"
  echo ""
}

main "$@"
