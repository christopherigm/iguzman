#!/usr/bin/env bash
# lib/progress.sh - Progress bar / spinner display for long-running child processes
#
# Provides:
#   run_ffmpeg_step  label dur_sec [ffmpeg args...]
#   run_frame_step   label pid_var in_dir out_dir expected_count  (frame-count progress)

# ── FFmpeg step with time-based progress bar ──────────────────────────────────
#
# Runs:  "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" "$@" -y
# Shows: spinner until duration known, then [████░░] percent+ETA bar.
# Returns ffmpeg exit code.

run_ffmpeg_step() {
  local label="$1" dur="${2:-0}"; shift 2
  printf "    %s\n" "${label}..."

  local stderr_tmp bar_width=25
  stderr_tmp="$(mktemp)"
  local step_start=$SECONDS

  "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" "$@" -y 2>"${stderr_tmp}" &
  local ffmpeg_pid=$!

  printf '\033[?25l'
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local _finalizing=0

  while kill -0 "${ffmpeg_pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local pct=-1
    if [[ "${dur}" -gt 0 ]]; then
      local time_str
      time_str="$(grep -o 'time=[0-9:]*' "${stderr_tmp}" 2>/dev/null | tail -1 | cut -d= -f2 || true)"
      if [[ -n "${time_str}" && "${time_str}" != "N/A" ]]; then
        local h=0 m=0 s=0
        IFS=: read -r h m s <<< "${time_str}"
        local cur_sec=$(( 10#${h:-0}*3600 + 10#${m:-0}*60 + 10#${s:-0} ))
        pct=$(( cur_sec * 100 / dur ))
        if [[ "${pct}" -ge 100 ]]; then _finalizing=1; pct=-1; fi
      fi
    fi

    _render_progress_line "${pct}" "${elapsed_str}" "${_finalizing}" "${bar_width}" "${spin_idx}" "${elapsed}"
    spin_idx=$(( spin_idx + 1 ))
    sleep 0.15
  done

  wait "${ffmpeg_pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"

  if [[ "${ec}" -eq 0 ]]; then
    if [[ "${dur}" -gt 0 ]]; then
      local bar; bar="$(_filled_bar "${bar_width}")"
      printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    else
      printf "\r\033[K"
    fi
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
    rm -f "${stderr_tmp}"
    return 0
  else
    printf "\r\033[K"
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
    local tail_out
    tail_out="$(tail -3 "${stderr_tmp}" 2>/dev/null | grep -v '^$' | head -3 || true)"
    [[ -n "${tail_out}" ]] && printf "    %s\n" "$(clr_dim "${tail_out}")"
    rm -f "${stderr_tmp}"
    return "${ec}"
  fi
}

# ── Frame-count-based progress (for RIFE / Real-ESRGAN) ──────────────────────
#
# Monitors a background PID; updates bar based on output frame count vs expected.
# Usage:
#   some_tool ... & local pid=$!
#   wait_frame_progress "${pid}" "${out_dir}" "${expected_count}"

wait_frame_progress() {
  local pid="$1" out_dir="$2" expected_out="$3"
  local step_start=$SECONDS bar_width=25
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

  printf '\033[?25l'
  while kill -0 "${pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local out_count; out_count="$(find "${out_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l || echo 0)"

    local pct=-1
    if [[ "${expected_out}" -gt 0 && "${out_count}" -gt 0 ]]; then
      pct=$(( out_count * 100 / expected_out ))
      [[ "${pct}" -gt 99 ]] && pct=99
    fi

    _render_progress_line "${pct}" "${elapsed_str}" 0 "${bar_width}" "${spin_idx}" "${elapsed}"
    spin_idx=$(( spin_idx + 1 ))
    sleep 0.3
  done

  wait "${pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"

  if [[ "${ec}" -eq 0 ]]; then
    local bar; bar="$(_filled_bar "${bar_width}")"
    printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
  else
    printf "\r\033[K"
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
  fi
  return "${ec}"
}

# ── Deep3D progress (optical-flow line parser) ────────────────────────────────

wait_deep3d_progress() {
  local pid="$1" progress_tmp="$2" dur="${3:-0}"
  local step_start=$SECONDS bar_width=25
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local _finalizing=0

  printf '\033[?25l'
  while kill -0 "${pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local pct=-1

    local flow_line
    flow_line="$(grep -o 'optical flow [0-9]*/[0-9]*' "${progress_tmp}" 2>/dev/null | tail -1 || true)"
    if [[ -n "${flow_line}" ]]; then
      local cur_flow total_flow
      cur_flow="${flow_line##*optical flow }"
      total_flow="${cur_flow##*/}"
      cur_flow="${cur_flow%%/*}"
      if [[ "${total_flow}" -gt 0 ]]; then
        if [[ "${cur_flow}" -ge "${total_flow}" ]]; then
          _finalizing=1
        else
          pct=$(( cur_flow * 100 / total_flow ))
        fi
      fi
    fi

    _render_progress_line "${pct}" "${elapsed_str}" "${_finalizing}" "${bar_width}" "${spin_idx}" "${elapsed}"
    spin_idx=$(( spin_idx + 1 ))
    sleep 0.3
  done

  wait "${pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"
  printf "\r\033[K"

  if [[ "${ec}" -eq 0 ]]; then
    local bar; bar="$(_filled_bar "${bar_width}")"
    printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
  else
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
  fi
  return "${ec}"
}

# ── Internal helpers ──────────────────────────────────────────────────────────

_filled_bar() {
  local width="$1" bar="" i
  for ((i=0; i<width; i++)); do bar+="█"; done
  echo "${bar}"
}

_render_progress_line() {
  local pct="$1" elapsed_str="$2" finalizing="$3" bar_width="$4" spin_idx="$5" elapsed_s="${6:-0}"
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

  if [[ "${finalizing}" -eq 1 ]]; then
    printf "\r    %s  %s  %s\033[K" \
      "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" \
      "$(clr_dim "${elapsed_str}")" \
      "$(clr_dim "${STEP_FINALIZING}")"
  elif [[ "${pct}" -ge 0 ]]; then
    local filled=$(( pct * bar_width / 100 ))
    local empty=$(( bar_width - filled ))
    local bar="" i
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=0; i<empty;  i++)); do bar+="░"; done
    local eta_str=""
    if [[ "${pct}" -ge 1 && "${elapsed_s}" -gt 0 ]]; then
      local total_est=$(( elapsed_s * 100 / pct ))
      local eta=$(( total_est - elapsed_s ))
      [[ "${eta}" -lt 0 ]] && eta=0
      eta_str="  ETA $(_fmt_time "${eta}")"
    fi
    printf "\r    [%s] %3d%%  %s%s\033[K" \
      "$(clr_cyan "${bar}")" "${pct}" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${eta_str}")"
  else
    printf "\r    %s  %s\033[K" \
      "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" \
      "$(clr_dim "${elapsed_str}")"
  fi
}
