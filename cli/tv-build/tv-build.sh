#!/usr/bin/env bash
# tv-build.sh - build + sign a Samsung Tizen (Smart TV) app into a .wgt package.
#
# Discovers Tizen apps under apps/ (those with config.xml + .tproject), builds
# the web bundle with pnpm, copies the Tizen manifest/metadata into dist/, then
# signs and packages it with the `tizen` CLI using a security profile created by
# cli/tv-cert (run `pnpm tv-cert` first if you have none).
#
# Requires Tizen Studio (`tizen` CLI) and pnpm.
# Run: bash cli/tv-build/tv-build.sh [app-name]   (append "es" for Spanish)

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
    WELCOME="Empaquetar App Samsung Smart TV"
    SUBTITLE="Construye y firma una app Tizen en un .wgt."
    TIZEN_MISSING="No se encontró la herramienta 'tizen' de Tizen Studio."
    TIZEN_HINT="Instala Tizen Studio o exporta TIZEN_HOME apuntando a su carpeta."
    PNPM_MISSING="pnpm no está instalado o no está en PATH."
    APP_PROMPT="Selecciona la app de TV"
    APP_NOT_FOUND="No se encontraron apps de Tizen (config.xml + .tproject) en apps/."
    APP_INVALID="App no encontrada"
    PROFILE_PROMPT="Selecciona el perfil de firma"
    PROFILE_NONE="No hay perfiles de seguridad. Ejecuta 'pnpm tv-cert' primero."
    STEP_BUILD="[1/3] Construyendo el bundle web"
    STEP_COPY="[2/3] Copiando metadatos de Tizen a dist/"
    STEP_PACKAGE="[3/3] Firmando y empaquetando (.wgt)"
    BUILD_FAILED="El build falló."
    BUILD_OK="Build completado."
    NO_DIST="No se generó la carpeta dist/."
    NO_CONFIG="Falta config.xml en la raíz de la app."
    NO_ICON="Falta icon.png en la raíz de la app."
    PACKAGE_FAILED="El empaquetado falló."
    NO_WGT="No se encontró el .wgt generado en dist/."
    DONE_MSG="¡Listo! Paquete firmado:"
    NEXT_STEPS="Próximos pasos"
    NEXT_DEPLOY="pnpm tv-deploy   # instala y ejecuta en un emulador o TV"
  else
    WELCOME="Package Samsung Smart TV App"
    SUBTITLE="Build and sign a Tizen app into a .wgt."
    TIZEN_MISSING="Tizen Studio's 'tizen' CLI was not found."
    TIZEN_HINT="Install Tizen Studio or export TIZEN_HOME pointing at its folder."
    PNPM_MISSING="pnpm is not installed or not in PATH."
    APP_PROMPT="Select TV app"
    APP_NOT_FOUND="No Tizen apps (config.xml + .tproject) found in apps/."
    APP_INVALID="App not found"
    PROFILE_PROMPT="Select signing profile"
    PROFILE_NONE="No security profiles found. Run 'pnpm tv-cert' first."
    STEP_BUILD="[1/3] Building the web bundle"
    STEP_COPY="[2/3] Copying Tizen metadata into dist/"
    STEP_PACKAGE="[3/3] Signing and packaging (.wgt)"
    BUILD_FAILED="Build failed."
    BUILD_OK="Build completed."
    NO_DIST="No dist/ folder was produced."
    NO_CONFIG="config.xml is missing at the app root."
    NO_ICON="icon.png is missing at the app root."
    PACKAGE_FAILED="Packaging failed."
    NO_WGT="Could not find the generated .wgt in dist/."
    DONE_MSG="Done! Signed package:"
    NEXT_STEPS="Next steps"
    NEXT_DEPLOY="pnpm tv-deploy   # install and run on an emulator or TV"
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

TIZEN_BIN=""; TIZEN_DATA=""
resolve_tizen() {
  local base
  for base in "${TIZEN_HOME:-}" "$HOME/tizen-studio" "$HOME/TizenStudio" "/opt/tizen-studio"; do
    [[ -z "${base}" ]] && continue
    if [[ -x "${base}/tools/ide/bin/tizen" ]]; then
      TIZEN_HOME="${base}"; TIZEN_BIN="${base}/tools/ide/bin/tizen"
    fi
  done
  [[ -z "${TIZEN_BIN}" ]] && command -v tizen &>/dev/null && TIZEN_BIN="$(command -v tizen)"
  [[ -z "${TIZEN_BIN}" ]] && return 1
  TIZEN_DATA="${TIZEN_DATA_DIR:-$HOME/tizen-studio-data}"
  return 0
}

# Profile names from profiles.xml (more reliable than parsing CLI table output).
list_profiles() {
  local xml="${TIZEN_DATA}/profile/profiles.xml"
  [[ -f "${xml}" ]] || return 0
  sed -n 's/.*<profile name="\([^"]*\)".*/\1/p' "${xml}"
}

# ── Build a chosen app. Caller sets: app_name app_dir profile TIZEN_BIN ─────────
# Sets BUILT_WGT to the produced .wgt path on success; returns non-zero on failure.
# (Build/package output must not be captured, so this writes to a global rather
# than echoing — pnpm/tizen stream straight to the terminal.)
BUILT_WGT=""
build_and_package() {
  local app_name="$1" app_dir="$2" profile="$3" repo_root="$4" lang="$5"

  # [1/3] pnpm build.
  echo "" >/dev/tty
  printf "  %s\n\n" "$(clr_bold_cyan "── ${STEP_BUILD} ──")" >/dev/tty
  if ! ( cd "${repo_root}" && pnpm build --filter="${app_name}" ); then
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${BUILD_FAILED}" >/dev/tty; return 1
  fi
  printf "\n  %s %s\n" "$(clr_bold_green '✓')" "${BUILD_OK}" >/dev/tty

  local dist="${app_dir}/dist"
  [[ -d "${dist}" ]]              || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_DIST}"   >/dev/tty; return 1; }
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
  rm -f "${dist}"/*.wgt
  if ! "${TIZEN_BIN}" package -t wgt -s "${profile}" -- "${dist}"; then
    printf "\n  %s %s\n" "$(clr_bold_red '✗')" "${PACKAGE_FAILED}" >/dev/tty; return 1
  fi

  local wgt; wgt="$(find "${dist}" -maxdepth 1 -name '*.wgt' -type f 2>/dev/null | head -n1)"
  [[ -n "${wgt}" ]] || { printf "  %s %s\n" "$(clr_bold_red '✗')" "${NO_WGT}" >/dev/tty; return 1; }

  # `tizen package` names the .wgt after the widget <name>; a space in that name
  # (e.g. "Cinelog Tv.wgt") makes the on-device installer split the path into two
  # args and fail instantly with a blank log. Strip spaces from the filename.
  local base safe; base="$(basename "${wgt}")"; safe="${base// /_}"
  if [[ "${safe}" != "${base}" ]]; then
    mv -f "${wgt}" "${dist}/${safe}"; wgt="${dist}/${safe}"
  fi
  BUILT_WGT="${wgt}"
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

  # Tool checks.
  if ! resolve_tizen; then
    printf "  %s %s\n  %s\n\n" "$(clr_bold_red '✗')" "${TIZEN_MISSING}" "$(clr_dim "${TIZEN_HINT}")" >/dev/tty; exit 1
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

  # Select signing profile.
  local -a PROFILES=()
  local p
  while IFS= read -r p; do [[ -n "${p}" ]] && PROFILES+=("${p}"); done < <(list_profiles)
  if [[ ${#PROFILES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${PROFILE_NONE}")" >/dev/tty; exit 1
  fi

  local profile=""
  if [[ ${#PROFILES[@]} -eq 1 ]]; then
    profile="${PROFILES[0]}"
    printf "  %s %s\n" "$(clr_dim "${PROFILE_PROMPT}:")" "$(clr_bold_cyan "${profile}")"
  else
    echo ""
    printf "  %s:\n\n" "$(clr_bold "${PROFILE_PROMPT}")"
    MENU_ITEMS=("${PROFILES[@]}"); MENU_SELECTED=0
    interactive_select
    profile="${PROFILES[${MENU_SELECTED}]}"
  fi

  # Build + sign + package.
  if ! build_and_package "${app_name}" "${app_dir}" "${profile}" "${repo_root}" "${lang}"; then
    echo "" >/dev/tty; exit 1
  fi
  local wgt="${BUILT_WGT}"

  echo "" >/dev/tty
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_MSG}")" >/dev/tty
  printf "      %s\n" "$(clr_cyan "${wgt}")" >/dev/tty
  echo "" >/dev/tty
  printf "  %s\n" "$(clr_bold "${NEXT_STEPS}")" >/dev/tty
  printf "    %s\n" "$(clr_dim "${NEXT_DEPLOY}")" >/dev/tty
  echo "" >/dev/tty
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
