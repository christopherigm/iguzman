#!/usr/bin/env bash
# logs.sh
#
# Interactive Kubernetes log viewer for monorepo apps.
# Multi-selects apps → pods, then streams logs with severity highlighting.
#
# Run: bash cli/logs/logs.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# Cycling colors for pod prefixes in multiplexed mode
POD_COLORS=(
  '\033[36m'   # cyan
  '\033[32m'   # green
  '\033[33m'   # yellow
  '\033[35m'   # magenta
  '\033[34m'   # blue
  '\033[96m'   # bright cyan
  '\033[92m'   # bright green
  '\033[93m'   # bright yellow
  '\033[95m'   # bright magenta
  '\033[94m'   # bright blue
)

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Visor de Logs de Kubernetes"
    SUBTITLE="Transmite y resalta logs de pods del clúster."
    KUBECTL_MISSING="kubectl no está instalado o no está en PATH."
    APP_PROMPT="Selecciona aplicaciones"
    APP_NOT_FOUND="No se encontraron apps con NAMESPACE en env.example dentro de apps/."
    APP_NONE_SELECTED="No se seleccionó ninguna aplicación."
    POD_PROMPT="Selecciona pods"
    POD_NONE_FOUND="No se encontraron pods en los namespaces seleccionados."
    POD_NONE_SELECTED="No se seleccionó ningún pod."
    TAIL_PROMPT="Número de líneas (--tail)"
    SELECT_HINT="espacio = marcar  ·  a = todos  ·  n = ninguno  ·  enter = confirmar"
    FOLLOW_PROMPT="Modo de logs"
    OPT_SNAPSHOT="Instantánea - últimas N líneas"
    OPT_LIVE="En vivo - streaming (-f)"
    DISPLAY_PROMPT="Modo de renderizado"
    OPT_MULTI="Multiplexado - todos los pods en paralelo con prefijo de color"
    OPT_SEQ="Secuencial - un pod a la vez"
    SEQ_FOLLOW_NOTE="Modo secuencial con follow: Ctrl+C avanza al siguiente pod."
    FETCHING="Buscando pods"
    STREAMING="Transmitiendo"
    ALL_DONE="¡Todo listo!"
  else
    WELCOME="Kubernetes Log Viewer"
    SUBTITLE="Stream and highlight pod logs from the cluster."
    KUBECTL_MISSING="kubectl is not installed or not in PATH."
    APP_PROMPT="Select applications"
    APP_NOT_FOUND="No apps with NAMESPACE in env.example found in apps/."
    APP_NONE_SELECTED="No applications selected."
    POD_PROMPT="Select pods"
    POD_NONE_FOUND="No pods found in the selected namespaces."
    POD_NONE_SELECTED="No pods selected."
    TAIL_PROMPT="Line count (--tail)"
    SELECT_HINT="space = toggle  ·  a = all  ·  n = none  ·  enter = confirm"
    FOLLOW_PROMPT="Log mode"
    OPT_SNAPSHOT="Snapshot - last N lines"
    OPT_LIVE="Live - streaming (-f)"
    DISPLAY_PROMPT="Rendering mode"
    OPT_MULTI="Multiplexed - all pods interleaved with colored prefix"
    OPT_SEQ="Sequential - one pod at a time"
    SEQ_FOLLOW_NOTE="Sequential follow: press Ctrl+C to advance to the next pod."
    FETCHING="Fetching pods"
    STREAMING="Streaming"
    ALL_DONE="All done!"
  fi
}

# ── UI ────────────────────────────────────────────────────────────────────────

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

# ── Single-select ─────────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[]
# Output: MENU_SELECTED (index)

interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 54)"
      if [[ $j -eq $cursor ]]; then
        printf "  %s  %s\n" "$(clr_cyan '▶')" "$(clr_bold_cyan "${lbl}")"
      else
        printf "     %s\n" "${lbl}"
      fi
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
        cursor=$(( (cursor - 1 + num) % num ))
        printf "\033[%dA" "${num}"; render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" "${num}"; render_select
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

# ── Multi-select ──────────────────────────────────────────────────────────────
# Input:  MENU_ITEMS[], MENU_CHECKED[]
# Output: MENU_CHECKED[] (modified in place)
# Keys:   ↑↓ navigate · space toggle · a all · n none · enter confirm

interactive_multiselect() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_multiselect() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 52)"
      local ptr chk label_str
      if [[ $j -eq $cursor ]]; then ptr="$(clr_cyan '▶')"; else ptr=" "; fi
      if [[ "${MENU_CHECKED[$j]}" -eq 1 ]]; then
        chk="$(clr_bold_cyan '[✓]')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        chk="$(clr_dim '[ ]')"; label_str="${lbl}"
      fi
      printf "  %s  %s  %s\n" "${ptr}" "${chk}" "${label_str}"
    done
  }

  render_multiselect
  printf '\033[?25l'

  while true; do
    local key seq i
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num ))
        printf "\033[%dA" "${num}"; render_multiselect
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num ))
        printf "\033[%dA" "${num}"; render_multiselect
      fi
      continue
    fi

    case "${key}" in
      ' ')
        MENU_CHECKED[$cursor]=$(( 1 - MENU_CHECKED[$cursor] ))
        printf "\033[%dA" "${num}"; render_multiselect ;;
      'a'|'A')
        for i in "${!MENU_ITEMS[@]}"; do MENU_CHECKED[$i]=1; done
        printf "\033[%dA" "${num}"; render_multiselect ;;
      'n'|'N')
        for i in "${!MENU_ITEMS[@]}"; do MENU_CHECKED[$i]=0; done
        printf "\033[%dA" "${num}"; render_multiselect ;;
      $'\r'|$'\n'|'') break ;;
      $'\x03'|$'\x04') printf '\033[?25h'; echo ""; exit 0 ;;
    esac
  done

  printf '\033[?25h'
  echo ""
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# Portable case helper (macOS bash 3 does not support ${var,,})
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

# ── Log colorization ──────────────────────────────────────────────────────────

colorize_line() {
  local line="$1"
  if   [[ "${line}" =~ [Ee][Rr][Rr][Oo][Rr]|CRITICAL|FATAL ]]; then
    printf "${BOLD}${RED}%s${RESET}"    "${line}"
  elif [[ "${line}" =~ [Ww][Aa][Rr][Nn] ]]; then
    printf "${BOLD}${YELLOW}%s${RESET}" "${line}"
  elif [[ "${line}" =~ [Ii][Nn][Ff][Oo] ]]; then
    printf "${CYAN}%s${RESET}"          "${line}"
  elif [[ "${line}" =~ [Dd][Ee][Bb][Uu][Gg] ]]; then
    printf "${DIM}%s${RESET}"           "${line}"
  else
    printf "%s" "${line}"
  fi
}

# ── Pod log streaming ─────────────────────────────────────────────────────────

stream_pod_multi() {
  local pod="$1" ns="$2" color="$3" follow="$4" tail="$5" lock="$6"
  local -a kargs=(logs --tail="${tail}" "${pod}" -n "${ns}")
  [[ "${follow}" -eq 1 ]] && kargs+=(-f)

  kubectl "${kargs[@]}" 2>&1 | while IFS= read -r line; do
    local colored; colored="$(colorize_line "${line}")"
    {
      flock -x 9
      printf "${color}${BOLD}[%-40s]${RESET} %s\n" "${pod:0:38}" "${colored}"
    } 9>>"${lock}"
  done || true
}

stream_pod_seq() {
  local pod="$1" ns="$2" follow="$3" tail="$4"
  printf "\n  %s\n\n" "$(clr_bold_cyan "── ${pod}  (${ns}) ──")"
  local -a kargs=(logs --tail="${tail}" "${pod}" -n "${ns}")
  [[ "${follow}" -eq 1 ]] && kargs+=(-f)

  kubectl "${kargs[@]}" 2>&1 | while IFS= read -r line; do
    printf "  %s\n" "$(colorize_line "${line}")"
  done || true
}

# ── Cleanup (global so EXIT trap can reach it after main() returns) ───────────

BG_PIDS=()
lock_file=""

_cleanup() {
  printf '\033[?25h'
  for p in "${BG_PIDS[@]+"${BG_PIDS[@]}"}"; do kill "${p}" 2>/dev/null || true; done
  wait 2>/dev/null || true
  [[ -n "${lock_file:-}" ]] && rm -f "${lock_file}" 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  trap _cleanup EXIT INT TERM
  # Language
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  if ! command -v kubectl &>/dev/null; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${KUBECTL_MISSING}"; exit 1
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  local repo_root
  repo_root="$(cd "${script_dir}/../.." 2>/dev/null && pwd)"

  # Discover apps that have env.example with a NAMESPACE key
  local -a ALL_APP_NAMES=()
  local -a ALL_APP_NS=()
  local d env_ex ns
  for d in "${repo_root}/apps"/*/; do
    env_ex="${d}env.example"
    if [[ -f "${env_ex}" ]]; then
      ns="$(grep -m1 '^NAMESPACE=' "${env_ex}" 2>/dev/null | cut -d= -f2-)" || true
      if [[ -n "${ns}" ]]; then
        ALL_APP_NAMES+=("$(basename "${d}")")
        ALL_APP_NS+=("${ns}")
      fi
    fi
  done

  if [[ ${#ALL_APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${APP_NOT_FOUND}")"; exit 1
  fi

  # App multi-select (none checked by default)
  MENU_ITEMS=()
  local i
  for i in "${!ALL_APP_NAMES[@]}"; do
    MENU_ITEMS+=("${ALL_APP_NAMES[$i]}  (${ALL_APP_NS[$i]})")
  done

  printf "  %s:\n" "$(clr_bold "${APP_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${SELECT_HINT}")"
  MENU_CHECKED=()
  for i in "${!ALL_APP_NAMES[@]}"; do MENU_CHECKED[$i]=0; done
  interactive_multiselect
  echo ""

  local -a SEL_APP_NAMES=() SEL_APP_NS=()
  for i in "${!MENU_CHECKED[@]}"; do
    [[ "${MENU_CHECKED[$i]}" -eq 1 ]] || continue
    SEL_APP_NAMES+=("${ALL_APP_NAMES[$i]}")
    SEL_APP_NS+=("${ALL_APP_NS[$i]}")
  done

  if [[ ${#SEL_APP_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_dim "${APP_NONE_SELECTED}")"; exit 0
  fi

  # Fetch pods for selected namespaces (deduplicated by namespace)
  printf "  %s..." "$(clr_bold_yellow "${FETCHING}")"

  local -a ALL_POD_NAMES=() ALL_POD_NS=() ALL_POD_STATUS=()
  declare -A _seen_ns=()
  local line pod status

  for i in "${!SEL_APP_NS[@]}"; do
    ns="${SEL_APP_NS[$i]}"
    [[ -n "${_seen_ns[$ns]:-}" ]] && continue
    _seen_ns["${ns}"]=1

    while IFS= read -r line; do
      pod="$(awk '{print $1}' <<< "${line}")"
      status="$(awk '{print $3}' <<< "${line}")"
      [[ -n "${pod}" ]] || continue
      ALL_POD_NAMES+=("${pod}")
      ALL_POD_NS+=("${ns}")
      ALL_POD_STATUS+=("${status:-?}")
    done < <(kubectl get pods -n "${ns}" --no-headers 2>/dev/null || true)
  done

  printf "\r%70s\r" ""

  if [[ ${#ALL_POD_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_bold_red "${POD_NONE_FOUND}")"; exit 1
  fi

  # Pod multi-select (all checked by default)
  MENU_ITEMS=()
  for i in "${!ALL_POD_NAMES[@]}"; do
    MENU_ITEMS+=("$(pad_right "${ALL_POD_NAMES[$i]}" 44)  [${ALL_POD_STATUS[$i]:-?}]  (${ALL_POD_NS[$i]})")
  done

  printf "  %s:\n" "$(clr_bold "${POD_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${SELECT_HINT}")"
  MENU_CHECKED=()
  for i in "${!ALL_POD_NAMES[@]}"; do MENU_CHECKED[$i]=1; done
  interactive_multiselect
  echo ""

  local -a SEL_POD_NAMES=() SEL_POD_NS=()
  for i in "${!MENU_CHECKED[@]}"; do
    [[ "${MENU_CHECKED[$i]}" -eq 1 ]] || continue
    SEL_POD_NAMES+=("${ALL_POD_NAMES[$i]}")
    SEL_POD_NS+=("${ALL_POD_NS[$i]}")
  done

  if [[ ${#SEL_POD_NAMES[@]} -eq 0 ]]; then
    printf "  %s\n\n" "$(clr_dim "${POD_NONE_SELECTED}")"; exit 0
  fi

  # Tail count
  local tail_count
  tail_count="$(prompt_visible "${TAIL_PROMPT}" "20")"
  echo ""
  [[ "${tail_count}" =~ ^[0-9]+$ ]] || tail_count="20"

  # Log mode: snapshot vs live
  printf "\n  %s:\n\n" "$(clr_bold "${FOLLOW_PROMPT}")"
  MENU_ITEMS=("${OPT_SNAPSHOT}" "${OPT_LIVE}")
  MENU_SELECTED=0
  interactive_select
  local follow_mode="${MENU_SELECTED}"
  echo ""

  # Rendering mode (only prompted when >1 pod selected)
  local display_mode=0
  if [[ ${#SEL_POD_NAMES[@]} -gt 1 ]]; then
    printf "  %s:\n\n" "$(clr_bold "${DISPLAY_PROMPT}")"
    MENU_ITEMS=("${OPT_MULTI}" "${OPT_SEQ}")
    MENU_SELECTED=0
    interactive_select
    display_mode="${MENU_SELECTED}"
    echo ""
    if [[ "${display_mode}" -eq 1 && "${follow_mode}" -eq 1 ]]; then
      printf "  %s\n\n" "$(clr_dim "${SEQ_FOLLOW_NOTE}")"
    fi
  fi

  # ── Stream logs ───────────────────────────────────────────────────────────────

  printf "  %s %s...\n\n" "$(clr_bold_yellow '→')" "${STREAMING}"

  BG_PIDS=()
  lock_file=""

  if [[ "${display_mode}" -eq 0 ]]; then
    # Multiplexed: all pods stream in parallel, lines serialized via flock
    lock_file="$(mktemp)"
    local color_idx=0
    for i in "${!SEL_POD_NAMES[@]}"; do
      local pod_color="${POD_COLORS[$color_idx % ${#POD_COLORS[@]}]}"
      stream_pod_multi \
        "${SEL_POD_NAMES[$i]}" "${SEL_POD_NS[$i]}" \
        "${pod_color}" "${follow_mode}" "${tail_count}" "${lock_file}" &
      BG_PIDS+=($!)
      color_idx=$(( color_idx + 1 ))
    done
    wait
  else
    # Sequential: one pod at a time
    for i in "${!SEL_POD_NAMES[@]}"; do
      stream_pod_seq \
        "${SEL_POD_NAMES[$i]}" "${SEL_POD_NS[$i]}" \
        "${follow_mode}" "${tail_count}"
    done
  fi

  echo ""
  printf "  %s\n\n" "$(clr_bold_green "✓ ${ALL_DONE}")"
}

main "$@"
