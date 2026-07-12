#!/usr/bin/env bash
# new-rn-app.sh - interactive React Native (Expo) app scaffold
# Generates an Expo SDK 56 (React Native 0.85, React 19.2, New Architecture) app
# under apps/<name>, wired to the @repo/ui-native component package and to the
# pnpm/Turborepo workspace (monorepo-aware Metro config + expo-router).
# Not a Next.js app: no standalone output, no Docker/Helm - RN builds native
# binaries (EAS) or an Expo Go dev bundle.
# Run: bash cli/new-rn-app/new-rn-app.sh   (append "es" for Spanish)

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

# Resolve repo root from this script's location (cli/new-rn-app/).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

# Pinned Expo release line. Bump these two together when moving to a new SDK.
EXPO_RANGE="~56.0.0"
RN_VERSION="0.85.0"
REACT_VERSION="19.2.7"

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Nuevo App React Native (Expo)"
    SUBTITLE="Genera el scaffold de una app Expo SDK 56 (RN 0.85 + @repo/ui-native)."
    APP_NAME_PROMPT="Nombre del app (ej. mobile-app)"
    APP_NAME_REQUIRED="El nombre es requerido."
    APP_NAME_INVALID="El nombre debe empezar con letra y contener solo minúsculas, números y guiones."
    PORT_PROMPT="Puerto de Metro"
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
    LBL_UINATIVE="Paquete ui-native"
    UINATIVE_EXISTS="ya existe (se reutiliza)"
    DONE_MSG="¡Listo!"
    NEXT_STEPS="Próximos pasos"
    INSTALLING_DEPS_MSG="Instalando dependencias (pnpm install)…"
    EXPO_INSTALL_MSG="Agregando paquetes Expo con las versiones del SDK (npx expo install)…"
    EXPO_INSTALL_SKIP="npx no disponible - omite; corre 'npx expo install' manualmente (ver README)."
    COPYING_ENV_MSG="Copiando .env.example → .env…"
  else
    WELCOME="New React Native (Expo) App"
    SUBTITLE="Scaffold an Expo SDK 56 app (RN 0.85 + @repo/ui-native)."
    APP_NAME_PROMPT="App name (e.g. mobile-app)"
    APP_NAME_REQUIRED="App name is required."
    APP_NAME_INVALID="Name must start with a letter and contain only lowercase letters, numbers, and hyphens."
    PORT_PROMPT="Metro port"
    API_PROMPT="API URL (Django)"
    PALETTE_LABEL="Accent palette:"
    PALETTE_ENTER_NUM="Enter number"
    STEP_CONFIG="[1/2] Configuration"
    STEP_FILES="[2/2] Generating files"
    GENERATE_PROMPT="Generate app?"
    ABORTED_MSG="Aborted."
    LBL_PORT="Port"
    LBL_PALETTE="Palette"
    LBL_API="API"
    LBL_UINATIVE="ui-native package"
    UINATIVE_EXISTS="already exists (reused)"
    DONE_MSG="Done!"
    NEXT_STEPS="Next steps"
    INSTALLING_DEPS_MSG="Installing dependencies (pnpm install)…"
    EXPO_INSTALL_MSG="Adding Expo packages at SDK-pinned versions (npx expo install)…"
    EXPO_INSTALL_SKIP="npx unavailable - skipped; run 'npx expo install' yourself (see README)."
    COPYING_ENV_MSG="Copying .env.example → .env…"
  fi
}

# ── UI helpers ──────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "${WELCOME}")"
  printf "  %s\n" "$(clr_dim "${SUBTITLE}")"
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

# Palette choices map 1:1 to @repo/ui-native palette names (see theme.ts).
select_palette() {
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${PALETTE_LABEL}")" >/dev/tty
  printf "   1) cyan     2) ocean    3) violet\n" >/dev/tty
  printf "   4) emerald  5) amber    6) rose\n" >/dev/tty
  printf "  %s (%s): " "$(clr_bold "${PALETTE_ENTER_NUM}")" "$(clr_dim '1')" >/dev/tty
  local n; IFS= read -r n </dev/tty || true; n="${n:-1}"
  case "$n" in
    1) echo "cyan"    ;; 2) echo "ocean"   ;; 3) echo "violet" ;;
    4) echo "emerald" ;; 5) echo "amber"   ;; 6) echo "rose"   ;;
    *) echo "cyan"    ;;
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
# Globals used by generators: name title port palette api_url slug scheme app_dir

subst() { # subst <file>  - replace placeholders with the config globals
  sed -i.bak \
    -e "s|__NAME__|${name}|g" \
    -e "s|__TITLE__|${title}|g" \
    -e "s|__SLUG__|${slug}|g" \
    -e "s|__SCHEME__|${scheme}|g" \
    -e "s|__PALETTE__|${palette}|g" \
    -e "s|__PORT__|${port}|g" \
    -e "s|__API_URL__|${api_url}|g" \
    -e "s|__EXPO_RANGE__|${EXPO_RANGE}|g" \
    -e "s|__RN_VERSION__|${RN_VERSION}|g" \
    -e "s|__REACT_VERSION__|${REACT_VERSION}|g" \
    "$1"
  rm -f "$1.bak"
}

gen_package_json() {
  local out="${app_dir}/package.json"
  cat > "$out" <<'RN_EOF'
{
  "name": "__NAME__",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start --port __PORT__",
    "start": "expo start --port __PORT__",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/ui-native": "workspace:*",
    "expo": "__EXPO_RANGE__",
    "react": "__REACT_VERSION__",
    "react-native": "__RN_VERSION__"
  },
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/react": "19.2.17",
    "eslint": "^9.39.4",
    "typescript": "6.0.3"
  }
}
RN_EOF
  subst "$out"
}

gen_app_json() {
  local out="${app_dir}/app.json"
  cat > "$out" <<'RN_EOF'
{
  "expo": {
    "name": "__TITLE__",
    "slug": "__SLUG__",
    "version": "0.1.0",
    "scheme": "__SCHEME__",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.iguzman.__SCHEME__"
    },
    "android": {
      "package": "com.iguzman.__SCHEME__",
      "edgeToEdgeEnabled": true
    },
    "web": {
      "bundler": "metro",
      "output": "single"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
RN_EOF
  subst "$out"
}

# Monorepo-aware Metro config. Expo SDK 56+ auto-configures pnpm monorepo
# resolution inside getDefaultConfig, so we deliberately do NOT hand-set
# watchFolders / nodeModulesPaths / disableHierarchicalLookup - overriding them
# re-breaks resolution of nested pnpm transitive deps. We only add the
# repo-specific blockList (Django venv exclusion) on top of Expo's defaults.
gen_metro_config() {
  local out="${app_dir}/metro.config.js"
  cat > "$out" <<'RN_EOF'
// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo SDK 56+ auto-configures monorepo resolution inside getDefaultConfig:
// watchFolders, resolver.nodeModulesPaths, and hierarchical lookup across
// pnpm's isolated (symlinked) node_modules. Per Expo's monorepo guide we must
// NOT hand-set watchFolders / nodeModulesPaths / disableHierarchicalLookup -
// overriding them re-breaks resolution of nested pnpm transitive deps (e.g.
// @expo/metro-runtime -> @expo/log-box). https://docs.expo.dev/guides/monorepos/

// Honor the "exports" field so @repo/ui-native/* resolves straight from src.
config.resolver.unstable_enablePackageExports = true;

// Expo's auto watchFolders include every workspace package dir. The Django API
// apps (website-api, edge-folio-api) keep Python virtualenvs there with tens of
// thousands of files; on Linux each watched dir consumes an inotify watch and
// blows past the per-user limit, throwing ENOSPC ("System limit for number of
// file watchers reached"). None of these hold anything Metro needs to bundle,
// so exclude them. blockList feeds Metro's file-map ignorePattern, skipping
// them at both crawl and watch time. Keep every entry flagless so Metro can
// combine the array into one RegExp (mismatched flags throw at startup).
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|\/)(venv|\.venv|__pycache__|\.mypy_cache|\.pytest_cache|\.ruff_cache|site-packages)(\/|$)/,
  /(^|\/)\.git(\/|$)/,
];

module.exports = config;
RN_EOF
}

gen_babel_config() {
  local out="${app_dir}/babel.config.js"
  cat > "$out" <<'RN_EOF'
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
RN_EOF
}

gen_tsconfig() {
  local out="${app_dir}/tsconfig.json"
  cat > "$out" <<'RN_EOF'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
RN_EOF
}

gen_eslint_config() {
  local out="${app_dir}/eslint.config.mjs"
  cat > "$out" <<'RN_EOF'
import { config } from '@repo/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  { ignores: ['dist', '.expo', 'expo-env.d.ts'] },
];
RN_EOF
}

gen_gitignore() {
  local out="${app_dir}/.gitignore"
  cat > "$out" <<'RN_EOF'
# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# Env
.env
.env*.local

# macOS
.DS_Store
RN_EOF
}

gen_env_example() {
  local out="${app_dir}/.env.example"
  cat > "$out" <<'RN_EOF'
# Public runtime env for Expo. Only EXPO_PUBLIC_* vars are exposed to the client.
EXPO_PUBLIC_API_URL=__API_URL__
RN_EOF
  subst "$out"
}

gen_root_layout() {
  local out="${app_dir}/app/_layout.tsx"
  mkdir -p "${app_dir}/app"
  cat > "$out" <<'RN_EOF'
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@repo/ui-native/theme-provider';

/**
 * Root layout. Wraps every route in the safe-area + theme providers. The
 * palette was chosen at scaffold time; swap it for any @repo/ui-native palette
 * (cyan/ocean/violet/emerald/amber/rose) or pass `scheme` to force light/dark.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider palette="__PALETTE__">
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
RN_EOF
  subst "$out"
}

gen_index_screen() {
  local out="${app_dir}/app/index.tsx"
  cat > "$out" <<'RN_EOF'
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@repo/ui-native/box';
import { Button } from '@repo/ui-native/button';
import { Screen } from '@repo/ui-native/screen';
import { Typography } from '@repo/ui-native/typography';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'not set';

/** Home route - a props-first showcase of @repo/ui-native. */
export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <Screen scroll>
      <Box paddingTop={insets.top} gap={24}>
        <Box gap={8}>
          <Typography variant="hero">__TITLE__</Typography>
          <Typography variant="body" color="muted">
            Expo SDK 56 · React Native · @repo/ui-native
          </Typography>
        </Box>

        <Box
          gap={12}
          padding={16}
          borderRadius={16}
          backgroundColor="#00000010"
        >
          <Typography variant="label" color="accent">
            API
          </Typography>
          <Typography variant="caption" color="muted">
            {API_URL}
          </Typography>
        </Box>

        <Box gap={12}>
          <Link href="/details" asChild>
            <Button kind="primary">Go to details</Button>
          </Link>
          <Button kind="success" variant="outline">
            Outline action
          </Button>
        </Box>
      </Box>
    </Screen>
  );
}
RN_EOF
  subst "$out"
}

gen_details_screen() {
  local out="${app_dir}/app/details.tsx"
  cat > "$out" <<'RN_EOF'
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@repo/ui-native/box';
import { Button } from '@repo/ui-native/button';
import { Screen } from '@repo/ui-native/screen';
import { Typography } from '@repo/ui-native/typography';

/** A second route to demonstrate expo-router navigation. */
export default function Details() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <Box paddingTop={insets.top} gap={20} flex={1}>
        <Typography variant="title">Details</Typography>
        <Typography variant="body" color="muted">
          This screen is rendered by app/details.tsx. Edit it and it hot-reloads.
        </Typography>
        <Box flexGrow={1} />
        <Button kind="primary" fullWidth onPress={() => router.back()}>
          Back
        </Button>
      </Box>
    </Screen>
  );
}
RN_EOF
}

gen_readme() {
  local out="${app_dir}/README.md"
  cat > "$out" <<'RN_EOF'
# __TITLE__

React Native app (Expo SDK 56 · RN 0.85 · React 19.2, New Architecture) in the
iguzman monorepo. Built with [expo-router](https://docs.expo.dev/router/introduction/)
and the shared [`@repo/ui-native`](../../packages/ui-native/CLAUDE.md) component
package.

## Develop

```bash
# From the repo root:
pnpm dev --filter=__NAME__          # start Metro on port __PORT__
# then press: i (iOS sim) · a (Android) · w (web) · or scan the QR in Expo Go
```

Type-check and lint like every other workspace member:

```bash
pnpm check-types --filter=__NAME__
pnpm lint --filter=__NAME__
```

## Environment

Client env comes from `.env` (copied from `.env.example`). Only `EXPO_PUBLIC_*`
variables are exposed to the app bundle.

- `EXPO_PUBLIC_API_URL` — Django API base URL.

## Native builds (EAS)

This app is **not** Docker/Helm-deployed. Ship it with EAS:

```bash
npx eas build --profile preview --platform ios
npx eas build --profile production --platform android
```

## Notes

- Monorepo Metro config lives in `metro.config.js`. Expo SDK 56+ auto-configures
  pnpm monorepo resolution in `getDefaultConfig`, so the file only honors package
  `exports` and blockLists Python venvs / `.git` so Metro's file watcher doesn't
  hit the inotify ENOSPC limit. Don't re-add `watchFolders` / `nodeModulesPaths` /
  `disableHierarchicalLookup` - they break nested pnpm transitive resolution.
- If Expo package versions drift from the SDK, run `npx expo install --fix`.
RN_EOF
  subst "$out"
}

gen_eas_json() {
  local out="${app_dir}/eas.json"
  cat > "$out" <<'RN_EOF'
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
RN_EOF
}

create_app() {
  app_dir="${repo_root}/apps/${name}"
  mkdir -p "${app_dir}/app"
  gen_package_json
  gen_app_json
  gen_metro_config
  gen_babel_config
  gen_tsconfig
  gen_eslint_config
  gen_gitignore
  gen_env_example
  gen_eas_json
  gen_readme
  gen_root_layout
  gen_index_screen
  gen_details_screen
}

# ── main ────────────────────────────────────────────────────────────────────────

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

  port="$(prompt_visible "${PORT_PROMPT}" "8081")"
  api_url="$(prompt_visible "${API_PROMPT}" "http://localhost:8000")"
  palette="$(select_palette)"

  title="$(to_title_case "${name}")"
  # Expo slug/scheme: lowercase, no hyphens for the URL scheme.
  slug="${name}"
  scheme="$(printf '%s' "${name}" | tr -d '-')"

  # Summary.
  echo "" >/dev/tty
  printf "  %-16s %s\n" "App:"               "$(clr_bold_cyan "${name}")" >/dev/tty
  printf "  %-16s %s\n" "${LBL_PORT}:"       "${port}" >/dev/tty
  printf "  %-16s %s\n" "${LBL_API}:"        "${api_url}" >/dev/tty
  printf "  %-16s %s\n" "${LBL_PALETTE}:"    "${palette}" >/dev/tty
  printf "  %-16s %s\n" "Expo:"              "$(clr_dim "SDK 56 · RN ${RN_VERSION} · React ${REACT_VERSION}")" >/dev/tty
  printf "  %-16s %s\n" "${LBL_UINATIVE}:"   "$(clr_dim "${UINATIVE_EXISTS}")" >/dev/tty
  echo "" >/dev/tty

  if ! confirm_yn "${GENERATE_PROMPT}" "y"; then
    printf "  %s\n" "$(clr_bold_red "${ABORTED_MSG}")" >/dev/tty
    exit 1
  fi

  echo "" >/dev/tty
  echo "  $(clr_bold "${STEP_FILES}")" >/dev/tty

  create_app
  printf "  %s apps/%s\n" "$(clr_bold_green '✓')" "${name}" >/dev/tty

  # .env from example.
  printf "  %s\n" "$(clr_dim "${COPYING_ENV_MSG}")" >/dev/tty
  cp "${app_dir}/.env.example" "${app_dir}/.env"

  # Install workspace deps (expo core, react, react-native, @repo/*).
  printf "  %s\n" "$(clr_dim "${INSTALLING_DEPS_MSG}")" >/dev/tty
  ( cd "${repo_root}" && pnpm install )

  # Add the Expo ecosystem packages at the exact versions this SDK expects.
  # `expo install` reconciles versions so we never hardcode a wrong pin.
  if command -v npx >/dev/null 2>&1; then
    printf "  %s\n" "$(clr_dim "${EXPO_INSTALL_MSG}")" >/dev/tty
    ( cd "${app_dir}" && npx --yes expo install \
        expo-router expo-status-bar expo-constants expo-linking \
        expo-splash-screen react-native-safe-area-context react-native-screens \
      ) || printf "  %s\n" "$(clr_bold_yellow "${EXPO_INSTALL_SKIP}")" >/dev/tty
    ( cd "${repo_root}" && pnpm install )
  else
    printf "  %s\n" "$(clr_bold_yellow "${EXPO_INSTALL_SKIP}")" >/dev/tty
  fi

  echo "" >/dev/tty
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_MSG}")" >/dev/tty
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${NEXT_STEPS}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "pnpm dev --filter=${name}   # start Metro on port ${port}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "# press i / a / w, or scan the QR code in Expo Go")" >/dev/tty
  printf "    %s\n" "$(clr_dim "# EAS builds & more: apps/${name}/README.md")" >/dev/tty
  echo "" >/dev/tty
}

# Only run main when executed directly (allows sourcing for tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
