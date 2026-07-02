#!/usr/bin/env bash
# setup-minecraft.sh
#
# Bootstraps the Minecraft modding toolchain for apps/mob-forge and installs the
# Blockbench authoring stack used by the AI asset pipeline (see
# apps/prds/minecraft.md). Idempotent — safe to re-run after bumping versions in
# apps/mob-forge/gradle.properties.
#
# Installs / bootstraps:
#   - Java 17 (Temurin/OpenJDK) — required by Minecraft 1.20.2
#   - Blockbench (3D authoring tool)
#   - Blockbench plugins: "GeckoLib Models & Animations" + the MCP plugin (guided)
#   - The pinned NeoForge 1.20.2 MDK into apps/mob-forge (Gradle scaffold only),
#     with GeckoLib injected — then verifies ./gradlew resolves
#
# Run: pnpm setup-minecraft   (or: bash cli/setup-minecraft/setup-minecraft.sh)
#
# NOTE: Cross-platform by policy — every tool must install on BOTH Linux
#       (apt / snap / flatpak) and macOS (Homebrew). Do not add Linux-only tools.

set -euo pipefail

# ── Repo layout ───────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${REPO_ROOT}/apps/mob-forge"
PROPS_FILE="${APP_DIR}/gradle.properties"

# ── Version / source pins (single source of truth is gradle.properties) ───────
# The MDK provides the Gradle scaffold; NeoForge for MC 1.20.2 ships on the
# 20.2.x line (NeoGradle userdev). 1.20.1 has no maintained NeoGradle MDK.
MDK_REPO="https://github.com/neoforged/MDK.git"
MDK_BRANCH="1.20.2"                       # NeoGradle MDK branch for MC 1.20.2
MDK_FALLBACK_URL="https://github.com/neoforgemdks"  # shown if the branch 404s

# GeckoLib maven (Cloudsmith) + artifact coordinates.
GECKOLIB_MAVEN="https://dl.cloudsmith.io/public/geckolib3/geckolib/maven/"

# Blockbench plugin references (installed via the Blockbench UI — guided step).
GECKOLIB_BB_PLUGIN="GeckoLib Models & Animations (Blockbench plugin store)"
MCP_BB_PLUGIN_URL="https://github.com/jasonjgardner/blockbench-mcp-plugin"

# ── ANSI colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; CYAN='\033[36m'

clr_green()       { printf "${GREEN}%s${RESET}" "$*"; }
clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_yellow()      { printf "${YELLOW}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }

step()  { printf "\n${BOLD}${CYAN}▸ %s${RESET}\n" "$*"; }
ok()    { printf "  ${GREEN}✓${RESET} %s\n" "$*"; }
warn()  { printf "  ${YELLOW}!${RESET} %s\n" "$*"; }
fail()  { printf "  ${RED}✗${RESET} %s\n" "$*"; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  if [[ "${1}" == "es" ]]; then
    WELCOME="Configuración del Entorno de Modding de Minecraft"
    SUBTITLE="Instala Java 17, Blockbench y el MDK de NeoForge 1.20.2 para apps/mob-forge."
    CONFIRM_PROMPT="¿Continuar? [s/n]"
    ABORTED="Instalación cancelada."
    S_JAVA="Comprobando Java 17..."
    S_JAVA_OK="Java 17 disponible"
    S_JAVA_INSTALL="Instalando Java 17 (requerido por Minecraft 1.20.2)..."
    S_BB="Comprobando Blockbench..."
    S_BB_OK="Blockbench instalado"
    S_BB_INSTALL="Instalando Blockbench..."
    S_PLUGINS="Plugins de Blockbench (paso guiado, requiere la app abierta)"
    S_MDK="Preparando el MDK de NeoForge 1.20.2 en apps/mob-forge..."
    S_MDK_OK="MDK preparado y GeckoLib inyectado"
    S_MDK_SKIP="El proyecto Gradle ya existe (gradlew presente) — omitiendo descarga del MDK."
    S_VERIFY="Verificando ./gradlew..."
    S_DONE="¡Listo! Ejecuta:  pnpm --filter=mob-forge build"
    YES_RE="^[sS]$"
  else
    WELCOME="Minecraft Modding Environment Setup"
    SUBTITLE="Installs Java 17, Blockbench, and the NeoForge 1.20.2 MDK for apps/mob-forge."
    CONFIRM_PROMPT="Continue? [y/n]"
    ABORTED="Setup aborted."
    S_JAVA="Checking for Java 17..."
    S_JAVA_OK="Java 17 available"
    S_JAVA_INSTALL="Installing Java 17 (required by Minecraft 1.20.2)..."
    S_BB="Checking for Blockbench..."
    S_BB_OK="Blockbench installed"
    S_BB_INSTALL="Installing Blockbench..."
    S_PLUGINS="Blockbench plugins (guided step — needs the app open)"
    S_MDK="Preparing the NeoForge 1.20.2 MDK in apps/mob-forge..."
    S_MDK_OK="MDK prepared and GeckoLib injected"
    S_MDK_SKIP="Gradle project already present (gradlew found) — skipping MDK download."
    S_VERIFY="Verifying ./gradlew..."
    S_DONE="Done! Run:  pnpm --filter=mob-forge build"
    YES_RE="^[yY]$"
  fi
}

# ── Platform helpers (mirrors cli/setup-dev-env) ──────────────────────────────

is_linux() { [[ "$(uname -s)" == "Linux" ]]; }
is_mac()   { [[ "$(uname -s)" == "Darwin" ]]; }
has_brew() { command -v brew &>/dev/null; }
has_apt()  { command -v apt-get &>/dev/null; }
has_snap() { command -v snap &>/dev/null; }
has_flatpak() { command -v flatpak &>/dev/null; }

ask() { local p="$1" a; read -r -p "$(printf "${BOLD}%s ${RESET}" "$p")" a; echo "$a"; }

require_brew_on_mac() {
  if is_mac && ! has_brew; then
    fail "Homebrew is required on macOS. Install from https://brew.sh and re-run."
    exit 1
  fi
}

# ── Java 17 ───────────────────────────────────────────────────────────────────

java17_present() {
  local jhome
  for jhome in "${JAVA_HOME:-}" "$(command -v java >/dev/null && dirname "$(dirname "$(readlink -f "$(command -v java)")")" 2>/dev/null)"; do
    [[ -n "$jhome" && -x "$jhome/bin/java" ]] || continue
    "$jhome/bin/java" -version 2>&1 | grep -qE 'version "17' && { JAVA17_HOME="$jhome"; return 0; }
  done
  # macOS: use java_home to find a 17 JDK regardless of the default.
  if is_mac && /usr/libexec/java_home -v 17 &>/dev/null; then
    JAVA17_HOME="$(/usr/libexec/java_home -v 17)"; return 0
  fi
  # Linux: probe common JDK install roots for a 17.
  local d
  for d in /usr/lib/jvm/*17* /usr/lib/jvm/temurin-17* /usr/lib/jvm/java-17*; do
    [[ -x "$d/bin/java" ]] && { JAVA17_HOME="$d"; return 0; }
  done
  return 1
}

install_java17() {
  if is_mac; then
    brew install --cask temurin@17 || brew install openjdk@17
    return $?
  fi
  if has_apt; then
    sudo apt-get update -qq
    sudo apt-get install -y temurin-17-jdk 2>/dev/null && return 0
    sudo apt-get install -y openjdk-17-jdk && return 0
  fi
  warn "No supported package manager found for Java 17."
  warn "Install a JDK 17 (https://adoptium.net/temurin/releases/?version=17) and re-run."
  return 1
}

# ── Blockbench ────────────────────────────────────────────────────────────────

blockbench_present() {
  command -v blockbench &>/dev/null && return 0
  is_mac && [[ -d "/Applications/Blockbench.app" ]] && return 0
  has_flatpak && flatpak info net.blockbench.Blockbench &>/dev/null && return 0
  has_snap && snap list 2>/dev/null | grep -qi blockbench && return 0
  return 1
}

install_blockbench() {
  if is_mac; then
    brew install --cask blockbench; return $?
  fi
  if has_flatpak; then
    flatpak install -y flathub net.blockbench.Blockbench && return 0
  fi
  if has_snap; then
    sudo snap install blockbench 2>/dev/null && return 0
  fi
  warn "Could not auto-install Blockbench on this Linux setup."
  warn "Install Flatpak (sudo apt-get install -y flatpak) or grab the AppImage:"
  warn "  https://www.blockbench.net/downloads"
  return 1
}

# ── Blockbench plugins (guided — Blockbench is a GUI/Electron app) ─────────────

guide_plugins() {
  cat <<EOF
  Blockbench plugins are installed from inside the app (attended mode, PRD §3):

    1) Open Blockbench.
    2) File → Plugins → search & install:  ${GECKOLIB_BB_PLUGIN}
    3) File → Plugins → "Load Plugin from URL" and point at the MCP plugin:
         ${MCP_BB_PLUGIN_URL}
       (follow its README to build/enable; it exposes the MCP server at
        http://localhost:3000/bb-mcp)
    4) Keep Blockbench open on your display before prompting Claude Code so you
       can watch the model get authored live.
EOF
}

# ── NeoForge 1.20.2 MDK bootstrap + GeckoLib injection ────────────────────────

bootstrap_mdk() {
  if [[ -x "${APP_DIR}/gradlew" ]]; then
    ok "${S_MDK_SKIP}"
  else
    local tmp; tmp="$(mktemp -d)"
    # Guard with ${tmp:-}: the RETURN trap also fires on later functions' returns,
    # where this local is out of scope (would trip `set -u` without the default).
    trap 'rm -rf "${tmp:-}"' RETURN

    if ! git clone --depth 1 --branch "${MDK_BRANCH}" "${MDK_REPO}" "${tmp}/mdk" 2>/dev/null; then
      fail "Could not fetch the NeoForge MDK branch '${MDK_BRANCH}'."
      warn "Pick the matching 1.20.2 MDK repo from ${MDK_FALLBACK_URL} and set"
      warn "MDK_REPO/MDK_BRANCH at the top of this script, then re-run."
      return 1
    fi

    # Copy ONLY the Gradle scaffold — never the MDK's example src or gradle.properties.
    # Our committed src/ and gradle.properties (the version lock) stay authoritative.
    local f
    for f in build.gradle settings.gradle gradlew gradlew.bat .gitattributes; do
      [[ -f "${tmp}/mdk/${f}" ]] && cp "${tmp}/mdk/${f}" "${APP_DIR}/${f}"
    done
    [[ -d "${tmp}/mdk/gradle" ]] && cp -R "${tmp}/mdk/gradle" "${APP_DIR}/gradle"
    chmod +x "${APP_DIR}/gradlew" 2>/dev/null || true

    inject_geckolib
    ok "${S_MDK_OK}"
  fi

  # Always run (fresh download OR already-bootstrapped skip): heal the two
  # expand gaps the stock MDK scaffold leaves behind. Both are idempotent.
  ensure_props
  ensure_expand_map
}

# The stock NeoForge MDK build.gradle references pack_format_number in its
# ProcessResources expand map, but we deliberately do NOT copy the MDK's
# gradle.properties (ours is the version lock). Guarantee the key exists so the
# map never resolves an unknown property. 1.20.2 → resource/data pack_format 18.
ensure_props() {
  [[ -f "${PROPS_FILE}" ]] || return 0
  if ! grep -q '^pack_format_number=' "${PROPS_FILE}"; then
    {
      echo ""
      echo "# Resource/data pack format for the pinned Minecraft version (1.20.2 -> 18)."
      echo "# Consumed by pack.mcmeta via the ProcessResources expand block in build.gradle."
      echo "pack_format_number=18"
    } >> "${PROPS_FILE}"
    ok "pack_format_number=18 added to gradle.properties"
  fi
}

# GeckoLib is injected into our committed mods.toml as \${geckolib_version_range},
# but the stock MDK expand map only lists the built-in mod_* keys. Splice our key
# in after pack_format_number so `expand` can resolve it. Idempotent + heals an
# already-bootstrapped build.gradle (runs outside inject_geckolib's marker guard).
ensure_expand_map() {
  local bg="${APP_DIR}/build.gradle"
  [[ -f "$bg" ]] || return 0
  grep -q 'geckolib_version_range: geckolib_version_range' "$bg" && return 0

  local tmpf; tmpf="$(mktemp)"
  # Portable (GNU + BSD awk): after the first line mentioning pack_format_number,
  # emit the geckolib entry at the same indentation.
  awk '
    { print }
    /pack_format_number/ && !done {
      print "            geckolib_version_range: geckolib_version_range,"
      done = 1
    }
  ' "$bg" > "$tmpf" && mv "$tmpf" "$bg"

  if grep -q 'geckolib_version_range: geckolib_version_range' "$bg"; then
    ok "geckolib_version_range added to ProcessResources replaceProperties map"
  else
    rm -f "$tmpf"
    warn "Could not locate pack_format_number in build.gradle — add geckolib_version_range to the expand map by hand."
  fi
}

inject_geckolib() {
  local bg="${APP_DIR}/build.gradle"
  [[ -f "$bg" ]] || { warn "build.gradle missing — skipping GeckoLib injection."; return 0; }

  # Idempotent: only inject if our marker is absent.
  if grep -q 'GeckoLib (mob-forge)' "$bg"; then
    return 0
  fi

  cat >> "$bg" <<EOF

// ── GeckoLib (mob-forge) — injected by cli/setup-minecraft ────────────────────
repositories {
    maven {
        name = 'GeckoLib'
        url = '${GECKOLIB_MAVEN}'
        content { includeGroup("software.bernie.geckolib") }
    }
}
dependencies {
    implementation "software.bernie.geckolib:geckolib-neoforge-\${minecraft_version}:\${geckolib_version}"
}
EOF
  ok "GeckoLib repo + dependency appended to build.gradle"
}

verify_gradle() {
  [[ -x "${APP_DIR}/gradlew" ]] || { warn "gradlew not present — MDK bootstrap incomplete."; return 1; }
  local JAVA_HOME_ARG=()
  if java17_present; then JAVA_HOME_ARG=(JAVA_HOME="${JAVA17_HOME}"); fi
  ( cd "${APP_DIR}" && env "${JAVA_HOME_ARG[@]}" ./gradlew --version >/dev/null 2>&1 ) \
    && ok "gradlew resolved (JAVA_HOME=${JAVA17_HOME:-default})" \
    || { warn "gradlew ran but returned non-zero — check Java 17 is the active JDK."; return 1; }
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local lang; lang="$(ask "Language / Idioma [en/es]:")"; lang="${lang:-en}"
  setup_strings "$lang"

  printf "\n${BOLD}${CYAN}%s${RESET}\n" "${WELCOME}"
  printf "${DIM}%s${RESET}\n" "${SUBTITLE}"

  require_brew_on_mac

  local ans; ans="$(ask "${CONFIRM_PROMPT}")"
  [[ "$ans" =~ ${YES_RE} ]] || { echo "${ABORTED}"; exit 0; }

  # 1) Java 17
  step "${S_JAVA}"
  if java17_present; then ok "${S_JAVA_OK} (${JAVA17_HOME})"
  else warn "${S_JAVA_INSTALL}"; install_java17 && java17_present && ok "${S_JAVA_OK}" || warn "Java 17 not confirmed."
  fi

  # 2) Blockbench
  step "${S_BB}"
  if blockbench_present; then ok "${S_BB_OK}"
  else warn "${S_BB_INSTALL}"; install_blockbench && ok "${S_BB_OK}" || true
  fi

  # 3) Plugins (guided)
  step "${S_PLUGINS}"
  guide_plugins

  # 4) MDK bootstrap + GeckoLib
  step "${S_MDK}"
  bootstrap_mdk || true

  # 5) Verify
  step "${S_VERIFY}"
  verify_gradle || true

  printf "\n${BOLD}${GREEN}%s${RESET}\n" "${S_DONE}"
}

main "$@"
