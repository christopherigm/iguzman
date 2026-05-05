#!/usr/bin/env bash
# lib/actions/video2x.sh — AI video upscaling via Real-ESRGAN (realesrgan-ncnn-vulkan)
# Depends on: probe.sh, progress.sh, encoders.sh, ui.sh

# ── State globals ─────────────────────────────────────────────────────────────

DO_VIDEO2X=0
VIDEO2X_SCALE=2
VIDEO2X_MODEL="realesr-animevideov3"
VIDEO2X_BIN="realesrgan-ncnn-vulkan"
VIDEO2X_LOCAL_DIR="${HOME}/.local/share/edit-videos/video2x"

# ── Install helpers ───────────────────────────────────────────────────────────

check_video2x() {
  if [[ -x "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" ]]; then
    VIDEO2X_BIN="${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan"; return 0
  fi
  command -v realesrgan-ncnn-vulkan &>/dev/null && VIDEO2X_BIN="realesrgan-ncnn-vulkan"
}

bootstrap_video2x() {
  if ! command -v unzip &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${V2X_UNZIP_MISSING}"
    return 1
  fi

  printf "  %s\n" "$(clr_dim "${V2X_DOWNLOADING}")"

  local api_url="https://api.github.com/repos/xinntao/Real-ESRGAN/releases/latest"
  local _fetch="" dl_url=""
  if command -v curl &>/dev/null; then
    _fetch="$(curl -sL "${api_url}")"
  elif command -v wget &>/dev/null; then
    _fetch="$(wget -qO- "${api_url}")"
  fi
  if [[ -n "${_fetch}" ]]; then
    dl_url="$(printf '%s' "${_fetch}" | grep -o '"browser_download_url":"[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
    [[ -z "${dl_url}" ]] && dl_url="$(printf '%s' "${_fetch}" | grep -o '"browser_download_url": "[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
  fi

  if [[ -z "${dl_url}" ]]; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${V2X_DOWNLOAD_FAIL}"
    return 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/v2x.zip"

  _download_file "${dl_url}" "${archive}" || { rm -rf "${tmp_dir}"; return 1; }

  mkdir -p "${VIDEO2X_LOCAL_DIR}"
  unzip -q "${archive}" -d "${tmp_dir}/extracted" || {
    printf "  %s Extraction failed.\n" "$(clr_bold_red '✗')"
    rm -rf "${tmp_dir}"; return 1
  }

  local extracted_dir; extracted_dir="$(find "${tmp_dir}/extracted" -maxdepth 1 -mindepth 1 -type d | head -1)"
  [[ -z "${extracted_dir}" ]] && extracted_dir="${tmp_dir}/extracted"

  cp -r "${extracted_dir}/"* "${VIDEO2X_LOCAL_DIR}/" 2>/dev/null || true
  chmod +x "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  VIDEO2X_BIN="${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan"
  printf "  %s Real-ESRGAN installed to %s\n\n" \
    "$(clr_bold_green '✓')" "$(clr_dim "${VIDEO2X_LOCAL_DIR}")"
}

# ── Processing ────────────────────────────────────────────────────────────────
#
# Arguments:
#   src            — source video path (may come from run_rife output)
#   original_input — original input file (for audio)
#   output         — final output path
#   vf_chain[]     — nameref (still-pending CPU filters applied before extraction)
#   dur_sec        — duration
#   scale          — upscale factor (2 or 4)
#   model          — e.g. "realesr-animevideov3"
#   use_gpu gpu_encoder use_h265

run_video2x() {
  local src="$1"
  local original_input="$2"
  local output="$3"
  local -n _vf_ref="$4"
  local dur_sec="${5:-0}"
  local scale="${6:-2}"
  local model="${7:-realesr-animevideov3}"
  local use_gpu="${8:-0}"
  local gpu_encoder="${9:-}"
  local use_h265="${10:-0}"

  local v2x_in_dir v2x_out_dir
  v2x_in_dir="$(mktemp -d /tmp/v2x_in_XXXXXX)"
  v2x_out_dir="$(mktemp -d /tmp/v2x_out_XXXXXX)"

  # ── Step 1: extract frames ────────────────────────────────────────────────
  local extract_vf=""
  [[ "${#_vf_ref[@]}" -gt 0 ]] && extract_vf="$(IFS=','; echo "${_vf_ref[*]}")"
  local extract_args=(-i "${src}")
  [[ -n "${extract_vf}" ]] && extract_args+=(-vf "${extract_vf}")
  extract_args+=("${v2x_in_dir}/%08d.png")

  if ! run_ffmpeg_step "${V2X_STEP_EXTRACT}" "${dur_sec}" "${extract_args[@]}"; then
    rm -rf "${v2x_in_dir}" "${v2x_out_dir}"; return 1
  fi

  # ── Step 2: Real-ESRGAN upscale ───────────────────────────────────────────
  [[ -n "${VULKAN_GPU_LABEL:-}" ]] && \
    printf "    %s %s: %s\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"

  local in_count; in_count="$(find "${v2x_in_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l)"

  printf "    %s\n" "${V2X_STEP_UPSCALE}..."

  local model_path="${model}"
  [[ "${VIDEO2X_BIN}" == "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" ]] && \
    model_path="${VIDEO2X_LOCAL_DIR}/models/${model}"

  "${VIDEO2X_BIN}" -i "${v2x_in_dir}" -o "${v2x_out_dir}" \
      -n "${model_path}" -s "${scale}" >> "${LOG_FILE:-/dev/null}" 2>&1 &
  local v2x_pid=$!

  if ! wait_frame_progress "${v2x_pid}" "${v2x_out_dir}" "${in_count}"; then
    rm -rf "${v2x_in_dir}" "${v2x_out_dir}"; return 1
  fi
  rm -rf "${v2x_in_dir}"

  # ── Step 3: re-encode ─────────────────────────────────────────────────────
  local _fp="${FFPROBE_BIN}"; [[ ! -x "${_fp}" ]] && _fp="ffprobe"
  local fps_frac; fps_frac="$("${_fp}" -v quiet -select_streams v:0 \
      -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${src}" 2>/dev/null)"
  local fps_num fps_den
  fps_num="${fps_frac%/*}"; fps_den="${fps_frac#*/}"
  [[ -z "${fps_num}" || "${fps_num}" -le 0 ]] && fps_num=30 && fps_den=1
  [[ -z "${fps_den}" || "${fps_den}" -le 0 ]] && fps_den=1
  local out_fps="${fps_num}/${fps_den}"

  build_encode_args "${use_gpu}" "${gpu_encoder}" "${use_h265}" "final"

  local encode_vf_args=()
  for _f in "${ENC_VF_EXTRA[@]}"; do
    encode_vf_args+=(-vf "${_f}")
  done

  if ! run_ffmpeg_step "${V2X_STEP_ENCODE}" "${dur_sec}" \
      "${ENC_PRE_INPUT_ARGS[@]}" \
      -framerate "${out_fps}" -i "${v2x_out_dir}/%08d.png" \
      -i "${original_input}" \
      -map 0:v -map 1:a? \
      "${encode_vf_args[@]}" \
      "${ENC_CODEC_ARGS[@]}" \
      "${output}"; then
    if [[ "${use_gpu}" -eq 1 && ("${gpu_encoder}" == *vaapi* || "${gpu_encoder}" == *nvenc*) ]]; then
      printf "    %s GPU encode failed — retrying with CPU...\n" "$(clr_yellow '⚠')"
      build_encode_args_cpu_fallback "${use_h265}"
      if ! run_ffmpeg_step "${V2X_STEP_ENCODE}" "${dur_sec}" \
          -framerate "${out_fps}" -i "${v2x_out_dir}/%08d.png" \
          -i "${original_input}" \
          -map 0:v -map 1:a? \
          "${ENC_CODEC_ARGS[@]}" "${output}"; then
        rm -rf "${v2x_out_dir}"; return 1
      fi
    else
      rm -rf "${v2x_out_dir}"; return 1
    fi
  fi

  rm -rf "${v2x_out_dir}"
  return 0
}
