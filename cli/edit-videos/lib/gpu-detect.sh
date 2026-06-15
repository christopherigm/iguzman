#!/usr/bin/env bash
# lib/gpu-detect.sh - GPU detection for FFmpeg encoding (NVENC/VA-API) and AI tools (Vulkan/CUDA)

# ── State globals ─────────────────────────────────────────────────────────────

USE_H265=0
GPU_ENCODER=""
GPU_LABEL=""
VULKAN_GPU_LABEL=""
HAS_VULKAN_GPU=0
HAS_CUDA_GPU=0

# ── Encoder probe helper ──────────────────────────────────────────────────────

_has_encoder() {
  local bin="$1" encoder="$2" encoder_list
  encoder_list="$("${bin}" -hide_banner -encoders 2>/dev/null || true)"
  grep -q "${encoder}" <<< "${encoder_list}" || return 1
}

# ── NVENC/VA-API detection ────────────────────────────────────────────────────

_switch_to_system_ffmpeg_or_redownload() {
  local btbn_asset; btbn_asset="$(_btbn_asset)"
  if [[ -n "${btbn_asset}" ]]; then
    printf "  %s  %s\n" "$(clr_bold_yellow '⚠')" \
      "$(clr_yellow "Cached FFmpeg build lacks GPU encoders.")"
    printf "  %s [y/n] (y): " "$(clr_bold "Re-download a GPU-capable BtbN FFmpeg build?")"
    local _ans; read -r _ans; _ans="${_ans:-y}"
    if [[ "$(lc "${_ans}")" == y* ]]; then
      bootstrap_ffmpeg
      return 0
    fi
  fi
  printf "  %s  %s\n" "$(clr_bold_yellow '⚠')" \
    "$(clr_yellow "GPU encoding disabled - BtbN FFmpeg required for hardware acceleration.")"
  GPU_ENCODER=""
  return 1
}

# Detects NVENC or VA-API hardware encoder.
# Sets GPU_ENCODER and GPU_LABEL on success; returns 1 if no GPU found.
detect_gpu() {
  printf "  %s\n" "$(clr_dim "${GPU_DETECT}")"

  # NVIDIA NVENC
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    local gpu_name
    gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | xargs 2>/dev/null || true)"
    local _nvenc_ok=0
    if _has_encoder "${FFMPEG_BIN}" 'h264_nvenc'; then
      _nvenc_ok=1
    elif command -v ffmpeg &>/dev/null && _has_encoder ffmpeg 'h264_nvenc'; then
      _switch_to_system_ffmpeg_or_redownload
      _nvenc_ok=1
    fi
    if [[ "${_nvenc_ok}" -eq 1 ]]; then
      GPU_ENCODER="h264_nvenc"
      GPU_LABEL="NVIDIA ${gpu_name} (h264_nvenc)"
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${GPU_FOUND_MSG}" "$(clr_cyan "${GPU_LABEL}")"
      return 0
    fi
  fi

  # VA-API (AMD / Intel on Linux)
  if [[ -e /dev/dri/renderD128 ]]; then
    local _vaapi_ok=0
    if _has_encoder "${FFMPEG_BIN}" 'h264_vaapi'; then
      _vaapi_ok=1
    elif command -v ffmpeg &>/dev/null && _has_encoder ffmpeg 'h264_vaapi'; then
      _switch_to_system_ffmpeg_or_redownload
      _vaapi_ok=1
    fi
    if [[ "${_vaapi_ok}" -eq 1 ]]; then
      GPU_ENCODER="h264_vaapi"
      GPU_LABEL="VA-API /dev/dri/renderD128 (h264_vaapi)"
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${GPU_FOUND_MSG}" "$(clr_cyan "${GPU_LABEL}")"
      return 0
    fi
  fi

  printf "  %s  %s\n" "$(clr_dim '○')" "$(clr_dim "${GPU_NONE}")"
  return 1
}

# ── Vulkan GPU detection (for AI tools: RIFE / Real-ESRGAN) ──────────────────

_VULKAN_TOOLS_WARNED=0

detect_vulkan_gpus() {
  [[ -n "${VULKAN_GPU_LABEL}" ]] && return 0

  if ! command -v vulkaninfo &>/dev/null && [[ "${_VULKAN_TOOLS_WARNED}" -eq 0 ]]; then
    _VULKAN_TOOLS_WARNED=1
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${VULKAN_TOOLS_WARN}")"
    printf "  %s\n\n" "$(clr_dim "${VULKAN_TOOLS_HINT}")"
  fi

  if command -v vulkaninfo &>/dev/null; then
    local vk_name
    vk_name="$(vulkaninfo --summary 2>/dev/null \
      | grep -i 'deviceName' | head -1 \
      | sed 's/.*= *//' | xargs 2>/dev/null)"
    if [[ -n "${vk_name}" ]]; then
      VULKAN_GPU_LABEL="${vk_name} (Vulkan)"
      return 0
    fi
  fi

  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    local gpu_name
    gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
      | head -1 | xargs 2>/dev/null)"
    if [[ -n "${gpu_name}" ]]; then
      VULKAN_GPU_LABEL="${gpu_name} (NVIDIA Vulkan)"
      return 0
    fi
  fi

  if [[ -e /dev/dri/renderD128 ]]; then
    local drm_name
    drm_name="$(cat /sys/class/drm/card0/device/product_name 2>/dev/null | xargs 2>/dev/null)"
    [[ -z "${drm_name}" ]] && \
      drm_name="$(cat /sys/class/drm/card0/device/label 2>/dev/null | xargs 2>/dev/null)"
    if [[ -n "${drm_name}" ]]; then
      VULKAN_GPU_LABEL="${drm_name} (Vulkan)"
    else
      VULKAN_GPU_LABEL="GPU /dev/dri/renderD128 (Vulkan)"
    fi
    return 0
  fi

  return 1
}
