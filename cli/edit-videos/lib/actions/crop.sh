#!/usr/bin/env bash
# lib/actions/crop.sh — Black-bar detection and crop filter building
# Depends on: probe.sh (FFMPEG_BIN, THREAD_FLAGS), progress.sh (run_ffmpeg_step), ui.sh

# ── Black-bar detection ───────────────────────────────────────────────────────
#
# Runs cropdetect on the input and echoes the crop string "W:H:X:Y",
# or an empty string if no bars were found.

detect_black_bars() {
  local input="$1" limit="${2:-24}" round="${3:-16}"
  local log_tmp; log_tmp="$(mktemp)"

  "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" -i "${input}" \
    -vf "cropdetect=limit=${limit}:round=${round}:reset=0" \
    -f null - 2>"${log_tmp}" &
  local ffmpeg_pid=$!

  if [[ "${BG_MODE:-0}" -eq 0 ]]; then
    printf '\033[?25l' >/dev/tty
    local spin_idx=0
    local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    while kill -0 "${ffmpeg_pid}" 2>/dev/null; do
      printf "\r    %s\033[K" "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" >/dev/tty
      spin_idx=$(( spin_idx + 1 ))
      sleep 0.15
    done
    wait "${ffmpeg_pid}" || true
    printf '\033[?25h' >/dev/tty
    printf "\r\033[K" >/dev/tty
  else
    wait "${ffmpeg_pid}" || true
  fi

  local log; log="$(<"${log_tmp}")"
  rm -f "${log_tmp}"

  local crop=""
  while IFS= read -r line; do
    if [[ "${line}" =~ crop=([0-9]+:[0-9]+:[0-9]+:[0-9]+) ]]; then
      crop="${BASH_REMATCH[1]}"
    fi
  done <<< "${log}"

  echo "${crop}"
}

# ── Apply crop to filter chain ────────────────────────────────────────────────
#
# Appends a "crop=W:H:X:Y" entry to the vf_chain nameref array.
# Prints status messages. Does nothing if no bars are detected.
#
# Usage:
#   apply_crop_filter "vf_chain" "${input}"

apply_crop_filter() {
  local -n _vf_ref="$1"
  local input="$2"

  printf "    %s\n" "$(clr_dim "${STEP_CROPDETECT}...")"
  local crop_str
  crop_str="$(detect_black_bars "${input}")"
  if [[ -n "${crop_str}" ]]; then
    printf "    %s crop=%s\n" "$(clr_cyan '→')" "$(clr_dim "${crop_str}")"
    _vf_ref+=("crop=${crop_str}")
  else
    printf "    %s %s\n" "$(clr_dim '○')" "$(clr_dim "${NO_BLACK_BARS}")"
  fi
}
