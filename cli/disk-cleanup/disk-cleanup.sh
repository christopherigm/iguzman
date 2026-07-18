#!/usr/bin/env bash
# disk-cleanup.sh
#
# Comprehensive disk analyzer & interactive cleaner for a developer machine.
#
# Phase 1 (Analyze)  — Reports filesystem usage (df), the largest directories
#                      under $HOME, and scans a set of well-known "reclaimable"
#                      categories (build caches, dependency dirs, toolchain
#                      caches, trash, logs), each with its measured size.
#
# Phase 2 (Clean)    — Walks each category that has data. SAFE categories
#                      (regenerable caches / build artifacts / trash) can be
#                      removed with a single keypress; REVIEW categories
#                      (node_modules, large logs) are shown but require an
#                      explicit confirmation since they cost time to rebuild.
#
# Nothing is ever deleted without confirmation. Use --dry-run to only analyze.
#
# Usage:
#   bash cli/disk-cleanup/disk-cleanup.sh                # analyze + interactive
#   bash cli/disk-cleanup/disk-cleanup.sh --dry-run      # analyze only
#   bash cli/disk-cleanup/disk-cleanup.sh --yes          # auto-confirm SAFE only
#   bash cli/disk-cleanup/disk-cleanup.sh --all          # include REVIEW prompts
#   bash cli/disk-cleanup/disk-cleanup.sh --root DIR     # scan DIR (default $HOME)
#   bash cli/disk-cleanup/disk-cleanup.sh --no-color
#   bash cli/disk-cleanup/disk-cleanup.sh --es           # Spanish output
#
# Combine flags freely, e.g.  --yes --all  to reclaim everything non-interactively.

# Do NOT set -e: du/find probes may return non-zero on unreadable paths.
set -uo pipefail

# ── Flags ───────────────────────────────────────────────────────────────────────

DRY_RUN=false
AUTO_YES=false
INCLUDE_REVIEW=false
USE_COLOR=true
LANG_ES=false
SCAN_ROOT="${HOME}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=true ;;
    --yes|-y)   AUTO_YES=true ;;
    --all)      INCLUDE_REVIEW=true ;;
    --no-color) USE_COLOR=false ;;
    --es)       LANG_ES=true ;;
    --root)     shift; SCAN_ROOT="${1:-$HOME}" ;;
    --help|-h)  SHOW_HELP=true ;;
    *) printf "Unknown option: %s\n" "$1" >&2; exit 2 ;;
  esac
  shift
done

# Auto-detect Spanish from locale if not forced.
if ! ${LANG_ES} && [[ "${LANG:-}${LC_ALL:-}" == es* ]]; then LANG_ES=true; fi

# ── Colors ──────────────────────────────────────────────────────────────────────

# Use ANSI-C quoting ($'…') so each variable holds a REAL escape byte. This is
# required because printf only interprets \033 in its format string, not inside
# %s arguments — and several helpers below embed colors in the argument.
if ${USE_COLOR}; then
  R=$'\033[0m'    B=$'\033[1m'    D=$'\033[2m'
  GRN=$'\033[0;32m'  RED=$'\033[0;31m'  YEL=$'\033[0;33m'  CYN=$'\033[0;36m'  MAG=$'\033[0;35m'
  BGRN=$'\033[1;32m' BRED=$'\033[1;31m' BYEL=$'\033[1;33m' BCYN=$'\033[1;36m'
else
  R='' B='' D='' GRN='' RED='' YEL='' CYN='' MAG='' BGRN='' BRED='' BYEL='' BCYN=''
fi

# ── Output helpers ──────────────────────────────────────────────────────────────

ok()   { printf "  ${BGRN}✓${R}  %s\n"  "$*"; }
info() { printf "  ${CYN}→${R}  %s\n"  "$*"; }
warn() { printf "  ${BYEL}⚠${R}   %s\n" "$*"; }
note() { printf "  ${D}   %s${R}\n"    "$*"; }

step() {
  printf "\n${BCYN}▶ %s${R}\n" "$*"
  printf "${D}%s${R}\n" "$(printf '─%.0s' {1..64})"
}

hr() { printf "${D}%s${R}\n" "$(printf '─%.0s' {1..64})"; }

# ── i18n ────────────────────────────────────────────────────────────────────────

if ${LANG_ES}; then
  T_WELCOME="Analizador y limpiador de disco"
  T_SUBTITLE="Encuentra y recupera espacio en disco de forma segura."
  T_DRYNOTE="MODO SIMULACIÓN — no se eliminará nada"
  T_FS="Uso del sistema de archivos"
  T_BIGDIRS="Directorios más grandes en"
  T_SCANNING="Analizando categorías recuperables (puede tardar)…"
  T_CATEGORIES="Categorías recuperables"
  T_RECLAIMABLE="Espacio recuperable total"
  T_SAFE="SEGURO"
  T_REVIEW="REVISAR"
  T_NONE="Nada que limpiar. ¡Tu disco ya está ordenado!"
  T_CLEANHDR="Limpieza"
  T_PROMPT_SAFE="Eliminar esta categoría?"
  T_PROMPT_REVIEW="REVISAR — eliminar esto (necesita reinstalar/reconstruir)?"
  T_YES="s"
  T_YESCHARS="sy"
  T_REMOVED="Eliminado"
  T_WOULD="Se eliminaría"
  T_SKIP="Omitido."
  T_FREED="Espacio liberado en esta sesión"
  T_AFTER="Uso del disco (después)"
  T_DELEGATE_DOCKER="Se detectaron imágenes Docker/containerd. Ejecuta:  pnpm docker-cleanup"
  T_JOURNAL="Registros del journal (systemd)"
  T_JOURNAL_HINT="Usa: sudo journalctl --vacuum-size=200M"
  T_TIP="Sugerencia"
  T_TURBO_TIP="El caché de Turborepo se regenera solo; puedes borrarlo sin miedo cuando crezca."
  T_DONE="Listo."
  T_ITEMS="ubicaciones"
else
  T_WELCOME="Disk Analyzer & Cleaner"
  T_SUBTITLE="Find and safely reclaim disk space on a dev machine."
  T_DRYNOTE="DRY-RUN MODE — nothing will be deleted"
  T_FS="Filesystem usage"
  T_BIGDIRS="Largest directories in"
  T_SCANNING="Scanning reclaimable categories (this may take a moment)…"
  T_CATEGORIES="Reclaimable categories"
  T_RECLAIMABLE="Total reclaimable"
  T_SAFE="SAFE"
  T_REVIEW="REVIEW"
  T_NONE="Nothing to clean. Your disk is already tidy!"
  T_CLEANHDR="Cleanup"
  T_PROMPT_SAFE="Remove this category?"
  T_PROMPT_REVIEW="REVIEW — remove this (needs reinstall/rebuild)?"
  T_YES="y"
  T_YESCHARS="y"
  T_REMOVED="Removed"
  T_WOULD="Would remove"
  T_SKIP="Skipped."
  T_FREED="Freed this session"
  T_AFTER="Disk usage (after)"
  T_DELEGATE_DOCKER="Docker/containerd images detected. Run:  pnpm docker-cleanup"
  T_JOURNAL="systemd journal logs"
  T_JOURNAL_HINT="Run: sudo journalctl --vacuum-size=200M"
  T_TIP="Tip"
  T_TURBO_TIP="Turborepo's cache regenerates itself — safe to wipe whenever it grows large."
  T_DONE="Done."
  T_ITEMS="locations"
fi

# ── Header ──────────────────────────────────────────────────────────────────────

print_header() {
  local line; line="$(printf '─%.0s' {1..56})"
  echo ""
  printf "  ${BCYN}┌%s┐${R}\n" "${line}"
  printf "  ${BCYN}│${R}  ${B}%-54s${R}${BCYN}│${R}\n" "${T_WELCOME}"
  printf "  ${BCYN}│${R}  ${D}%-54s${R}${BCYN}│${R}\n" "${T_SUBTITLE}"
  if ${DRY_RUN}; then
    printf "  ${BCYN}│${R}  ${BYEL}⚠  %-52s${R}${BCYN}│${R}\n" "${T_DRYNOTE}"
  fi
  printf "  ${BCYN}└%s┘${R}\n" "${line}"
}

# ── Size helpers ────────────────────────────────────────────────────────────────

# Sum of one-or-more paths in bytes (apparent-on-disk, one filesystem).
bytes_of() {
  local total=0 sz p
  for p in "$@"; do
    [[ -e "${p}" ]] || continue
    sz="$(du -sxb "${p}" 2>/dev/null | awk '{print $1}')"
    [[ -n "${sz}" ]] && total=$(( total + sz ))
  done
  echo "${total}"
}

human() { # bytes → human readable
  local b="${1:-0}"
  if   (( b >= 1073741824 )); then awk -v b="$b" 'BEGIN{printf "%.1fG", b/1073741824}'
  elif (( b >= 1048576 ));    then awk -v b="$b" 'BEGIN{printf "%.0fM", b/1048576}'
  elif (( b >= 1024 ));       then awk -v b="$b" 'BEGIN{printf "%.0fK", b/1024}'
  else printf "%dB" "${b}"; fi
}

# ── Category registry ────────────────────────────────────────────────────────────
# Parallel arrays: label · kind(safe|review) · bytes · newline-separated paths.

declare -a CAT_LABEL=() CAT_KIND=() CAT_BYTES=() CAT_PATHS=()

# add_category LABEL KIND PATH...   (only added when non-empty on disk)
add_category() {
  local label="$1" kind="$2"; shift 2
  local -a existing=()
  local p
  for p in "$@"; do [[ -e "${p}" ]] && existing+=("${p}"); done
  (( ${#existing[@]} == 0 )) && return 0
  local b; b="$(bytes_of "${existing[@]}")"
  (( b == 0 )) && return 0
  CAT_LABEL+=("${label}")
  CAT_KIND+=("${kind}")
  CAT_BYTES+=("${b}")
  CAT_PATHS+=("$(printf '%s\n' "${existing[@]}")")
}

# find_dirs_named ROOT NAME   → newline list of matching dirs (pruned, no descent)
find_dirs_named() {
  find "$1" -type d -name "$2" -prune 2>/dev/null
}

# ── Confirm helper ──────────────────────────────────────────────────────────────

confirm() { # confirm PROMPT  → 0 yes / 1 no
  local reply
  printf "  ${BYEL}?${R}  %s ${D}[%s/N]${R} " "$1" "${T_YES}"
  read -r reply </dev/tty || return 1
  reply="$(printf '%s' "${reply}" | tr '[:upper:]' '[:lower:]')"
  [[ -n "${reply}" && "${T_YESCHARS}" == *"${reply:0:1}"* ]]
}

# ═════════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════════════════════════

if [[ "${SHOW_HELP:-false}" == true ]]; then
  grep -E '^#( |$)' "$0" | sed -E 's/^# ?//'
  exit 0
fi

print_header

# ── Filesystem overview ──────────────────────────────────────────────────────────

step "${T_FS}"
df -h --output=target,size,used,avail,pcent 2>/dev/null \
  | awk 'NR==1 || /^\/($| )|\/home|\/$/' \
  | grep -vE 'tmpfs|efivarfs|/boot|/run|/dev/shm|/sys' \
  | sed 's/^/  /'
# Fallback if --output unsupported (BSD df): show the root line plainly.
df -h "${SCAN_ROOT}" 2>/dev/null | sed 's/^/  /' | tail -n +1 >/dev/null

# ── Largest directories under scan root ──────────────────────────────────────────

step "${T_BIGDIRS} ${SCAN_ROOT}"
du -xh -d1 "${SCAN_ROOT}" 2>/dev/null | sort -rh | grep -v "^[0-9.]*[KMG]\?	${SCAN_ROOT}\$" \
  | head -12 | awk '{printf "  %-8s %s\n", $1, $2}'

# ── Scan reclaimable categories ──────────────────────────────────────────────────

step "${T_CATEGORIES}"
info "${T_SCANNING}"

# Collect dependency/build dirs across the scan root (bounded depth for speed).
mapfile -t _turbo   < <(find "${SCAN_ROOT}" -maxdepth 6 -type d -name ".turbo" -prune 2>/dev/null)
mapfile -t _next    < <(find "${SCAN_ROOT}" -maxdepth 6 -type d -name ".next" -prune 2>/dev/null)
mapfile -t _nmods   < <(find "${SCAN_ROOT}" -maxdepth 6 -type d -name "node_modules" -prune 2>/dev/null)
mapfile -t _pycache < <(find "${SCAN_ROOT}" -maxdepth 8 -type d -name "__pycache__" -prune 2>/dev/null)
mapfile -t _dist    < <(find "${SCAN_ROOT}" -maxdepth 6 -type d \( -name "dist" -o -name ".expo" -o -name ".vite" \) -prune 2>/dev/null)

# SAFE — regenerable build caches & artifacts
add_category "Turborepo cache (.turbo)"      safe "${_turbo[@]}"
add_category "Next.js build output (.next)"  safe "${_next[@]}"
add_category "Build artifacts (dist/.expo)"  safe "${_dist[@]}"
add_category "Python bytecode (__pycache__)" safe "${_pycache[@]}"

# SAFE — user-level toolchain caches
add_category "pnpm/npm cache"      safe "${HOME}/.npm/_cacache" "${HOME}/.local/share/pnpm/store" "${HOME}/.cache/pnpm"
add_category "Generic ~/.cache"    safe "${HOME}/.cache/pip" "${HOME}/.cache/ms-playwright" "${HOME}/.cache/puppeteer" "${HOME}/.cache/Cypress" "${HOME}/.cache/yarn"
add_category "Gradle build cache"  safe "${HOME}/.gradle/caches"
add_category "Go build/module cache" safe "${HOME}/.cache/go-build" "${HOME}/go/pkg/mod/cache"
add_category "Expo/Metro cache"    safe "${HOME}/.expo" "${HOME}/.metro"
add_category "VS Code caches"      safe "${HOME}/.config/Code/Cache" "${HOME}/.config/Code/CachedData" "${HOME}/.config/Code/Service Worker/CacheStorage"
add_category "Trash"              safe "${HOME}/.local/share/Trash"
add_category "Thumbnail cache"    safe "${HOME}/.cache/thumbnails"

# REVIEW — costs time to rebuild
add_category "node_modules (all projects)" review "${_nmods[@]}"

# ── Report table ─────────────────────────────────────────────────────────────────

echo ""
if (( ${#CAT_LABEL[@]} == 0 )); then
  ok "${T_NONE}"
else
  # Sort category indices by bytes desc.
  order="$(for i in "${!CAT_BYTES[@]}"; do printf '%s %s\n' "${CAT_BYTES[$i]}" "$i"; done | sort -rn | awk '{print $2}')"
  total=0
  printf "  ${B}%-34s %6s   %-6s %5s${R}\n" "CATEGORY" "SIZE" "KIND" "${T_ITEMS}"
  hr
  for i in ${order}; do
    b="${CAT_BYTES[$i]}"
    total=$(( total + b ))
    cnt="$(printf '%s' "${CAT_PATHS[$i]}" | grep -c .)"
    # Pad the plain word to width 6, then colorize (color codes break %-Ns).
    if [[ "${CAT_KIND[$i]}" == safe ]]; then
      kc="$(printf '%-6s' "${T_SAFE}")"; kc="${GRN}${kc}${R}"
    else
      kc="$(printf '%-6s' "${T_REVIEW}")"; kc="${YEL}${kc}${R}"
    fi
    printf "  %-34s ${BCYN}%6s${R}   ${kc} ${D}%5s${R}\n" \
      "${CAT_LABEL[$i]}" "$(human "${b}")" "${cnt}"
  done
  hr
  printf "  ${B}%-34s ${BGRN}%6s${R}\n" "${T_RECLAIMABLE}" "$(human "${total}")"
fi

# Docker note — delegate to the dedicated tool rather than touch it here.
if command -v docker >/dev/null 2>&1 && docker images -q 2>/dev/null | grep -q .; then
  echo ""; note "${T_DELEGATE_DOCKER}"
elif command -v microk8s >/dev/null 2>&1; then
  echo ""; note "${T_DELEGATE_DOCKER}"
fi

# journal size hint
if command -v journalctl >/dev/null 2>&1; then
  jsize="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[KMG]' | head -1)"
  [[ -n "${jsize}" ]] && note "${T_JOURNAL}: ${jsize}. ${T_JOURNAL_HINT}"
fi

# ── Cleanup phase ────────────────────────────────────────────────────────────────

(( ${#CAT_LABEL[@]} == 0 )) && { echo ""; printf "  ${GRN}%s${R}\n\n" "${T_DONE}"; exit 0; }

echo ""
note "${T_TIP}: ${T_TURBO_TIP}"

if ${DRY_RUN}; then
  echo ""; warn "${T_DRYNOTE}"; echo ""
  exit 0
fi

step "${T_CLEANHDR}"

FREED=0
for i in ${order}; do
  label="${CAT_LABEL[$i]}"
  kind="${CAT_KIND[$i]}"
  b="${CAT_BYTES[$i]}"
  mapfile -t paths < <(printf '%s\n' "${CAT_PATHS[$i]}" | grep .)

  # Decide whether to act.
  act=false
  if [[ "${kind}" == safe ]]; then
    if ${AUTO_YES}; then act=true
    elif confirm "${T_PROMPT_SAFE} ${B}${label}${R} ${BCYN}($(human "${b}"))${R}"; then act=true; fi
  else
    # REVIEW: only when explicitly opted in; still ask unless --yes AND --all.
    if ${INCLUDE_REVIEW}; then
      if ${AUTO_YES}; then act=true
      elif confirm "${T_PROMPT_REVIEW} ${B}${label}${R} ${BCYN}($(human "${b}"))${R}"; then act=true; fi
    else
      note "${T_SKIP} ${label} ${D}(${T_REVIEW} — use --all)${R}"
    fi
  fi

  ${act} || { [[ "${kind}" == safe ]] && note "${T_SKIP} ${label}"; continue; }

  for p in "${paths[@]}"; do rm -rf -- "${p}" 2>/dev/null; done
  FREED=$(( FREED + b ))
  ok "${T_REMOVED}: ${label} ${BGRN}($(human "${b}"))${R}"
done

# ── Summary ──────────────────────────────────────────────────────────────────────

echo ""
hr
printf "  ${B}%-24s ${BGRN}%s${R}\n" "${T_FREED}:" "$(human "${FREED}")"
step "${T_AFTER}"
df -h "${SCAN_ROOT}" 2>/dev/null | sed 's/^/  /'
echo ""
printf "  ${GRN}%s${R}\n\n" "${T_DONE}"
