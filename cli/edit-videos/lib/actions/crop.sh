#!/usr/bin/env bash
# lib/actions/crop.sh - Black-bar detection and crop filter building
# Depends on: probe.sh (FFMPEG_BIN, THREAD_FLAGS), progress.sh (run_ffmpeg_step), ui.sh

# ── Black-bar detection ───────────────────────────────────────────────────────
#
# Runs cropdetect on the input and echoes the crop string "W:H:X:Y",
# or an empty string if no bars were found.

# Black bars are a property of the title, not of any one moment, so cropdetect
# only needs to *sample* the film - not decode all of it. Scanning a full 2h
# feature (especially a slow, effectively single-threaded VC-1/MPEG-2 decode)
# can take many minutes and looks like a hang; a short opening window converges
# on the same crop rectangle in seconds. CROPDETECT_SAMPLE_SEC controls the
# window (0 = scan the whole file, the old behaviour).
#
# Exit status is meaningful to callers:
#   0   completed (crop string echoed on stdout, empty if no bars)
#   124 timed out - decoding exceeded CROPDETECT_TIMEOUT and was killed, so the
#       file should be skipped rather than left hanging.
detect_black_bars() {
  local input="$1" limit="${2:-24}" round="${3:-16}"
  local sample_sec="${CROPDETECT_SAMPLE_SEC:-120}"
  local timeout_s="${CROPDETECT_TIMEOUT:-300}"
  local log_tmp; log_tmp="$(mktemp)"

  # Only decode the first ${sample_sec}s of input (0 = whole file). `-t` as an
  # input option bounds how much is read/decoded.
  local sample_arg=()
  [[ "${sample_sec}" -gt 0 ]] && sample_arg=(-t "${sample_sec}")

  # Wrap the decode in a hard wall-clock cap as a safety net so a
  # corrupt/pathological file can't stall the tool indefinitely here.
  local _timeout=()
  command -v timeout &>/dev/null && _timeout=(timeout "${timeout_s}")

  "${_timeout[@]}" "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" "${sample_arg[@]}" -i "${input}" \
    -vf "cropdetect=limit=${limit}:round=${round}:reset=0" \
    -f null - 2>"${log_tmp}" &
  local ffmpeg_pid=$!

  local rc=0
  if [[ "${BG_MODE:-0}" -eq 0 ]]; then
    printf '\033[?25l' >/dev/tty
    local spin_idx=0
    local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
    while kill -0 "${ffmpeg_pid}" 2>/dev/null; do
      printf "\r    %s\033[K" "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" >/dev/tty
      spin_idx=$(( spin_idx + 1 ))
      sleep 0.15
    done
    wait "${ffmpeg_pid}" || rc=$?
    printf '\033[?25h' >/dev/tty
    printf "\r\033[K" >/dev/tty
  else
    wait "${ffmpeg_pid}" || rc=$?
  fi

  # timeout(1) reports 124 when it had to kill the process. Signal that upward
  # so the caller can skip the file; don't emit a (bogus) partial crop.
  if [[ "${rc}" -eq 124 ]]; then
    rm -f "${log_tmp}"
    return 124
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
  local crop_str _cd_rc=0
  crop_str="$(detect_black_bars "${input}")" || _cd_rc=$?
  if [[ "${_cd_rc}" -eq 124 ]]; then
    printf "    %s %s\n" "$(clr_yellow '⚠')" "$(clr_dim "${CROPDETECT_TIMEOUT_MSG}")"
    return 124
  fi
  if [[ -n "${crop_str}" ]]; then
    printf "    %s crop=%s\n" "$(clr_cyan '→')" "$(clr_dim "${crop_str}")"
    _vf_ref+=("crop=${crop_str}")
  else
    printf "    %s %s\n" "$(clr_dim '○')" "$(clr_dim "${NO_BLACK_BARS}")"
  fi
}
