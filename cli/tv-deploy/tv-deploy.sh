#!/usr/bin/env bash
# tv-deploy.sh - build, sign, install + run a Samsung Tizen (Smart TV) app.
#
# Discovers Tizen apps under apps/ (config.xml + .tproject), picks a connected
# target from `sdb devices` (or connects to a TV by IP), then builds the web
# bundle with pnpm, copies the Tizen manifest/metadata into dist/, signs and
# packages it into a .wgt, and installs + runs it on the target. Signing uses a
# security profile created by cli/tv-cert (run `pnpm tv-cert` first if you have
# none).
#
# Requires Tizen Studio (`tizen` + `sdb` CLIs) and pnpm.
# Run: bash cli/tv-deploy/tv-deploy.sh [app-name]  (append "es" for Spanish).

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

lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Desplegar App Samsung Smart TV"
    SUBTITLE="Construye, firma e instala una app Tizen en un emulador o TV."
    TIZEN_MISSING="No se encontró la herramienta 'tizen' de Tizen Studio."
    SDB_MISSING="No se encontró la herramienta 'sdb' de Tizen Studio."
    PNPM_MISSING="pnpm no está instalado o no está en PATH."
    TIZEN_HINT="Instala Tizen Studio o exporta TIZEN_HOME apuntando a su carpeta."
    APP_PROMPT="Selecciona la app de TV"
    APP_NOT_FOUND="No se encontraron apps de Tizen (config.xml + .tproject) en apps/."
    APP_INVALID="App no encontrada"
    TARGET_PROMPT="Selecciona el destino"
    NO_TARGETS="No hay emuladores ni TVs conectados."
    CONNECT_PROMPT="IP de la TV para conectar (vacío para omitir)"
    CONNECTING="Conectando a"
    CONNECT_FAILED="No se pudo conectar a la TV. Verifica el Modo Desarrollador y la IP."
    STILL_NO_TARGETS="Sigue sin haber destinos disponibles."
    PROFILE_PROMPT="Selecciona el perfil de firma"
    PROFILE_NONE="No hay perfiles de seguridad. Ejecuta 'pnpm tv-cert' primero."
    STEP_BUILD="Construyendo el bundle web"
    STEP_COPY="Copiando metadatos de Tizen a dist/"
    STEP_PACKAGE="Firmando y empaquetando (.wgt)"
    WEB_BUILD_FAILED="El build falló."
    BUILD_OK="Build completado."
    NO_DIST="No se generó la carpeta dist/."
    NO_CONFIG="Falta config.xml en la raíz de la app."
    NO_ICON="Falta icon.png en la raíz de la app."
    PACKAGE_FAILED="El empaquetado falló."
    NO_WGT="No se encontró el .wgt generado en dist/."
    STEP_INSTALL="Instalando el paquete"
    STEP_RUN="Ejecutando la app"
    INSTALL_FAILED="La instalación falló."
    RUN_FAILED="No se pudo ejecutar la app."
    NO_APP_ID="No se pudo leer el id de la aplicación desde config.xml."
    DONE_MSG="¡Listo! App lanzada en"
  else
    WELCOME="Deploy Samsung Smart TV App"
    SUBTITLE="Build, sign and install a Tizen app on an emulator or TV."
    TIZEN_MISSING="Tizen Studio's 'tizen' CLI was not found."
    SDB_MISSING="Tizen Studio's 'sdb' CLI was not found."
    PNPM_MISSING="pnpm is not installed or not in PATH."
    TIZEN_HINT="Install Tizen Studio or export TIZEN_HOME pointing at its folder."
    APP_PROMPT="Select TV app"
    APP_NOT_FOUND="No Tizen apps (config.xml + .tproject) found in apps/."
    APP_INVALID="App not found"
    TARGET_PROMPT="Select target"
    NO_TARGETS="No emulators or TVs are connected."
    CONNECT_PROMPT="TV IP to connect (blank to skip)"
    CONNECTING="Connecting to"
    CONNECT_FAILED="Could not connect to the TV. Check Developer Mode and the IP."
    STILL_NO_TARGETS="Still no targets available."
    PROFILE_PROMPT="Select signing profile"
    PROFILE_NONE="No security profiles found. Run 'pnpm tv-cert' first."
    STEP_BUILD="Building the web bundle"
    STEP_COPY="Copying Tizen metadata into dist/"
    STEP_PACKAGE="Signing and packaging (.wgt)"
    WEB_BUILD_FAILED="Build failed."
    BUILD_OK="Build completed."
    NO_DIST="No dist/ folder was produced."
    NO_CONFIG="config.xml is missing at the app root."
    NO_ICON="icon.png is missing at the app root."
    PACKAGE_FAILED="Packaging failed."
    NO_WGT="Could not find the generated .wgt in dist/."
    STEP_INSTALL="Installing the package"
    STEP_RUN="Running the app"
    INSTALL_FAILED="Install failed."
    RUN_FAILED="Could not run the app."
    NO_APP_ID="Could not read the application id from config.xml."
    DONE_MSG="Done! App launched on"
  fi
}

# ── UI helpers ────────────────────────────────────────────────────────────────

print_header() {
  local line; line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }

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

# Single-select arrow-key list. Input: MENU_ITEMS[]  Output: MENU_SELECTED.
interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 46)"
      local ptr label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "; label_str="${lbl}"
      fi
      printf "  %s  %s\n" "${ptr}" "${label_str}"
    done
  }

  render_select
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""
    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num )); printf "\033[%dA" "${num}"; render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num )); printf "\033[%dA" "${num}"; render_select
      fi
      continue
    fi
    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi
  done

  printf '\033[?25h'; echo ""
  MENU_SELECTED="${cursor}"
}

# ── Tizen toolchain ───────────────────────────────────────────────────────────

TIZEN_BIN=""; SDB_BIN=""; TIZEN_DATA=""
resolve_tizen() {
  local base
  for base in "${TIZEN_HOME:-}" "$HOME/tizen-studio" "$HOME/TizenStudio" "/opt/tizen-studio"; do
    [[ -z "${base}" ]] && continue
    [[ -x "${base}/tools/ide/bin/tizen" ]] && { TIZEN_HOME="${base}"; TIZEN_BIN="${base}/tools/ide/bin/tizen"; }
    [[ -x "${base}/tools/sdb" ]] && SDB_BIN="${base}/tools/sdb"
  done
  [[ -z "${TIZEN_BIN}" ]] && command -v tizen &>/dev/null && TIZEN_BIN="$(command -v tizen)"
  [[ -z "${SDB_BIN}" ]] && command -v sdb &>/dev/null && SDB_BIN="$(command -v sdb)"
  TIZEN_DATA="${TIZEN_DATA_DIR:-$HOME/tizen-studio-data}"
  [[ -n "${TIZEN_BIN}" ]]
}

# Serials of connected targets, one per line (skips the header + offline rows).
list_targets() {
  "${SDB_BIN}" devices 2>/dev/null | sed '1d' | awk 'NF >= 2 && $2 != "offline" {print $1}'
}

# All signing profile names from profiles.xml, one per line.
list_profiles() {
  local xml="${TIZEN_DATA}/profile/profiles.xml"
  [[ -f "${xml}" ]] || return 0
  sed -n 's/.*<profile name="\([^"]*\)".*/\1/p' "${xml}"
}

# Name of the active signing profile from profiles.xml (or empty).
active_profile() {
  local xml="${TIZEN_DATA}/profile/profiles.xml"
  [[ -f "${xml}" ]] || return 0
  sed -n 's/.*<profiles[^>]*active="\([^"]*\)".*/\1/p' "${xml}" | head -n1
}

# App id (e.g. CinelogTv0.CinelogTv) from <tizen:application id="...">.
read_app_id() {
  sed -n 's/.*<tizen:application[^>]*id="\([^"]*\)".*/\1/p' "$1" | head -n1
}

# Rename a packaged .wgt so its filename has no spaces. `tizen package` names the
# package after the widget <name>, but the on-device installer splits a path that
# contains a space into separate args and fails instantly with a blank log — so a
# name like "Cinelog Tv.wgt" never installs. Echoes the (possibly new) path.
sanitize_wgt() {
  local wgt="$1" dir base safe
  dir="$(dirname "${wgt}")"; base="$(basename "${wgt}")"
  safe="${base// /_}"
  if [[ "${safe}" != "${base}" ]]; then
    mv -f "${wgt}" "${dir}/${safe}"; printf '%s' "${dir}/${safe}"
  else
    printf '%s' "${wgt}"
  fi
}

# Build the web bundle, copy the Tizen manifest/metadata into dist/, then sign +
# package it with ${profile}. Signing here (rather than reusing a stale .wgt)
# ensures the package's distributor DUID matches this TV's certificate — a stale
# signature is the usual cause of a blank-log install failure. Caller sets:
# app_name app_dir profile repo_root TIZEN_BIN. Sets BUILT_WGT on success.
# (Build/package output must stream straight to the terminal, so this writes to a
# global rather than echoing.)
BUILT_WGT=""
build_and_package() {
  local app_name="$1" app_dir="$2" profile="$3" repo_root="$4"
  local dist="${app_dir}/dist"

  # [1/3] pnpm build.
  echo "" >/dev/tty
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_BUILD} ──")" >/dev/tty
  if ! ( cd "${repo_root}" && pnpm build --filter="${app_name}" ); then
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${WEB_BUILD_FAILED}" >/dev/tty; return 1
  fi
  printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${BUILD_OK}" >/dev/tty

  [[ -d "${dist}" ]]               || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_DIST}"   >/dev/tty; return 1; }
  [[ -f "${app_dir}/config.xml" ]] || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_CONFIG}" >/dev/tty; return 1; }
  [[ -f "${app_dir}/icon.png" ]]   || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_ICON}"   >/dev/tty; return 1; }

  # [2/3] Copy the Tizen manifest, icon and (optional) project metadata in.
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold_cyan "── ${STEP_COPY} ──")" >/dev/tty
  cp "${app_dir}/config.xml" "${app_dir}/icon.png" "${dist}/"
  [[ -f "${app_dir}/.project" ]]  && cp "${app_dir}/.project"  "${dist}/"
  [[ -f "${app_dir}/.tproject" ]] && cp "${app_dir}/.tproject" "${dist}/"

  # [3/3] Sign + package. Remove a stale .wgt so the glob below is unambiguous.
  echo "" >/dev/tty
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_PACKAGE} ──")" >/dev/tty
  printf "  %s %s package -t wgt -s %s -- dist\n\n" "$(clr_dim '$')" "$(clr_dim "$(basename "${TIZEN_BIN}")")" "$(clr_dim "${profile}")" >/dev/tty
  rm -f "${dist}"/*.wgt
  if ! "${TIZEN_BIN}" package -t wgt -s "${profile}" -- "${dist}"; then
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${PACKAGE_FAILED}" >/dev/tty; return 1
  fi

  local wgt; wgt="$(find "${dist}" -maxdepth 1 -name '*.wgt' -type f 2>/dev/null | head -n1)"
  [[ -n "${wgt}" ]] || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_WGT}" >/dev/tty; return 1; }
  BUILT_WGT="$(sanitize_wgt "${wgt}")"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local lang="en" app_arg=""
  for arg in "$@"; do
    case "${arg}" in
      es) lang="es" ;;
      *)  [[ -z "${app_arg}" ]] && app_arg="${arg}" ;;
    esac
  done
  setup_strings "${lang}"
  print_header

  if ! resolve_tizen; then
    printf "  %s %s\n  %s\n\n" "$(clr_bold_red '✗')" "${TIZEN_MISSING}" "$(clr_dim "${TIZEN_HINT}")" >/dev/tty; exit 1
  fi
  if [[ -z "${SDB_BIN}" ]]; then
    printf "  %s %s\n  %s\n\n" "$(clr_bold_red '✗')" "${SDB_MISSING}" "$(clr_dim "${TIZEN_HINT}")" >/dev/tty; exit 1
  fi
  if ! command -v pnpm &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${PNPM_MISSING}" >/dev/tty; exit 1
  fi

  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/../.." && pwd)"

  # Discover Tizen apps.
  local -a APP_NAMES=() APP_DIRS=()
  local d
  for d in "${repo_root}/apps"/*/; do
    if [[ -f "${d}config.xml" && -f "${d}.tproject" ]]; then
      APP_NAMES+=("$(basename "${d}")"); APP_DIRS+=("${d%/}")
    fi
  done
  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")" >/dev/tty; exit 1
  fi

  # Select app.
  local app_name="" app_dir=""
  if [[ -n "${app_arg}" ]]; then
    local i
    for i in "${!APP_NAMES[@]}"; do
      [[ "${APP_NAMES[$i]}" == "${app_arg}" ]] && { app_name="${APP_NAMES[$i]}"; app_dir="${APP_DIRS[$i]}"; break; }
    done
    [[ -z "${app_name}" ]] && { printf "  %s: \"%s\"\n\n" "$(clr_bold_red "✗ ${APP_INVALID}")" "${app_arg}" >/dev/tty; exit 1; }
  else
    printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
    MENU_ITEMS=("${APP_NAMES[@]}"); MENU_SELECTED=0
    interactive_select
    app_name="${APP_NAMES[${MENU_SELECTED}]}"; app_dir="${APP_DIRS[${MENU_SELECTED}]}"
  fi

  # Select target (connect by IP if nothing is listed).
  local -a TARGETS=()
  local t
  while IFS= read -r t; do [[ -n "${t}" ]] && TARGETS+=("${t}"); done < <(list_targets)

  if [[ ${#TARGETS[@]} -eq 0 ]]; then
    printf "  %s\n" "$(clr_bold_yellow "${NO_TARGETS}")" >/dev/tty
    local ip; ip="$(prompt_visible "${CONNECT_PROMPT}" "")"
    if [[ -n "${ip}" ]]; then
      printf "  %s %s %s…\n" "$(clr_bold_yellow '→')" "${CONNECTING}" "${ip}" >/dev/tty
      "${SDB_BIN}" connect "${ip}" >/dev/tty 2>&1 || true
      TARGETS=()
      while IFS= read -r t; do [[ -n "${t}" ]] && TARGETS+=("${t}"); done < <(list_targets)
    fi
    if [[ ${#TARGETS[@]} -eq 0 ]]; then
      printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${STILL_NO_TARGETS}" >/dev/tty; exit 1
    fi
  fi

  local target=""
  if [[ ${#TARGETS[@]} -eq 1 ]]; then
    target="${TARGETS[0]}"
    printf "  %s %s\n" "$(clr_dim "${TARGET_PROMPT}:")" "$(clr_bold_cyan "${target}")"
  else
    echo ""
    printf "  %s:\n\n" "$(clr_bold "${TARGET_PROMPT}")"
    MENU_ITEMS=("${TARGETS[@]}"); MENU_SELECTED=0
    interactive_select
    target="${TARGETS[${MENU_SELECTED}]}"
  fi

  # Pick a signing profile: the one active in profiles.xml, or prompt if the
  # active flag is missing and more than one exists.
  local -a PROFILES=()
  local p
  while IFS= read -r p; do [[ -n "${p}" ]] && PROFILES+=("${p}"); done < <(list_profiles)
  if [[ ${#PROFILES[@]} -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${PROFILE_NONE}" >/dev/tty; exit 1
  fi

  local profile="" active; active="$(active_profile)"
  if [[ ${#PROFILES[@]} -eq 1 ]]; then
    profile="${PROFILES[0]}"
  elif [[ -n "${active}" ]]; then
    profile="${active}"
  else
    echo "" >/dev/tty
    printf "  %s:\n\n" "$(clr_bold "${PROFILE_PROMPT}")"
    MENU_ITEMS=("${PROFILES[@]}"); MENU_SELECTED=0
    interactive_select
    profile="${PROFILES[${MENU_SELECTED}]}"
  fi

  # Build + sign + package.
  if ! build_and_package "${app_name}" "${app_dir}" "${profile}" "${repo_root}"; then
    echo "" >/dev/tty; exit 1
  fi
  local wgt="${BUILT_WGT}"

  # Install. `${target}` is an sdb serial (column 1 of `sdb devices`), so it must
  # be passed with -s/--serial; -t/--target expects the device *name* instead.
  echo "" >/dev/tty
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_INSTALL} ──")" >/dev/tty
  printf "  %s %s install -n %s -s %s\n\n" "$(clr_dim '$')" "$(clr_dim "$(basename "${TIZEN_BIN}")")" "$(clr_dim "$(basename "${wgt}")")" "$(clr_dim "${target}")" >/dev/tty
  if ! "${TIZEN_BIN}" install -n "${wgt}" -s "${target}"; then
    printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${INSTALL_FAILED}" >/dev/tty; exit 1
  fi

  # Run (the app id is the package launch id from config.xml).
  local app_id; app_id="$(read_app_id "${app_dir}/config.xml")"
  [[ -n "${app_id}" ]] || { printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${NO_APP_ID}" >/dev/tty; exit 1; }

  echo "" >/dev/tty
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_RUN} ──")" >/dev/tty
  printf "  %s %s run -p %s -s %s\n\n" "$(clr_dim '$')" "$(clr_dim "$(basename "${TIZEN_BIN}")")" "$(clr_dim "${app_id}")" "$(clr_dim "${target}")" >/dev/tty
  if ! "${TIZEN_BIN}" run -p "${app_id}" -s "${target}"; then
    printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${RUN_FAILED}" >/dev/tty; exit 1
  fi

  echo "" >/dev/tty
  printf "  %s %s %s\n\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_MSG}")" "$(clr_bold_cyan "${target}")" >/dev/tty
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
