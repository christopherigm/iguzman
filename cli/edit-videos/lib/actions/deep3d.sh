#!/usr/bin/env bash
# lib/actions/deep3d.sh — AI video stabilization via Deep3D (optical flow, PyTorch/CUDA)
# Depends on: probe.sh, progress.sh, encoders.sh, ui.sh

# ── State globals ─────────────────────────────────────────────────────────────

DO_DEEP3D=0
DEEP3D_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." 2>/dev/null && pwd)"
DEEP3D_SCRIPT="${DEEP3D_DIR}/deep3d_flow_cv.py"
DEEP3D_VENV="${DEEP3D_DIR}/venv"
DEEP3D_REQUIREMENTS="${DEEP3D_DIR}/requirements.txt"
DEEP3D_PYTHON="python3"

# ── Install helpers ───────────────────────────────────────────────────────────

check_deep3d() {
  [[ -f "${DEEP3D_SCRIPT}" ]]
}

bootstrap_deep3d() {
  if ! command -v python3 &>/dev/null; then
    printf "  %s Python 3 not found — cannot install Deep3D.\n" "$(clr_bold_red '✗')"
    return 1
  fi

  if [[ ! -d "${DEEP3D_VENV}" ]]; then
    printf "  %s Creating Python virtualenv...\n" "$(clr_dim '→')"
    python3 -m venv "${DEEP3D_VENV}" || { printf "  %s venv creation failed.\n" "$(clr_bold_red '✗')"; return 1; }
  fi

  DEEP3D_PYTHON="${DEEP3D_VENV}/bin/python3"

  if [[ -f "${DEEP3D_REQUIREMENTS}" ]]; then
    printf "  %s Installing Python dependencies...\n" "$(clr_dim '→')"
    "${DEEP3D_PYTHON}" -m pip install -q -r "${DEEP3D_REQUIREMENTS}" \
        || { printf "  %s pip install failed.\n" "$(clr_bold_red '✗')"; return 1; }
  fi

  printf "  %s Deep3D ready (%s)\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${DEEP3D_PYTHON}")"
}

# ── Processing ────────────────────────────────────────────────────────────────
#
# Runs deep3d_flow_cv.py: stabilizes src → output.
# Shows an optical-flow-line progress bar.
#
# Arguments:
#   src       — input video path
#   output    — output video path
#   dur_sec   — probed duration (for ETA display only)

run_deep3d() {
  local src="$1"
  local output="$2"
  local dur_sec="${3:-0}"

  if [[ ! -f "${DEEP3D_SCRIPT}" ]]; then
    printf "  %s deep3d_flow_cv.py not found at %s\n" "$(clr_bold_red '✗')" "${DEEP3D_SCRIPT}"
    return 1
  fi

  [[ -f "${DEEP3D_VENV}/bin/python3" ]] && DEEP3D_PYTHON="${DEEP3D_VENV}/bin/python3"

  local progress_tmp; progress_tmp="$(mktemp)"

  [[ -n "${HAS_CUDA_GPU:-}" && "${HAS_CUDA_GPU}" -eq 1 ]] && \
    printf "    %s %s: CUDA\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}"

  "${DEEP3D_PYTHON}" "${DEEP3D_SCRIPT}" "${src}" "${output}" >> "${progress_tmp}" 2>&1 &
  local d3d_pid=$!

  printf "    %s\n" "${DEEP3D_STEP_RUNNING}..."
  wait_deep3d_progress "${d3d_pid}" "${progress_tmp}" "${dur_sec}"
  local ec=$?

  rm -f "${progress_tmp}"
  return "${ec}"
}
