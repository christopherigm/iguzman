#!/usr/bin/env bash
# lib/actions/stabilize.sh — Video stabilization via vid.stab (two-pass) or deshake fallback
# Depends on: probe.sh, progress.sh (run_ffmpeg_step), ui.sh

# ── Stabilize: pass 1 (motion analysis) + adds pass 2 filter to vf_chain ─────
#
# On success, appends vidstabtransform/deshake to the vf_chain nameref.
# Sets TRF_FILE to the temp .trf path (caller must rm it after encoding).
# Returns 1 on failure.
#
# Usage:
#   TRF_FILE=""
#   apply_stabilize_filters "vf_chain" "${src}" "${dur_sec}" \
#       "${stab_mode}" "${stab_shakiness}" "${stab_accuracy}" "${stab_smoothing}" \
#       "${stab_maxangle}" "${stab_maxshift}"

TRF_FILE=""

apply_stabilize_filters() {
  local -n _vf_ref="$1"
  local src="$2"
  local dur_sec="$3"
  local stab_mode="${4:-vidstab}"
  local stab_shakiness="${5:-7}"
  local stab_accuracy="${6:-15}"
  local stab_smoothing="${7:-30}"
  local stab_maxangle="${8:-0.15}"
  local stab_maxshift="${9:-60}"

  if [[ "${stab_mode}" == "vidstab" ]]; then
    TRF_FILE="$(mktemp /tmp/vstab_XXXXXX.trf)"

    # Build detect vf: include any prior CPU filters so analysis matches encoded geometry
    local detect_vf
    if [[ "${#_vf_ref[@]}" -gt 0 ]]; then
      detect_vf="$(IFS=','; echo "${_vf_ref[*]}"),vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${TRF_FILE}"
    else
      detect_vf="vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${TRF_FILE}"
    fi

    if ! run_ffmpeg_step "${STEP_VIDSTABDETECT}" "${dur_sec}" -i "${src}" -vf "${detect_vf}" -f null -; then
      rm -f "${TRF_FILE}"; TRF_FILE=""
      return 1
    fi

    _vf_ref+=("vidstabtransform=input=${TRF_FILE}:smoothing=${stab_smoothing}:maxangle=${stab_maxangle}:maxshift=${stab_maxshift}:interpol=bicubic")

  else
    # deshake fallback: single-pass, no temp file needed
    local deshake_r=$(( 4 + stab_smoothing * 60 / 100 ))
    _vf_ref+=("deshake=rx=${deshake_r}:ry=${deshake_r}:edge=1:search=0")
  fi

  return 0
}
