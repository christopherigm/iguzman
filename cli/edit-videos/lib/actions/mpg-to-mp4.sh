#!/usr/bin/env bash
# lib/actions/mpg-to-mp4.sh — Detect legacy MPG/MPEG formats and flag for re-encode
# No FFmpeg calls here — the encode happens in process-video.sh via the main vf_chain path.

# Sets MPG_NEEDS_ENCODE=1 when the file extension indicates a legacy MPEG container
# that must be re-wrapped to MP4 even if no other action is requested.
#
# Usage (called from process_video before building the action list):
#   detect_mpg_format "${input}"

MPG_NEEDS_ENCODE=0

detect_mpg_format() {
  local input="$1"
  local ext="${input##*.}"; ext="$(lc "${ext}")"
  case "${ext}" in
    mpg|mpeg|m2v|vob)
      MPG_NEEDS_ENCODE=1
      ;;
    *)
      MPG_NEEDS_ENCODE=0
      ;;
  esac
}
