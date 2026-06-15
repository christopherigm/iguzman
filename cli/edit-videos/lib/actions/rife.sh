#!/usr/bin/env bash
# lib/actions/rife.sh - AI FPS interpolation via rife-ncnn-vulkan
# Depends on: probe.sh, progress.sh, encoders.sh, ui.sh

# ── State globals ─────────────────────────────────────────────────────────────

DO_RIFE=0
RIFE_MULTIPLIER=2
RIFE_BIN="rife-ncnn-vulkan"
RIFE_LOCAL_DIR="${HOME}/.local/share/edit-videos/rife"
RIFE_MODEL="rife-v4.6"

# ── Install helpers ───────────────────────────────────────────────────────────

check_rife() {
  if [[ -x "${RIFE_LOCAL_DIR}/rife-ncnn-vulkan" ]]; then
    RIFE_BIN="${RIFE_LOCAL_DIR}/rife-ncnn-vulkan"; return 0
  fi
  command -v rife-ncnn-vulkan &>/dev/null && RIFE_BIN="rife-ncnn-vulkan"
}

find_rife_model() {
  local preferred=("rife-v4.6" "rife-v4.4" "rife-v4.3" "rife-v4" "rife-v3.9" "rife-v2.4" "rife-v2.3" "rife-v2")
  for m in "${preferred[@]}"; do
    if [[ -d "${RIFE_LOCAL_DIR}/${m}" ]]; then
      RIFE_MODEL="${m}"; return 0
    fi
  done
  local found; found="$(find "${RIFE_LOCAL_DIR}" -maxdepth 1 -type d -name 'rife-v*' 2>/dev/null | sort -V | tail -1)"
  if [[ -n "${found}" ]]; then
    RIFE_MODEL="$(basename "${found}")"; return 0
  fi
  return 1
}

bootstrap_rife() {
  if ! command -v unzip &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${RIFE_UNZIP_MISSING}"
    return 1
  fi

  printf "  %s\n" "$(clr_dim "${RIFE_DOWNLOADING}")"

  local api_url="https://api.github.com/repos/nihui/rife-ncnn-vulkan/releases/latest"
  local dl_url="" _fetch=""
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
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${RIFE_DOWNLOAD_FAIL}"
    return 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/rife.zip"

  _download_file "${dl_url}" "${archive}" || { rm -rf "${tmp_dir}"; return 1; }

  mkdir -p "${RIFE_LOCAL_DIR}"
  unzip -q "${archive}" -d "${tmp_dir}/extracted" || { printf "  %s Extraction failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }

  local extracted_dir; extracted_dir="$(find "${tmp_dir}/extracted" -maxdepth 1 -mindepth 1 -type d | head -1)"
  [[ -z "${extracted_dir}" ]] && extracted_dir="${tmp_dir}/extracted"

  cp -r "${extracted_dir}/"* "${RIFE_LOCAL_DIR}/" 2>/dev/null || true
  chmod +x "${RIFE_LOCAL_DIR}/rife-ncnn-vulkan" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  RIFE_BIN="${RIFE_LOCAL_DIR}/rife-ncnn-vulkan"
  find_rife_model
  printf "  %s RIFE installed to %s (model: %s)\n\n" \
    "$(clr_bold_green '✓')" "$(clr_dim "${RIFE_LOCAL_DIR}")" "$(clr_cyan "${RIFE_MODEL}")"
}

# ── Processing ────────────────────────────────────────────────────────────────
#
# Performs the three-step RIFE pipeline (extract frames → interpolate → re-encode).
# Handles MPG pre-conversion automatically.
#
# Arguments:
#   src            - path to the source video (may be an intermediate temp file)
#   original_input - original input file (for audio remux)
#   output         - final output path  (or a temp path when chaining into Video2X)
#   vf_chain[]     - nameref of pending CPU filters to bake in during frame extraction
#   dur_sec        - probed duration (for run_ffmpeg_step progress bar)
#   rife_multiplier
#   use_gpu gpu_encoder use_h265
#
# Returns 0 on success.  On success, src is updated to the RIFE output path when
# chaining (DO_VIDEO2X=1); otherwise output is the final file.

run_rife() {
  local src="$1"
  local original_input="$2"
  local output="$3"
  local -n _vf_ref="$4"
  local dur_sec="${5:-0}"
  local rife_multiplier="${6:-2}"
  local use_gpu="${7:-0}"
  local gpu_encoder="${8:-}"
  local use_h265="${9:-0}"

  # ── MPG pre-conversion ────────────────────────────────────────────────────
  local mpg_intermediate=""
  local _src_ext="${src##*.}"; _src_ext="$(lc "${_src_ext}")"
  if [[ "${_src_ext}" == "mpg" || "${_src_ext}" == "mpeg" || \
        "${_src_ext}" == "m2v" || "${_src_ext}" == "vob" ]]; then
    mpg_intermediate="$(mktemp /tmp/edit_videos_rife_mpg_XXXXXX.mp4)"
    build_encode_args "${use_gpu}" "${gpu_encoder}" "${use_h265}" "high"
    if ! run_ffmpeg_step "${RIFE_MPG_PRECONVERT}" "${dur_sec}" \
        "${ENC_PRE_INPUT_ARGS[@]}" -i "${src}" "${ENC_CODEC_ARGS[@]}" "${mpg_intermediate}"; then
      rm -f "${mpg_intermediate}"; return 1
    fi
    src="${mpg_intermediate}"
  fi

  local rife_in_dir rife_out_dir
  rife_in_dir="$(mktemp -d /tmp/rife_in_XXXXXX)"
  rife_out_dir="$(mktemp -d /tmp/rife_out_XXXXXX)"

  # ── Compute source rational FPS ───────────────────────────────────────────
  local _fp="${FFPROBE_BIN}"; [[ ! -x "${_fp}" ]] && _fp="ffprobe"
  local fps_frac; fps_frac="$("${_fp}" -v quiet -select_streams v:0 \
      -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${src}" 2>/dev/null)"
  local fps_num fps_den
  fps_num="${fps_frac%/*}"; fps_den="${fps_frac#*/}"
  [[ -z "${fps_num}" || "${fps_num}" -le 0 ]] && fps_num=30 && fps_den=1
  [[ -z "${fps_den}" || "${fps_den}" -le 0 ]] && fps_den=1
  local out_fps="${fps_num}x${rife_multiplier}/${fps_den}"   # e.g. 60000/1001

  # ── Step 1: extract frames (apply pending vf_chain) ─────────────────────
  local extract_vf=""
  [[ "${#_vf_ref[@]}" -gt 0 ]] && extract_vf="$(IFS=','; echo "${_vf_ref[*]}")"
  local extract_args=(-i "${src}")
  [[ -n "${extract_vf}" ]] && extract_args+=(-vf "${extract_vf}")
  extract_args+=("${rife_in_dir}/%08d.png")

  if ! run_ffmpeg_step "${RIFE_STEP_EXTRACT}" "${dur_sec}" "${extract_args[@]}"; then
    rm -rf "${rife_in_dir}" "${rife_out_dir}"
    [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
    return 1
  fi

  # ── Step 2: RIFE interpolation ────────────────────────────────────────────
  [[ -n "${VULKAN_GPU_LABEL:-}" ]] && \
    printf "    %s %s: %s\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"

  local in_count; in_count="$(find "${rife_in_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l)"
  local expected_out=$(( in_count * rife_multiplier ))

  local rife_model_path="${RIFE_MODEL}"
  [[ "${RIFE_BIN}" == "${RIFE_LOCAL_DIR}/rife-ncnn-vulkan" ]] && \
    rife_model_path="${RIFE_LOCAL_DIR}/${RIFE_MODEL}"

  printf "    %s\n" "${RIFE_STEP_INTERP}..."
  "${RIFE_BIN}" -i "${rife_in_dir}" -o "${rife_out_dir}" \
      -n "${expected_out}" -m "${rife_model_path}" >> "${LOG_FILE:-/dev/null}" 2>&1 &
  local rife_pid=$!

  if ! wait_frame_progress "${rife_pid}" "${rife_out_dir}" "${expected_out}"; then
    rm -rf "${rife_in_dir}" "${rife_out_dir}"
    [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
    return 1
  fi
  rm -rf "${rife_in_dir}"

  # ── Step 3: re-encode interpolated frames + audio ─────────────────────────
  local out_fps_rational="${fps_num}x${rife_multiplier}/${fps_den}"
  # Compute properly: (fps_num * multiplier) / fps_den
  local out_fps_num=$(( fps_num * rife_multiplier ))
  out_fps_rational="${out_fps_num}/${fps_den}"

  build_encode_args "${use_gpu}" "${gpu_encoder}" "${use_h265}" "final"

  if ! run_ffmpeg_step "${RIFE_STEP_ENCODE}" "${dur_sec}" \
      "${ENC_PRE_INPUT_ARGS[@]}" \
      -framerate "${out_fps_rational}" -i "${rife_out_dir}/%08d.png" \
      -i "${original_input}" \
      -map 0:v -map 1:a? \
      "${ENC_VF_EXTRA[@]/#/-vf }" \
      "${ENC_CODEC_ARGS[@]}" \
      "${output}"; then
    # VA-API failure path: retry CPU
    if [[ "${use_gpu}" -eq 1 && ("${gpu_encoder}" == *vaapi* || "${gpu_encoder}" == *nvenc*) ]]; then
      printf "    %s GPU encode failed - retrying with CPU...\n" "$(clr_yellow '⚠')"
      build_encode_args_cpu_fallback "${use_h265}"
      if ! run_ffmpeg_step "${RIFE_STEP_ENCODE}" "${dur_sec}" \
          -framerate "${out_fps_rational}" -i "${rife_out_dir}/%08d.png" \
          -i "${original_input}" \
          -map 0:v -map 1:a? \
          "${ENC_CODEC_ARGS[@]}" "${output}"; then
        rm -rf "${rife_out_dir}"
        [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
        return 1
      fi
    else
      rm -rf "${rife_out_dir}"
      [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
      return 1
    fi
  fi

  rm -rf "${rife_out_dir}"
  [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
  return 0
}
