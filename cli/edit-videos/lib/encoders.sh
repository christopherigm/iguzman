#!/usr/bin/env bash
# lib/encoders.sh - Shared encoder argument builder (CPU / NVENC / VA-API)
#
# Provides build_encode_args() which populates two arrays:
#   ENC_PRE_INPUT_ARGS  - args to prepend before -i (e.g. -vaapi_device, -hwaccel)
#   ENC_VF_EXTRA        - extra vf filters to append after caller's chain (e.g. hwupload)
#   ENC_CODEC_ARGS      - codec/quality flags (e.g. -c:v h264_nvenc -cq 23 ...)
#
# Usage:
#   build_encode_args "${use_gpu}" "${gpu_encoder}" "${use_h265}" ["quality"]
#   Then compose your ffmpeg call with "${ENC_PRE_INPUT_ARGS[@]}" ... "${ENC_CODEC_ARGS[@]}"
#
# The optional "quality" argument accepts:
#   "high"  - fast/lossless intermediate (e.g. pre-transcode before stabilize)
#   "final" - (default) production quality (crf 23 / cq 23)

ENC_PRE_INPUT_ARGS=()
ENC_VF_EXTRA=()
ENC_CODEC_ARGS=()

build_encode_args() {
  local use_gpu="${1:-0}"
  local gpu_encoder="${2:-}"
  local use_h265="${3:-0}"
  local quality="${4:-final}"

  ENC_PRE_INPUT_ARGS=()
  ENC_VF_EXTRA=()
  ENC_CODEC_ARGS=()

  # ── Quality tiers ─────────────────────────────────────────────────────────
  local nvenc_cq_h264=23   nvenc_cq_h265=28
  local vaapi_qp_h264=23   vaapi_qp_h265=28
  local cpu_crf_h264=23    cpu_crf_h265=28
  local cpu_preset="faster"

  if [[ "${quality}" == "high" ]]; then
    nvenc_cq_h264=18;  nvenc_cq_h265=22
    vaapi_qp_h264=18;  vaapi_qp_h265=22
    cpu_crf_h264=18;   cpu_crf_h265=22
    cpu_preset="ultrafast"
  fi

  # ── NVIDIA NVENC ──────────────────────────────────────────────────────────
  if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" && "${use_h265}" -eq 0 ]]; then
    ENC_CODEC_ARGS=(-c:v h264_nvenc -preset p4 -cq "${nvenc_cq_h264}" \
      -surfaces 64 -rc-lookahead 32 -multipass fullres -c:a copy)
    return 0
  fi

  if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
    ENC_CODEC_ARGS=(-c:v hevc_nvenc -preset p4 -cq "${nvenc_cq_h265}" \
      -surfaces 64 -rc-lookahead 32 -multipass fullres -c:a copy)
    return 0
  fi

  # ── VA-API ────────────────────────────────────────────────────────────────
  if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
    ENC_PRE_INPUT_ARGS=(-vaapi_device /dev/dri/renderD128)
    ENC_VF_EXTRA=("format=nv12" "hwupload")
    ENC_CODEC_ARGS=(-c:v h264_vaapi -qp "${vaapi_qp_h264}" -c:a copy)
    return 0
  fi

  if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_vaapi" ]]; then
    ENC_PRE_INPUT_ARGS=(-vaapi_device /dev/dri/renderD128)
    ENC_VF_EXTRA=("format=nv12" "hwupload")
    ENC_CODEC_ARGS=(-c:v hevc_vaapi -qp "${vaapi_qp_h265}" -c:a copy)
    return 0
  fi

  # ── CPU fallback ──────────────────────────────────────────────────────────
  if [[ "${use_h265}" -eq 1 ]]; then
    ENC_CODEC_ARGS=(-c:v libx265 -preset "${cpu_preset}" -crf "${cpu_crf_h265}" -c:a copy)
  else
    ENC_CODEC_ARGS=(-c:v libx264 -preset "${cpu_preset}" -crf "${cpu_crf_h264}" -c:a copy)
  fi
}

# Convenience: retry an encode step with CPU after NVENC/VA-API failure.
# Usage: build_encode_args_cpu_fallback "${use_h265}"
build_encode_args_cpu_fallback() {
  local use_h265="${1:-0}"
  ENC_PRE_INPUT_ARGS=()
  ENC_VF_EXTRA=()
  if [[ "${use_h265}" -eq 1 ]]; then
    ENC_CODEC_ARGS=(-c:v libx265 -preset faster -crf 28 -c:a copy)
  else
    ENC_CODEC_ARGS=(-c:v libx264 -preset faster -crf 23 -c:a copy)
  fi
}
