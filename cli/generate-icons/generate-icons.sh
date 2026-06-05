#!/usr/bin/env bash
# generate-icons.sh
#
# Generate PWA icons and favicon.ico for a monorepo app.
# Discovers apps that have a public/logo.{png,jpg,jpeg} and lets
# the user pick one via an interactive menu.
#
# Requirements: ffmpeg must be in PATH.
#
# Run: bash cli/generate-icons/generate-icons.sh [app-name]

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'

clr_dim()       { printf "${DIM}%s${RESET}" "$*"; }
clr_bold()      { printf "${BOLD}%s${RESET}" "$*"; }
clr_cyan()      { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold_cyan() { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green(){ printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_red()  { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Generación de Iconos PWA"
    SUBTITLE="Genera iconos PWA y favicon.ico desde el logo de la app."
    FFMPEG_MISSING="ffmpeg no está instalado o no está en PATH."
    APP_PROMPT="Selecciona la aplicación"
    APP_NOT_FOUND="No se encontraron apps con logo (logo.png/jpg/jpeg) en apps/."
    APP_INVALID="App no encontrada"
    LOGO_LABEL="Fuente"
    STEP_PWA="Generando iconos PWA"
    STEP_FAVICON="Generando favicon"
    ERR_ICON="Error generando"
    ERR_FAVICON="Error generando favicon.ico"
    DONE_TITLE="¡Todo listo!"
    DONE_APP="Aplicación"
    DONE_ICONS="Iconos"
    DONE_FAVICON="Favicon"
  else
    WELCOME="PWA Icon Generator"
    SUBTITLE="Generate PWA icons and favicon.ico from the app logo."
    FFMPEG_MISSING="ffmpeg is not installed or not in PATH."
    APP_PROMPT="Select application"
    APP_NOT_FOUND="No apps with logo (logo.png/jpg/jpeg) found in apps/."
    APP_INVALID="App not found"
    LOGO_LABEL="Source"
    STEP_PWA="Generating PWA icons"
    STEP_FAVICON="Generating favicon"
    ERR_ICON="Error generating"
    ERR_FAVICON="Error generating favicon.ico"
    DONE_TITLE="All icons generated successfully!"
    DONE_APP="App"
    DONE_ICONS="Icons"
    DONE_FAVICON="Favicon"
  fi
}

# ── UI ────────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }

# ── Single-select ─────────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[]
# Output: MENU_SELECTED (index)

interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 46)"
      local ptr label_str
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "
        label_str="${lbl}"
      fi
      printf "  %s  %s\n" "${ptr}" "${label_str}"
    done
  }

  render_select
  printf '\033[?25l'

  while true; do
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if   [[ "${key}" == 'A' ]]; then
          cursor=$(( (cursor - 1 + num) % num ))
          printf "\033[%dA" "${num}"; render_select
        elif [[ "${key}" == 'B' ]]; then
          cursor=$(( (cursor + 1) % num ))
          printf "\033[%dA" "${num}"; render_select
        fi
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then
      printf '\033[?25h'; echo ""; exit 0
    fi
  done

  printf '\033[?25h'
  echo ""
  MENU_SELECTED="${cursor}"
}

# ── Icon generation ───────────────────────────────────────────────────────────

generate_icon() {
  local logo_path="$1" out_path="$2" size="$3" maskable="$4"

  if [[ "${maskable}" -eq 1 ]]; then
    local inner_size pad
    inner_size=$(( size * 80 / 100 ))
    pad=$(( (size - inner_size) / 2 ))
    ffmpeg -y -i "${logo_path}" \
      -vf "scale=${inner_size}:${inner_size}:force_original_aspect_ratio=decrease,\
pad=${inner_size}:${inner_size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,\
pad=${size}:${size}:${pad}:${pad}:color=0x00000000" \
      "${out_path}" >/dev/null 2>&1
  else
    ffmpeg -y -i "${logo_path}" \
      -vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,\
pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" \
      "${out_path}" >/dev/null 2>&1
  fi
}

generate_favicon() {
  local logo_path="$1" out_path="$2"
  ffmpeg -y \
    -i "${logo_path}" -i "${logo_path}" -i "${logo_path}" \
    -filter_complex \
      "[0:v]scale=16:16:force_original_aspect_ratio=decrease,pad=16:16:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s16];\
[1:v]scale=32:32:force_original_aspect_ratio=decrease,pad=32:32:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s32];\
[2:v]scale=48:48:force_original_aspect_ratio=decrease,pad=48:48:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s48]" \
    -map "[s16]" -map "[s32]" -map "[s48]" \
    "${out_path}" >/dev/null 2>&1
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  local app_arg=""
  for arg in "$@"; do
    [[ -z "${app_arg}" ]] && app_arg="${arg}"
  done

  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "${raw_lang,,}" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  # Check ffmpeg
  if ! command -v ffmpeg &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${FFMPEG_MISSING}"; exit 1
  fi

  # Repo root
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover apps with a logo in public/
  local -a APP_NAMES=()
  local -a APP_LOGOS=()
  local -a logo_candidates=("logo.png" "logo.jpg" "logo.jpeg")
  local d pub logo

  for d in "${repo_root}/apps"/*/; do
    pub="${d}public"
    [[ -d "${pub}" ]] || continue
    for logo in "${logo_candidates[@]}"; do
      if [[ -f "${pub}/${logo}" ]]; then
        APP_NAMES+=("$(basename "${d}")")
        APP_LOGOS+=("${pub}/${logo}")
        break
      fi
    done
  done

  if [[ ${#APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")"; exit 1
  fi

  # App selection
  local app_name="" logo_path="" i
  if [[ -n "${app_arg}" ]]; then
    for i in "${!APP_NAMES[@]}"; do
      if [[ "${APP_NAMES[$i]}" == "${app_arg}" ]]; then
        app_name="${APP_NAMES[$i]}"
        logo_path="${APP_LOGOS[$i]}"
        break
      fi
    done
    if [[ -z "${app_name}" ]]; then
      printf "  %s: \"%s\"\n\n" "$(clr_bold_red "✗ ${APP_INVALID}")" "${app_arg}"; exit 1
    fi
  else
    printf "  %s:\n\n" "$(clr_bold "${APP_PROMPT}")"
    MENU_ITEMS=("${APP_NAMES[@]}")
    MENU_SELECTED=0
    interactive_select
    app_name="${APP_NAMES[${MENU_SELECTED}]}"
    logo_path="${APP_LOGOS[${MENU_SELECTED}]}"
    echo ""
  fi

  local logo_file; logo_file="$(basename "${logo_path}")"
  local public_dir; public_dir="$(dirname "${logo_path}")"
  local icons_dir="${public_dir}/icons"
  local favicon_path="${public_dir}/favicon.ico"
  local sep; sep="$(printf '═%.0s' {1..57})"

  printf "  %-14s %s\n" "$(clr_dim "${LOGO_LABEL}:")" \
    "$(clr_cyan "apps/${app_name}/public/${logo_file}")"
  echo ""
  printf "  %s\n\n" "$(clr_dim "${sep}")"

  # Ensure icons output dir exists
  mkdir -p "${icons_dir}"

  # Step 1: PWA icons
  printf "  [1/2] %s → apps/%s/public/icons/\n\n" \
    "$(clr_bold "${STEP_PWA}")" "${app_name}"

  local -a PWA_ICONS=(
    "icon-192x192.png:192:0"
    "icon-512x512.png:512:0"
    "icon-maskable-192x192.png:192:1"
    "icon-maskable-512x512.png:512:1"
  )
  local entry icon_name size maskable out_path mask_label

  for entry in "${PWA_ICONS[@]}"; do
    IFS=: read -r icon_name size maskable <<< "${entry}"
    out_path="${icons_dir}/${icon_name}"
    if [[ "${maskable}" -eq 1 ]]; then
      mask_label="$(clr_dim '(maskable) ')"
    else
      mask_label="           "
    fi
    printf "        %s%s×%s  →  %s … " "${mask_label}" "${size}" "${size}" "${icon_name}"
    if generate_icon "${logo_path}" "${out_path}" "${size}" "${maskable}"; then
      printf "%s\n" "$(clr_bold_green '✓')"
    else
      printf "%s\n" "$(clr_bold_red '✗')"
      printf "\n  %s %s: %s\n\n" "$(clr_bold_red '✗')" "${ERR_ICON}" "${icon_name}"; exit 1
    fi
  done

  # Step 2: Favicon
  printf "\n  [2/2] %s → apps/%s/public/favicon.ico … " \
    "$(clr_bold "${STEP_FAVICON}")" "${app_name}"
  if generate_favicon "${logo_path}" "${favicon_path}"; then
    printf "%s\n" "$(clr_bold_green '✓')"
  else
    printf "%s\n" "$(clr_bold_red '✗')"
    printf "\n  %s %s\n\n" "$(clr_bold_red '✗')" "${ERR_FAVICON}"; exit 1
  fi

  # Summary
  echo ""
  printf "  %s\n" "$(clr_dim "${sep}")"
  echo ""
  printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_bold "${DONE_TITLE}")"
  printf "  %-14s %s\n" "$(clr_dim "${DONE_APP}:")"     "${app_name}"
  printf "  %-14s %s\n" "$(clr_dim "${DONE_ICONS}:")"   "apps/${app_name}/public/icons/ (${#PWA_ICONS[@]} files)"
  printf "  %-14s %s\n" "$(clr_dim "${DONE_FAVICON}:")" "apps/${app_name}/public/favicon.ico"
  echo ""
}

main "$@"
