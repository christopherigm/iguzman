#!/usr/bin/env bash
# lib/ui.sh - ANSI colors, print helpers, and interactive widgets
# Sourced by edit-videos.sh and other modules; must not be executed directly.

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
CYAN='\033[36m'
MAGENTA='\033[35m'

clr_green()        { printf "${GREEN}%s${RESET}" "$*"; }
clr_red()          { printf "${RED}%s${RESET}" "$*"; }
clr_yellow()       { printf "${YELLOW}%s${RESET}" "$*"; }
clr_cyan()         { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()         { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()          { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()    { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()   { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow()  { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()     { printf "${BOLD}${RED}%s${RESET}" "$*"; }
clr_magenta()      { printf "${MAGENTA}%s${RESET}" "$*"; }
clr_bold_magenta() { printf "${BOLD}${MAGENTA}%s${RESET}" "$*"; }

# ── Time formatter ────────────────────────────────────────────────────────────

_fmt_time() {
  local sec="$1"
  if [[ $sec -ge 3600 ]]; then
    printf "%dh%02dm%02ds" $(( sec/3600 )) $(( (sec%3600)/60 )) $(( sec%60 ))
  elif [[ $sec -ge 60 ]]; then
    printf "%dm%02ds" $(( sec/60 )) $(( sec%60 ))
  else
    printf "%ds" "${sec}"
  fi
}

# ── File-size helpers ─────────────────────────────────────────────────────────

# Portable byte count of a file (Linux `stat -c`, macOS/BSD `stat -f`).
_file_size() {
  local f="$1"
  [[ -f "${f}" ]] || { echo 0; return; }
  stat -c%s "${f}" 2>/dev/null || stat -f%z "${f}" 2>/dev/null || echo 0
}

# Human-readable byte formatter (e.g. "1.50 GB").
_fmt_bytes() {
  awk -v b="${1:-0}" 'BEGIN{
    split("B KB MB GB TB PB", u, " ");
    i = 1;
    while (b >= 1024 && i < 6) { b /= 1024; i++ }
    if (i == 1) printf "%d %s", b, u[i]; else printf "%.2f %s", b, u[i];
  }'
}

# ── Logging helper ────────────────────────────────────────────────────────────
# Writes a timestamped line to LOG_FILE when set.

_log() {
  [[ -z "${LOG_FILE:-}" ]] && return 0
  printf "[%s] %s\n" "$(date '+%H:%M:%S')" "$*" >> "${LOG_FILE}"
}

# ── Numeric input helpers ─────────────────────────────────────────────────────

# _read_int varname "prompt" default min max
_read_int() {
  local _varname="$1" _prompt="$2" _default="$3" _min="$4" _max="$5"
  local _val
  while true; do
    printf "  %s (%s): " "${_prompt}" "${_default}"
    read -r _val
    _val="${_val:-${_default}}"
    if [[ "${_val}" =~ ^-?[0-9]+$ ]] && \
       [[ "${_val}" -ge "${_min}" ]] && [[ "${_val}" -le "${_max}" ]]; then
      printf -v "${_varname}" '%s' "${_val}"
      return 0
    fi
    printf "  %s  Enter an integer between %d and %d.\n" "$(clr_bold_red '✗')" "${_min}" "${_max}"
  done
}

# _read_float varname "prompt" default min max
_read_float() {
  local _varname="$1" _prompt="$2" _default="$3" _min="$4" _max="$5"
  local _val
  while true; do
    printf "  %s (%s): " "${_prompt}" "${_default}"
    read -r _val
    _val="${_val:-${_default}}"
    if [[ "${_val}" =~ ^-?[0-9]+(\.[0-9]+)?$ ]] && \
       awk -v v="${_val}" -v lo="${_min}" -v hi="${_max}" 'BEGIN{exit !(v>=lo && v<=hi)}'; then
      printf -v "${_varname}" '%s' "${_val}"
      return 0
    fi
    printf "  %s  Enter a number between %s and %s.\n" "$(clr_bold_red '✗')" "${_min}" "${_max}"
  done
}

# ── Header ────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE:0:52}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

# ── Interactive checkbox ──────────────────────────────────────────────────────
# Set _CB_LABELS, _CB_SEL, _CB_DISABLED before calling.
# Result written to SELECTED_INDICES.

_CB_LABELS=()
_CB_SEL=()
_CB_DISABLED=()
_CB_CURSOR=0
SELECTED_INDICES=()

_cb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local is_dis="${_CB_DISABLED[$j]:-0}"
    local checkbox pointer label_str

    if [[ "${is_dis}" -eq 1 ]]; then
      checkbox="$(clr_dim '[-]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_dim '▶')"
        label_str="$(clr_dim "${lbl} [${GPU_REQUIRED_LABEL}]")"
      else
        pointer=" "
        label_str="$(clr_dim "${lbl} [${GPU_REQUIRED_LABEL}]")"
      fi
    elif [[ "${is_sel}" -eq 1 ]]; then
      checkbox="$(clr_bold_cyan '[✓]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "
        label_str="${lbl}"
      fi
    else
      checkbox="$(clr_dim '[ ]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "
        label_str="${lbl}"
      fi
    fi

    printf "  %s %s %s\n" "${pointer}" "${checkbox}" "${label_str}"
  done
}

interactive_checkbox() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0

  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 0 ]]; then
      _CB_CURSOR=$i
      break
    fi
  done

  _cb_render
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR - 1 + num) % num ))
        printf "\033[%dA" "${num}"; _cb_render
      elif [[ "${seq}" == '[B' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
        printf "\033[%dA" "${num}"; _cb_render
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      if [[ "${_CB_DISABLED[$_CB_CURSOR]:-0}" -eq 0 ]]; then
        _CB_SEL[$_CB_CURSOR]=$(( 1 - _CB_SEL[$_CB_CURSOR] ))
        printf "\033[%dA" "${num}"; _cb_render
      fi
      continue
    fi
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for ((i=0; i<num; i++)); do [[ "${_CB_DISABLED[$i]:-0}" -eq 0 ]] && _CB_SEL[$i]=1; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for ((i=0; i<num; i++)); do [[ "${_CB_DISABLED[$i]:-0}" -eq 0 ]] && _CB_SEL[$i]=0; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); fi
  done
}

# ── Interactive radio button ──────────────────────────────────────────────────
# Like interactive_checkbox but single-select.
# Set exactly one entry in _CB_SEL to 1 to set the default.
# Result: SELECTED_INDICES[0] holds the chosen index.

_rb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local radio pointer label_str
    if [[ "${is_sel}" -eq 1 ]]; then
      radio="$(clr_bold_cyan '(●)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="${lbl}"
      fi
    else
      radio="$(clr_dim '(○)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="$(clr_dim "${lbl}")"
      fi
    fi
    printf "  %s %s %s\n" "${pointer}" "${radio}" "${label_str}"
  done
}

interactive_radio() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0
  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then _CB_CURSOR=$i; break; fi
  done

  _rb_render
  printf '\033[?25l'

  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR - 1 + num) % num ))
        printf "\033[%dA" "${num}"; _rb_render
      elif [[ "${seq}" == '[B' ]]; then
        _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
        printf "\033[%dA" "${num}"; _rb_render
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=0; done
      _CB_SEL[$_CB_CURSOR]=1
      printf "\033[%dA" "${num}"; _rb_render
      continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); break; fi
  done
}
