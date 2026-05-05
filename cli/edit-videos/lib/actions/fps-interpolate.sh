#!/usr/bin/env bash
# lib/actions/fps-interpolate.sh — CPU minterpolate FPS filter (adds to vf_chain)
# Depends on: probe.sh (FFPROBE_BIN), ui.sh

# Appends a minterpolate filter to the vf_chain nameref.
# Computes the rational target FPS from the source stream.
#
# Usage:
#   apply_fps_filter "vf_chain" "${input}" "${fps_multiplier}"

apply_fps_filter() {
  local -n _vf_ref="$1"
  local input="$2"
  local fps_multiplier="${3:-2}"

  local _fp="${FFPROBE_BIN}"; [[ ! -x "${_fp}" ]] && _fp="ffprobe"
  local _fps_frac; _fps_frac="$("${_fp}" -v quiet -select_streams v:0 \
    -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "${input}" 2>/dev/null || echo "30/1")"
  local _fps_num="${_fps_frac%/*}" _fps_den="${_fps_frac#*/}"
  [[ -z "${_fps_num}" || "${_fps_num}" -le 0 ]] && _fps_num=30 && _fps_den=1
  [[ -z "${_fps_den}" || "${_fps_den}" -le 0 ]] && _fps_den=1

  local _target_fps_num=$(( _fps_num * fps_multiplier ))
  local _target_fps="${_target_fps_num}/${_fps_den}"
  _vf_ref+=("minterpolate=fps=${_target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=16")
}
