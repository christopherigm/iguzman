#!/usr/bin/env bash
# lib/process-video.sh - Per-file processing orchestrator; final encode loop
#
# Depends on: all lib/*.sh modules sourced by the entrypoint.
# Uses globals: USE_H265, GPU_ENCODER, DO_DEEP3D, DO_RIFE, DO_VIDEO2X, DO_MPG_TO_MP4,
#               DO_DENOISE, DO_SHARPEN, DO_UPSCALE, DO_DOWNSIZE, DO_COLOR,
#               DOWNSIZE_TARGET_W/H, UPSCALE_TARGET_W/H,
#               DENOISE_LUMA_S, DENOISE_CHROMA_S, DENOISE_LUMA_T, DENOISE_CHROMA_T,
#               COLOR_CONTRAST, COLOR_BRIGHTNESS, COLOR_SATURATION, COLOR_GAMMA,
#               SHARPEN_MATRIX, SHARPEN_LUMA_AMOUNT, SHARPEN_CHROMA_AMOUNT,
#               LOG_FILE, folder, out_dir, video_files[], action_list[]

# ── process_video ─────────────────────────────────────────────────────────────
#
# Processes one video file through the full action pipeline.
#
# Args:
#   $1  input path
#   $2  output path
#   $3  do_black_bars   (0/1)
#   $4  do_fps          (0/1)
#   $5  do_h264         (0/1)
#   $6  do_stab         (0/1)
#   $7  fps_multiplier
#   $8  stab_shakiness
#   $9  stab_accuracy
#   $10 stab_smoothing
#   $11 use_gpu         (0/1)
#   $12 gpu_encoder     e.g. h264_nvenc
#   $13 stab_mode       vidstab|deshake
#   $14 stab_maxangle
#   $15 stab_maxshift
#   $16 do_rife         (0/1)
#   $17 rife_multiplier

process_video() {
  local input="$1"
  local output="$2"
  local do_black_bars="$3"
  local do_fps="$4"
  local do_h264="$5"
  local do_stab="$6"
  local fps_multiplier="$7"
  local stab_shakiness="$8"
  local stab_accuracy="$9"
  local stab_smoothing="${10}"
  local use_gpu="${11}"
  local gpu_encoder="${12}"
  local stab_mode="${13:-vidstab}"
  local stab_maxangle="${14:-0.15}"
  local stab_maxshift="${15:-60}"
  local do_rife="${16:-0}"
  local rife_multiplier="${17:-2}"

  local trf_file=""
  local intermediate=""
  local src="${input}"
  local vf_chain=()

  # ── Probe duration ──────────────────────────────────────────────────────
  local probe_out dur_sec=0
  probe_out="$(probe_video "${input}")"
  dur_sec="${probe_out%% *}"

  # ── HDR detection + conversion filters ─────────────────────────────────
  local do_any=$(( do_black_bars | do_fps | do_h264 | do_stab | DO_DENOISE | DO_SHARPEN | DO_UPSCALE | DO_DOWNSIZE | DO_COLOR | do_rife | DO_VIDEO2X | DO_DEEP3D | DO_MPG_TO_MP4 ))
  local hdr_type="sdr_8bit"
  if [[ "${do_any}" -eq 1 ]]; then
    printf "    %s\n" "$(clr_dim "${HDR_DETECT}")"
    hdr_type="$(probe_hdr_type "${input}")"

    if [[ "${hdr_type}" != "sdr_8bit" ]]; then
      local hdr_label=""
      case "${hdr_type}" in
        hdr10)        hdr_label="${HDR_FOUND_HDR10}" ;;
        hlg)          hdr_label="${HDR_FOUND_HLG}" ;;
        dolby_vision) hdr_label="${HDR_FOUND_DV}" ;;
        sdr_10bit)    hdr_label="${HDR_FOUND_10BIT}" ;;
      esac
      printf "    %s %s\n" "$(clr_cyan '→')" "$(clr_dim "${hdr_label}")"

      if check_zscale; then
        local hdr_filters=()
        get_hdr_conversion_filters "${hdr_type}" hdr_filters
        [[ "${#hdr_filters[@]}" -gt 0 ]] && vf_chain=("${hdr_filters[@]}" "${vf_chain[@]}")
      else
        printf "    %s %s\n" "$(clr_yellow '⚠')" "$(clr_dim "${ZSCALE_FALLBACK_COLORSPACE}")"
        local _fallback_cf=""
        case "${hdr_type}" in
          hdr10|dolby_vision|hlg)
            _fallback_cf="colorspace=iall=bt2020:all=bt709:format=yuv420p"
            ;;
          sdr_10bit)
            _fallback_cf="format=yuv420p"
            ;;
        esac
        [[ -n "${_fallback_cf}" ]] && vf_chain=("${_fallback_cf}" "${vf_chain[@]}")
      fi
    fi
  fi

  # ── Crop (black-bar detection) ──────────────────────────────────────────
  if [[ "${do_black_bars}" -eq 1 ]]; then
    printf "    %s\n" "$(clr_dim "${STEP_CROPDETECT}...")"
    local crop_str
    crop_str="$(detect_black_bars "${input}")"
    if [[ -n "${crop_str}" ]]; then
      printf "    %s crop=%s\n" "$(clr_cyan '→')" "$(clr_dim "${crop_str}")"
      vf_chain+=("crop=${crop_str}")
    else
      printf "    %s %s\n" "$(clr_dim '○')" "$(clr_dim "${NO_BLACK_BARS}")"
    fi
  fi

  # ── Downsize ─────────────────────────────────────────────────────────────
  if [[ "${DO_DOWNSIZE}" -eq 1 ]]; then
    local ds_dim_out ds_vid_w ds_vid_h
    ds_dim_out="$(probe_dimensions "${input}")"
    ds_vid_w="${ds_dim_out%% *}"
    ds_vid_h="${ds_dim_out##* }"
    if [[ "${ds_vid_w}" -eq 0 || "${ds_vid_h}" -eq 0 ]]; then
      printf "    %s Could not read video dimensions - skipping downsize.\n" "$(clr_yellow '⚠')"
    elif [[ "${ds_vid_w}" -le "${DOWNSIZE_TARGET_W}" && "${ds_vid_h}" -le "${DOWNSIZE_TARGET_H}" ]]; then
      printf "    %s %s (%sx%s ≤ %sx%s)\n" \
        "$(clr_dim '○')" "${DOWNSIZE_SKIP_MSG}" \
        "${ds_vid_w}" "${ds_vid_h}" "${DOWNSIZE_TARGET_W}" "${DOWNSIZE_TARGET_H}"
    else
      vf_chain+=("scale=${DOWNSIZE_TARGET_W}:${DOWNSIZE_TARGET_H}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
    fi
  fi

  # ── Quality filters ───────────────────────────────────────────────────────
  if [[ "${DO_DENOISE}" -eq 1 ]]; then
    vf_chain+=("hqdn3d=${DENOISE_LUMA_S}:${DENOISE_CHROMA_S}:${DENOISE_LUMA_T}:${DENOISE_CHROMA_T}")
  fi

  if [[ "${DO_COLOR}" -eq 1 ]]; then
    vf_chain+=("eq=contrast=${COLOR_CONTRAST}:brightness=${COLOR_BRIGHTNESS}:saturation=${COLOR_SATURATION}:gamma=${COLOR_GAMMA}")
  fi

  if [[ "${DO_SHARPEN}" -eq 1 ]]; then
    vf_chain+=("unsharp=${SHARPEN_MATRIX}:${SHARPEN_MATRIX}:${SHARPEN_LUMA_AMOUNT}:${SHARPEN_MATRIX}:${SHARPEN_MATRIX}:${SHARPEN_CHROMA_AMOUNT}")
  fi

  # Lanczos upscale - skipped when Video2X AI upscale handles it
  if [[ "${DO_UPSCALE}" -eq 1 && "${DO_VIDEO2X}" -eq 0 ]]; then
    local dim_out vid_w vid_h
    dim_out="$(probe_dimensions "${input}")"
    vid_w="${dim_out%% *}"
    vid_h="${dim_out##* }"
    if [[ "${vid_w}" -eq 0 || "${vid_h}" -eq 0 ]]; then
      printf "    %s Could not read video dimensions - skipping upscale.\n" "$(clr_yellow '⚠')"
    elif [[ "${vid_w}" -ge "${UPSCALE_TARGET_W}" || "${vid_h}" -ge "${UPSCALE_TARGET_H}" ]]; then
      printf "    %s %s (%sx%s ≥ %sx%s)\n" \
        "$(clr_dim '○')" "${UPSCALE_SKIP_MSG}" \
        "${vid_w}" "${vid_h}" "${UPSCALE_TARGET_W}" "${UPSCALE_TARGET_H}"
    else
      vf_chain+=("scale=${UPSCALE_TARGET_W}:${UPSCALE_TARGET_H}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
    fi
  fi

  # ── Pre-transcode to H.264 SDR for HDR vidstab sources ───────────────────
  if [[ "${do_stab}" -eq 1 && "${stab_mode}" == "vidstab" && "${hdr_type}" != "sdr_8bit" ]]; then
    intermediate="$(mktemp /tmp/edit_videos_pre_XXXXXX.mp4)"
    local pre_vf=""
    [[ "${#vf_chain[@]}" -gt 0 ]] && pre_vf="$(IFS=','; echo "${vf_chain[*]}")"
    local pre_input_args=() pre_codec_args=() _is_vaapi_pre=0
    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      pre_codec_args=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      _is_vaapi_pre=1
      pre_input_args=(-vaapi_device /dev/dri/renderD128)
      [[ -n "${pre_vf}" ]] && pre_vf="${pre_vf},format=nv12,hwupload" || pre_vf="format=nv12,hwupload"
      pre_codec_args=(-c:v h264_vaapi -qp 18 -c:a copy)
    else
      pre_codec_args=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy)
    fi
    local pre_args=("${pre_input_args[@]}" -i "${src}")
    [[ -n "${pre_vf}" ]] && pre_args+=(-vf "${pre_vf}")
    pre_args+=("${pre_codec_args[@]}" "${intermediate}")
    if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" "${pre_args[@]}"; then
      if [[ "${_is_vaapi_pre}" -eq 1 ]]; then
        printf "    %s VA-API pre-conversion failed - retrying with CPU (libx264)...\n" "$(clr_yellow '⚠')"
        local cpu_pre_vf=""
        [[ "${#vf_chain[@]}" -gt 0 ]] && cpu_pre_vf="$(IFS=','; echo "${vf_chain[*]}")"
        local cpu_pre_args=(-i "${src}")
        [[ -n "${cpu_pre_vf}" ]] && cpu_pre_args+=(-vf "${cpu_pre_vf}")
        cpu_pre_args+=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy "${intermediate}")
        if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" "${cpu_pre_args[@]}"; then
          rm -f "${intermediate}"; return 1
        fi
      else
        rm -f "${intermediate}"; return 1
      fi
    fi
    src="${intermediate}"
    vf_chain=()
  fi

  # ── Stabilization (vidstab pass 1; appends pass 2 filter to vf_chain) ───
  if [[ "${do_stab}" -eq 1 ]]; then
    if [[ "${stab_mode}" == "vidstab" ]]; then
      trf_file="$(mktemp /tmp/vstab_XXXXXX.trf)"
      local detect_vf
      if [[ "${#vf_chain[@]}" -gt 0 ]]; then
        detect_vf="$(IFS=','; echo "${vf_chain[*]}"),vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${trf_file}"
      else
        detect_vf="vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${trf_file}"
      fi
      if ! run_ffmpeg_step "${STEP_VIDSTABDETECT}" "${dur_sec}" -i "${src}" -vf "${detect_vf}" -f null -; then
        rm -f "${trf_file}"
        [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi
      vf_chain+=("vidstabtransform=input=${trf_file}:smoothing=${stab_smoothing}:maxangle=${stab_maxangle}:maxshift=${stab_maxshift}:interpol=bicubic")
    else
      local deshake_r=$(( 4 + stab_smoothing * 60 / 100 ))
      vf_chain+=("deshake=rx=${deshake_r}:ry=${deshake_r}:edge=1:search=0")
    fi
  fi

  # ── FPS interpolation filter (CPU minterpolate, skip when RIFE is active) ─
  if [[ "${do_fps}" -eq 1 && "${do_rife}" -eq 0 ]]; then
    apply_fps_filter vf_chain "${input}" "${fps_multiplier}"
  fi

  # ── Deep3D AI stabilization ───────────────────────────────────────────────
  if [[ "${DO_DEEP3D}" -eq 1 ]]; then
    # Bake pending vf_chain into an intermediate before handing to Deep3D
    local d3d_pre_intermediate=""
    if [[ "${#vf_chain[@]}" -gt 0 ]]; then
      d3d_pre_intermediate="$(mktemp /tmp/deep3d_pre_XXXXXX.mp4)"
      local d3d_pre_vf; d3d_pre_vf="$(IFS=','; echo "${vf_chain[*]}")"
      local d3d_pre_input_args=() d3d_pre_codec_args=() _d3d_is_vaapi_pre=0
      local d3d_pre_vf_cpu="${d3d_pre_vf}"
      if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
        d3d_pre_codec_args=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
      elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
        _d3d_is_vaapi_pre=1
        d3d_pre_input_args=(-vaapi_device /dev/dri/renderD128)
        d3d_pre_vf="${d3d_pre_vf},format=nv12,hwupload"
        d3d_pre_codec_args=(-c:v h264_vaapi -qp 18 -c:a copy)
      else
        d3d_pre_codec_args=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy)
      fi
      if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" \
          "${d3d_pre_input_args[@]}" -i "${src}" -vf "${d3d_pre_vf}" "${d3d_pre_codec_args[@]}" "${d3d_pre_intermediate}"; then
        if [[ "${_d3d_is_vaapi_pre}" -eq 1 ]]; then
          printf "    %s VA-API pre-conversion failed - retrying with CPU (libx264)...\n" "$(clr_yellow '⚠')"
          if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" \
              -i "${src}" -vf "${d3d_pre_vf_cpu}" -c:v libx264 -preset ultrafast -crf 18 -c:a copy "${d3d_pre_intermediate}"; then
            rm -f "${d3d_pre_intermediate}"
            [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
            [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
            return 1
          fi
        else
          rm -f "${d3d_pre_intermediate}"
          [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
          [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
          return 1
        fi
      fi
      src="${d3d_pre_intermediate}"
      vf_chain=()
    fi

    local d3d_abs_src
    d3d_abs_src="$(realpath "${src}" 2>/dev/null || readlink -f "${src}" 2>/dev/null || echo "${src}")"

    local d3d_out_temp=""
    local d3d_encode_target="${output}"
    if [[ "${do_rife}" -eq 1 || "${DO_VIDEO2X}" -eq 1 ]]; then
      d3d_out_temp="$(mktemp /tmp/deep3d_out_XXXXXX.mp4)"
      d3d_encode_target="${d3d_out_temp}"
    fi

    if ! run_deep3d "${d3d_abs_src}" "${d3d_encode_target}" "${dur_sec}"; then
      [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"

    if [[ "${do_rife}" -eq 0 && "${DO_VIDEO2X}" -eq 0 ]]; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 0
    fi

    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    intermediate="${d3d_out_temp}"
    src="${d3d_out_temp}"
    vf_chain=()
  fi

  # ── RIFE AI FPS interpolation ─────────────────────────────────────────────
  if [[ "${do_rife}" -eq 1 ]]; then
    local rife_final_output="${output}"
    local rife_chained_temp=""
    if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
      rife_chained_temp="$(mktemp /tmp/rife_chain_XXXXXX.mp4)"
      rife_final_output="${rife_chained_temp}"
    fi

    if ! run_rife "${src}" "${input}" "${rife_final_output}" vf_chain "${dur_sec}" \
        "${rife_multiplier}" "${use_gpu}" "${gpu_encoder}" "${USE_H265}"; then
      [[ -n "${rife_chained_temp}" ]] && rm -f "${rife_chained_temp}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"

    if [[ "${DO_VIDEO2X}" -eq 0 ]]; then
      return 0
    fi

    intermediate="${rife_chained_temp}"
    src="${rife_chained_temp}"
    vf_chain=()
  fi

  # ── Real-ESRGAN AI upscaling ──────────────────────────────────────────────
  if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
    if ! run_video2x "${src}" "${input}" "${output}" vf_chain "${dur_sec}" \
        "${VIDEO2X_SCALE}" "${VIDEO2X_MODEL}" "${use_gpu}" "${gpu_encoder}" "${USE_H265}"; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi
    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
    return 0
  fi

  # ── Final encode pass ────────────────────────────────────────────────────
  local needs_encode=0
  [[ "${#vf_chain[@]}" -gt 0 ]] && needs_encode=1
  [[ "${do_h264}" -eq 1 ]]      && needs_encode=1
  if [[ "${DO_MPG_TO_MP4}" -eq 1 ]]; then
    local _mpg_ext="${src##*.}"; _mpg_ext="$(lc "${_mpg_ext}")"
    if [[ "${_mpg_ext}" == "mpg" || "${_mpg_ext}" == "mpeg" || \
          "${_mpg_ext}" == "m2v" || "${_mpg_ext}" == "vob" ]]; then
      needs_encode=1
    else
      printf "    %s %s\n" "$(clr_dim '○')" "$(clr_dim "${MPG_TO_MP4_SKIP_MSG}")"
    fi
  fi

  if [[ "${needs_encode}" -eq 1 ]]; then
    local pre_input_args=() encode_args=()

    # Full CUDA pipeline: no CPU filters and only scale/resize requested
    local _use_cuda_scale=0
    if [[ "${use_gpu}" -eq 1 && \
          ( "${gpu_encoder}" == "h264_nvenc" || "${gpu_encoder}" == "hevc_nvenc" ) && \
          "${do_black_bars}" -eq 0 && "${do_stab}" -eq 0 && \
          "${DO_DENOISE}" -eq 0 && "${DO_COLOR}" -eq 0 && "${DO_SHARPEN}" -eq 0 && \
          "${do_fps}" -eq 0 && "${hdr_type}" == "sdr_8bit" && \
          "${do_rife}" -eq 0 && "${DO_VIDEO2X}" -eq 0 && "${DO_DEEP3D}" -eq 0 && \
          ( "${DO_DOWNSIZE}" -eq 1 || "${DO_UPSCALE}" -eq 1 ) ]]; then
      _use_cuda_scale=1
      pre_input_args=(-hwaccel cuda -hwaccel_output_format cuda)
    fi

    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      encode_args=(-c:v h264_nvenc -preset p4 -cq 23 -surfaces 64 -rc-lookahead 32 -multipass fullres -c:a copy)
      [[ "${do_stab}" -eq 1 && "${stab_mode}" == "vidstab" ]] && vf_chain+=("format=yuv420p")
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
      encode_args=(-c:v hevc_nvenc -preset p4 -cq 28 -surfaces 64 -rc-lookahead 32 -multipass fullres -c:a copy)
      [[ "${do_stab}" -eq 1 && "${stab_mode}" == "vidstab" ]] && vf_chain+=("format=yuv420p")
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      pre_input_args=(-vaapi_device /dev/dri/renderD128)
      vf_chain+=("format=nv12" "hwupload")
      encode_args=(-c:v h264_vaapi -qp 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_vaapi" ]]; then
      pre_input_args=(-vaapi_device /dev/dri/renderD128)
      vf_chain+=("format=nv12" "hwupload")
      encode_args=(-c:v hevc_vaapi -qp 28 -c:a copy)
    elif [[ "${USE_H265}" -eq 1 ]]; then
      encode_args=(-c:v libx265 -preset faster -crf 28 -c:a copy)
    else
      encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
    fi

    local final_vf=""
    if [[ "${#vf_chain[@]}" -gt 0 ]]; then
      final_vf="$(IFS=','; echo "${vf_chain[*]}")"
      if [[ "${_use_cuda_scale}" -eq 1 ]]; then
        final_vf="${final_vf//scale=/scale_cuda=}"
        final_vf="${final_vf//flags=lanczos/interp_algo=lanczos}"
      fi
    fi

    local ffmpeg_args=("${pre_input_args[@]}" -i "${src}")
    [[ -n "${final_vf}" ]] && ffmpeg_args+=(-vf "${final_vf}")
    ffmpeg_args+=("${encode_args[@]}" "${output}")

    if ! run_ffmpeg_step "${STEP_ENCODE}" "${dur_sec}" "${ffmpeg_args[@]}"; then
      # vidstabtransform + NVENC: retry CPU on failure
      if [[ "${do_stab}" -eq 1 && "${stab_mode}" == "vidstab" && \
            "${use_gpu}" -eq 1 && \
            ("${gpu_encoder}" == "hevc_nvenc" || "${gpu_encoder}" == "h264_nvenc") ]]; then
        printf "    %s NVENC encode failed - retrying with CPU encoder...\n" "$(clr_yellow '⚠')"
        local cpu_encode_args=()
        [[ "${USE_H265}" -eq 1 ]] \
          && cpu_encode_args=(-c:v libx265 -preset faster -crf 28 -c:a copy) \
          || cpu_encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
        local cpu_ffmpeg_args=(-i "${src}")
        [[ -n "${final_vf}" ]] && cpu_ffmpeg_args+=(-vf "${final_vf}")
        cpu_ffmpeg_args+=("${cpu_encode_args[@]}" "${output}")
        if ! run_ffmpeg_step "${STEP_ENCODE}" "${dur_sec}" "${cpu_ffmpeg_args[@]}"; then
          [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
          [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
          return 1
        fi
      else
        [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
        [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi
    fi
  else
    if ! run_ffmpeg_step "${STEP_COPY}" "${dur_sec}" -i "${src}" -c copy "${output}"; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi
  fi

  [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
  [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
  return 0
}

# ── _run_processing ───────────────────────────────────────────────────────────
#
# Iterates video_files[] calling process_video, prints per-file status,
# writes LOG_FILE header/footer, and prints final summary.
# Uses globals: folder, out_dir, video_files[], action_list[],
#               do_black_bars, do_fps, do_h264, do_stab, fps_multiplier,
#               stab_shakiness, stab_accuracy, stab_smoothing, use_gpu,
#               GPU_ENCODER, stab_mode, stab_maxangle, stab_maxshift,
#               DO_RIFE, RIFE_MULTIPLIER, DO_MPG_TO_MP4, LOG_FILE

_run_processing() {
  # TikTok/Reel mode: many-to-one pipeline; bypasses the per-file loop entirely.
  if [[ "${DO_TIKTOK:-0}" -eq 1 ]]; then
    run_tiktok_reel
    return $?
  fi

  local _start_epoch; _start_epoch="$(date +%s)"
  local count_ok=0 count_fail=0 count_idx=0
  local failed_files=()
  local divider; divider="$(printf '─%.0s' {1..60})"

  if [[ -n "${LOG_FILE:-}" ]]; then
    {
      printf "=== FFmpeg Video Editor ===\n"
      printf "Started:  %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"
      printf "Input:    %s\n" "${folder}"
      printf "Output:   %s\n" "${out_dir}"
      printf "Files:    %d\n" "${#video_files[@]}"
      printf "Actions:  %s\n" "$(IFS=', '; echo "${action_list[*]}")"
      printf "===========================\n"
    } >> "${LOG_FILE}"
  fi

  printf "  %s\n" "$(clr_bold "${PROCESSING_TITLE}...")"
  echo "  ${divider}"

  local vf
  for vf in "${video_files[@]}"; do
    count_idx=$(( count_idx + 1 ))
    local base; base="$(basename "${vf}")"
    local out="${out_dir}/${base}"
    if [[ "${DO_MPG_TO_MP4}" -eq 1 ]]; then
      local _out_ext="${base##*.}"; _out_ext="$(lc "${_out_ext}")"
      if [[ "${_out_ext}" == "mpg" || "${_out_ext}" == "mpeg" || \
            "${_out_ext}" == "m2v" || "${_out_ext}" == "vob" ]]; then
        out="${out_dir}/${base%.*}.mp4"
      fi
    fi

    printf "\n  [%d/%d] %s\n" "${count_idx}" "${#video_files[@]}" "$(clr_bold "${base}")"
    _log "[${count_idx}/${#video_files[@]}] Starting: ${base}"

    if process_video "${vf}" "${out}" \
        "${do_black_bars}" "${do_fps}" "${do_h264}" "${do_stab}" \
        "${fps_multiplier}" "${stab_shakiness}" "${stab_accuracy}" "${stab_smoothing}" \
        "${use_gpu}" "${GPU_ENCODER}" "${stab_mode}" \
        "${stab_maxangle}" "${stab_maxshift}" \
        "${DO_RIFE}" "${RIFE_MULTIPLIER}"; then
      count_ok=$(( count_ok + 1 ))
      _log "[${count_idx}/${#video_files[@]}] Done: ${base}"
    else
      printf "  %s %s: %s\n" "$(clr_red '✗')" "${STEP_FAIL}" "${base}"
      count_fail=$(( count_fail + 1 ))
      failed_files+=("${base}")
      _log "[${count_idx}/${#video_files[@]}] FAILED: ${base}"
    fi
  done

  local _end_epoch; _end_epoch="$(date +%s)"
  local _elapsed=$(( _end_epoch - _start_epoch ))

  echo ""
  echo "  ${divider}"
  printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${SUMMARY_OK}" "$(clr_bold "${count_ok}")"
  if [[ "${count_fail}" -gt 0 ]]; then
    printf "  %s %s: %s\n" "$(clr_red '✗')" "${SUMMARY_FAIL}" "$(clr_bold "${count_fail}")"
    local f
    for f in "${failed_files[@]}"; do
      printf "    %s %s\n" "$(clr_dim '·')" "$(clr_dim "${f}")"
    done
  fi
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_dim "${out_dir}")"
  printf "  %s: %s\n" "$(clr_dim "Total time")" "$(clr_dim "$(_fmt_time "${_elapsed}")")"
  echo "  ${divider}"
  printf "\n  %s %s\n\n" "$(clr_bold_green '✓')" "${ALL_DONE}"

  if [[ -n "${LOG_FILE:-}" ]]; then
    {
      printf "===========================\n"
      printf "Done: %d  Failed: %d\n" "${count_ok}" "${count_fail}"
      printf "Finished: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"
      printf "Total time: %s\n" "$(_fmt_time "${_elapsed}")"
    } >> "${LOG_FILE}"
  fi
}
