#!/usr/bin/env bash
# edit-videos.sh - Batch FFmpeg video editor (thin entrypoint)
#
# Sources all lib/ modules and delegates to main().
# See CLAUDE.md / README for architecture overview.

set -euo pipefail

# ── Resolve script directory ──────────────────────────────────────────────────
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

# ── Source modules (order matters: dependencies first) ───────────────────────
# shellcheck source=lib/ui.sh
source "${_SCRIPT_DIR}/lib/ui.sh"
# shellcheck source=lib/i18n.sh
source "${_SCRIPT_DIR}/lib/i18n.sh"
# shellcheck source=lib/ffmpeg-bootstrap.sh
source "${_SCRIPT_DIR}/lib/ffmpeg-bootstrap.sh"
# shellcheck source=lib/gpu-detect.sh
source "${_SCRIPT_DIR}/lib/gpu-detect.sh"
# shellcheck source=lib/encoders.sh
source "${_SCRIPT_DIR}/lib/encoders.sh"
# shellcheck source=lib/probe.sh
source "${_SCRIPT_DIR}/lib/probe.sh"
# shellcheck source=lib/progress.sh
source "${_SCRIPT_DIR}/lib/progress.sh"

# Action modules
# shellcheck source=lib/actions/crop.sh
source "${_SCRIPT_DIR}/lib/actions/crop.sh"
# shellcheck source=lib/actions/stabilize.sh
source "${_SCRIPT_DIR}/lib/actions/stabilize.sh"
# shellcheck source=lib/actions/fps-interpolate.sh
source "${_SCRIPT_DIR}/lib/actions/fps-interpolate.sh"
# shellcheck source=lib/actions/quality.sh
source "${_SCRIPT_DIR}/lib/actions/quality.sh"
# shellcheck source=lib/actions/rife.sh
source "${_SCRIPT_DIR}/lib/actions/rife.sh"
# shellcheck source=lib/actions/video2x.sh
source "${_SCRIPT_DIR}/lib/actions/video2x.sh"
# shellcheck source=lib/actions/deep3d.sh
source "${_SCRIPT_DIR}/lib/actions/deep3d.sh"
# shellcheck source=lib/actions/mpg-to-mp4.sh
source "${_SCRIPT_DIR}/lib/actions/mpg-to-mp4.sh"
# shellcheck source=lib/actions/tiktok.sh
source "${_SCRIPT_DIR}/lib/actions/tiktok.sh"

# Orchestration
# shellcheck source=lib/process-video.sh
source "${_SCRIPT_DIR}/lib/process-video.sh"

# ── Global action state (set by main; read by process_video) ─────────────────
DO_DENOISE=0
DO_SHARPEN=0
DO_UPSCALE=0
DO_DOWNSIZE=0
DO_COLOR=0
DO_COMPRESS=0
DO_TIKTOK=0

COMPRESS_PERCENT=50

DENOISE_LUMA_S=4; DENOISE_CHROMA_S=4; DENOISE_LUMA_T=3; DENOISE_CHROMA_T=3
COLOR_CONTRAST=1.1; COLOR_BRIGHTNESS=0.0; COLOR_SATURATION=1.1; COLOR_GAMMA=1.0
SHARPEN_MATRIX=5; SHARPEN_LUMA_AMOUNT=1.0; SHARPEN_CHROMA_AMOUNT=0.0
UPSCALE_TARGET_W=1920; UPSCALE_TARGET_H=1080
DOWNSIZE_TARGET_W=1920; DOWNSIZE_TARGET_H=1080

DEEP3D_STABILITY=12
DEEP3D_DEVICE="cuda:0"
DEEP3D_GPU_NAME=""

LOG_FILE=""
BG_MODE=0

# Portable case helper (macOS bash 3 does not support ${var,,})
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ── main ──────────────────────────────────────────────────────────────────────
main() {
  # ── Language ────────────────────────────────────────────────────────────
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"
  trap 'printf "\033[?25h"' EXIT

  clear
  print_header

  # ── FFmpeg (BtbN static build required) ─────────────────────────────────
  printf "  %s\n" "$(clr_dim "${FFMPEG_CHECK}")"

  local ffmpeg_ver
  if [[ -x "${FFMPEG_LOCAL_DIR}/ffmpeg" ]]; then
    FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
    FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
    ffmpeg_ver="$("${FFMPEG_BIN}" -version 2>/dev/null | head -1 | sed 's/ffmpeg version //')"
    printf "  %s %s: %s\n\n" "$(clr_bold_green '✓')" "${FFMPEG_FOUND}" "$(clr_dim "${ffmpeg_ver}")"
  else
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${BTBN_REQUIRED_MSG}")"
    printf "  %s %s\n" "$(clr_dim '→')" "$(clr_dim "${BTBN_REQUIRED_REASON}")"
    echo ""
    printf "  %s [y/n] (y): " "$(clr_bold "${BTBN_DOWNLOAD_PROMPT}")"
    local dl_ans; read -r dl_ans; dl_ans="${dl_ans:-y}"
    if [[ "$(lc "${dl_ans}")" == y* ]]; then
      bootstrap_ffmpeg
      ffmpeg_ver="$("${FFMPEG_BIN}" -version 2>/dev/null | head -1 | sed 's/ffmpeg version //')"
      printf "  %s %s: %s\n\n" "$(clr_bold_green '✓')" "${FFMPEG_FOUND}" "$(clr_dim "${ffmpeg_ver}")"
    else
      printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${BTBN_DECLINED_MSG}"
      exit 1
    fi
  fi

  # ── GPU detection ────────────────────────────────────────────────────────
  local use_gpu=0
  if detect_gpu; then
    printf "  %s: Y\n" "${GPU_USE_PROMPT}"
    use_gpu=1
  fi
  echo ""

  # ── AI GPU detection (Vulkan + CUDA) ─────────────────────────────────────
  detect_vulkan_gpus && HAS_VULKAN_GPU=1 || HAS_VULKAN_GPU=0
  HAS_CUDA_GPU=0
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    HAS_CUDA_GPU=1
  fi
  echo ""

  # ── Folder selection ──────────────────────────────────────────────────────
  local folder=""
  while true; do
    printf "  %s: " "$(clr_bold "${FOLDER_PROMPT}")"
    read -r folder
    folder="${folder%/}"
    if [[ -d "${folder}" ]]; then break; fi
    printf "  %s %s: %s\n  %s\n" \
      "$(clr_red '✗')" "${FOLDER_NOT_FOUND}" "$(clr_dim "${folder}")" "$(clr_dim "${FOLDER_HINT}")"
  done
  echo ""

  # ── Scan for video formats ────────────────────────────────────────────────
  printf "  %s\n" "$(clr_dim "${SCANNING}")"

  local all_exts=(mp4 mkv avi mov wmv flv webm mpeg mpg m4v ts mts m2ts 3gp ogv jpg jpeg png webp heic heif)
  local found_formats=()
  declare -A FORMAT_COUNT

  local ext count f
  for ext in "${all_exts[@]}"; do
    count=0
    while IFS= read -r -d '' f; do
      (( count++ )) || true
    done < <(find "${folder}" -maxdepth 1 -type f -iname "*.${ext}" -print0 2>/dev/null)
    if [[ "${count}" -gt 0 ]]; then
      FORMAT_COUNT["${ext}"]="${count}"
      found_formats+=("${ext}")
    fi
  done

  if [[ "${#found_formats[@]}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_yellow '⚠')" "${NO_VIDEOS}"
    exit 0
  fi

  printf "  %s: " "$(clr_bold "${FORMATS_FOUND}")"
  for ext in "${found_formats[@]}"; do
    printf "%s(%s)  " "$(clr_cyan ".${ext}")" "$(clr_dim "${FORMAT_COUNT[$ext]}")"
  done
  printf "\n\n"

  # ── Format selection ──────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold "${SELECT_FORMATS_TITLE}:")"
  printf "  %s\n" "$(clr_dim "${CB_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${CB_HINT}")"

  _CB_LABELS=()
  _CB_SEL=()
  _CB_DISABLED=()
  for ext in "${found_formats[@]}"; do
    _CB_LABELS+=(".${ext}  (${FORMAT_COUNT[$ext]} ${FILES_LABEL})")
    _CB_SEL+=(1)
    _CB_DISABLED+=(0)
  done
  interactive_checkbox

  local selected_exts=()
  local idx
  for idx in "${SELECTED_INDICES[@]}"; do
    selected_exts+=("${found_formats[$idx]}")
  done

  if [[ "${#selected_exts[@]}" -eq 0 ]]; then
    printf "\n  %s\n\n" "$(clr_yellow "${NO_FORMATS_SELECTED}")"
    exit 0
  fi
  echo ""

  # ── Output folder ─────────────────────────────────────────────────────────
  local date_str; date_str="$(date '+%Y-%m-%d')"
  local out_dir_default="${folder}/output-${date_str}"
  printf "  %s (%s): " "$(clr_bold "${OUTPUT_FOLDER_PROMPT}")" "$(clr_dim "${out_dir_default}")"
  local out_dir_input; read -r out_dir_input
  local out_dir="${out_dir_input:-${out_dir_default}}"
  echo ""

  # ── Skip already processed files ─────────────────────────────────────────
  local SKIP_EXISTING=0
  local _skipped_count=0
  declare -A _SKIP_STEM_MAP
  if [[ -d "${out_dir}" ]]; then
    local _all_video_exts=(mp4 mkv avi mov wmv flv webm mpeg mpg m4v ts mts m2ts 3gp ogv)
    local _existing_count=0
    local _ef _ef_base _ef_stem _ev
    for _ev in "${_all_video_exts[@]}"; do
      while IFS= read -r -d '' _ef; do
        _ef_base="$(basename "${_ef}")"
        _ef_stem="${_ef_base%.*}"
        _SKIP_STEM_MAP["$(lc "${_ef_stem}")"]=1
        (( _existing_count++ )) || true
      done < <(find "${out_dir}" -maxdepth 1 -type f -iname "*.${_ev}" -print0 2>/dev/null)
    done
    if [[ "${_existing_count}" -gt 0 ]]; then
      printf "  %s %d %s\n" "$(clr_yellow '⚠')" "${_existing_count}" "${SKIP_EXISTING_FOUND}"
      printf "  %s [y/n] (y): " "$(clr_bold "${SKIP_EXISTING_PROMPT}")"
      local _skip_ans; read -r _skip_ans; _skip_ans="${_skip_ans:-y}"
      [[ "${CONFIRM_YES_CHARS}" == *"${_skip_ans:0:1}"* ]] && SKIP_EXISTING=1
      echo ""
    fi
  fi

  # ── Action selection ──────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold "${SELECT_ACTIONS_TITLE}:")"
  printf "  %s\n" "$(clr_dim "${CB_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${CB_HINT}")"

  _CB_LABELS=(
    "${ACTION_BLACK_BARS}"
    "${ACTION_FPS}"
    "${ACTION_STAB}"
    "${ACTION_DENOISE}"
    "${ACTION_SHARPEN}"
    "${ACTION_UPSCALE}"
    "${ACTION_DOWNSIZE}"
    "${ACTION_COLOR}"
    "${ACTION_COMPRESS}"
    "${ACTION_RIFE}"
    "${ACTION_VIDEO2X}"
    "${ACTION_DEEP3D}"
    "${ACTION_MPG_TO_MP4}"
    "${ACTION_TIKTOK}"
  )
  _CB_SEL=(0 0 0 0 0 0 0 0 0 0 0 0 0 0)
  local _dis_vulkan=0 _dis_cuda=0
  [[ "${HAS_VULKAN_GPU}" -eq 0 ]] && _dis_vulkan=1
  [[ "${HAS_CUDA_GPU}" -eq 0 ]]   && _dis_cuda=1
  _CB_DISABLED=(0 0 0 0 0 0 0 0 0 "${_dis_vulkan}" "${_dis_vulkan}" "${_dis_cuda}" 0 0)
  interactive_checkbox

  local do_black_bars=0 do_fps=0 do_stab=0
  DO_DENOISE=0; DO_SHARPEN=0; DO_UPSCALE=0; DO_DOWNSIZE=0; DO_COLOR=0; DO_COMPRESS=0
  DO_RIFE=0; DO_VIDEO2X=0; DO_DEEP3D=0; DO_MPG_TO_MP4=0; DO_TIKTOK=0

  for idx in "${SELECTED_INDICES[@]}"; do
    case "${idx}" in
      0) do_black_bars=1 ;;
      1) do_fps=1 ;;
      2) do_stab=1 ;;
      3) DO_DENOISE=1 ;;
      4) DO_SHARPEN=1 ;;
      5) DO_UPSCALE=1 ;;
      6) DO_DOWNSIZE=1 ;;
      7) DO_COLOR=1 ;;
      8) DO_COMPRESS=1 ;;
      9) DO_RIFE=1 ;;
      10) DO_VIDEO2X=1 ;;
      11) DO_DEEP3D=1 ;;
      12) DO_MPG_TO_MP4=1 ;;
      13) DO_TIKTOK=1 ;;
    esac
  done

  if [[ "${do_black_bars}" -eq 0 && "${do_fps}" -eq 0 && \
        "${do_stab}" -eq 0 && "${DO_DENOISE}" -eq 0 && "${DO_SHARPEN}" -eq 0 && \
        "${DO_UPSCALE}" -eq 0 && "${DO_DOWNSIZE}" -eq 0 && "${DO_COLOR}" -eq 0 && \
        "${DO_COMPRESS}" -eq 0 && \
        "${DO_RIFE}" -eq 0 && "${DO_VIDEO2X}" -eq 0 && "${DO_DEEP3D}" -eq 0 && \
        "${DO_MPG_TO_MP4}" -eq 0 && "${DO_TIKTOK}" -eq 0 ]]; then
    printf "\n  %s\n\n" "$(clr_yellow "${NO_ACTIONS_SELECTED}")"
    exit 0
  fi
  echo ""

  # ── Codec selection ───────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold "${CODEC_SELECT_LABEL}:")"
  printf "  %s\n\n" "$(clr_dim "↑↓ ${CB_PROMPT##*↑↓ }")"
  _CB_LABELS=("${CODEC_H264_OPTION}" "${CODEC_H265_OPTION}")
  _CB_SEL=(1 0)
  _CB_DISABLED=(0 0)
  interactive_radio

  if [[ "${SELECTED_INDICES[0]:-0}" -eq 1 ]]; then
    USE_H265=1
    if [[ "${GPU_ENCODER}" == "h264_nvenc" ]]; then
      if _has_encoder "${FFMPEG_BIN}" 'hevc_nvenc'; then
        GPU_ENCODER="hevc_nvenc"
        GPU_LABEL="${GPU_LABEL/h264_nvenc/hevc_nvenc}"
      else
        printf "  %s  %s\n\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${CODEC_H265_NO_GPU}")"
        use_gpu=0; GPU_ENCODER=""; GPU_LABEL=""
      fi
    elif [[ "${GPU_ENCODER}" == "h264_vaapi" ]]; then
      if _has_encoder "${FFMPEG_BIN}" 'hevc_vaapi'; then
        GPU_ENCODER="hevc_vaapi"
        GPU_LABEL="${GPU_LABEL/h264_vaapi/hevc_vaapi}"
      else
        printf "  %s  %s\n\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${CODEC_H265_NO_GPU}")"
        use_gpu=0; GPU_ENCODER=""; GPU_LABEL=""
      fi
    fi
    if [[ "${use_gpu}" -eq 0 ]] && ! _has_encoder "${FFMPEG_BIN}" 'libx265'; then
      printf "  %s  %s\n\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${CODEC_H265_NO_ENC}")"
      USE_H265=0
    fi
  fi
  echo ""

  # ── RIFE check / bootstrap ────────────────────────────────────────────────
  if [[ "${DO_RIFE}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_dim "${RIFE_CHECK}")"
    check_rife
    if [[ "${RIFE_BIN}" != "rife-ncnn-vulkan" || "$(command -v rife-ncnn-vulkan 2>/dev/null)" ]]; then
      find_rife_model
      printf "  %s %s: %s (model: %s)\n" \
        "$(clr_bold_green '✓')" "${RIFE_FOUND}" "$(clr_dim "${RIFE_BIN}")" "$(clr_cyan "${RIFE_MODEL}")"
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${RIFE_NOT_FOUND}"
      echo ""
      printf "  %s [y/n] (y): " "$(clr_bold "Download rife-ncnn-vulkan automatically?")"
      local rife_dl_ans; read -r rife_dl_ans; rife_dl_ans="${rife_dl_ans:-y}"
      echo ""
      if [[ "$(lc "${rife_dl_ans}")" == y* ]]; then
        if ! bootstrap_rife || ! find_rife_model; then
          printf "  %s RIFE disabled - skipping interpolation.\n\n" "$(clr_yellow '⚠')"
          DO_RIFE=0
        fi
      else
        printf "  %s RIFE disabled - continuing without AI interpolation.\n\n" "$(clr_yellow '⚠')"
        DO_RIFE=0
      fi
    fi
    if [[ "${DO_RIFE}" -eq 1 ]]; then
      detect_vulkan_gpus
      if [[ -n "${VULKAN_GPU_LABEL}" ]]; then
        printf "  %s %s: %s\n\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_HINT}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
      else
        printf "  %s %s\n\n" "$(clr_dim '○')" "$(clr_dim "${AI_GPU_NONE}")"
      fi
    fi
  fi

  # ── Video2X check / bootstrap ─────────────────────────────────────────────
  if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_dim "${VIDEO2X_CHECK}")"
    check_video2x
    if [[ "${VIDEO2X_BIN}" != "realesrgan-ncnn-vulkan" || "$(command -v realesrgan-ncnn-vulkan 2>/dev/null)" ]]; then
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${VIDEO2X_FOUND}" "$(clr_dim "${VIDEO2X_BIN}")"
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${VIDEO2X_NOT_FOUND}"
      echo ""
      printf "  %s [y/n] (y): " "$(clr_bold "Download Real-ESRGAN automatically?")"
      local v2x_dl_ans; read -r v2x_dl_ans; v2x_dl_ans="${v2x_dl_ans:-y}"
      echo ""
      if [[ "$(lc "${v2x_dl_ans}")" == y* ]]; then
        if ! bootstrap_video2x; then
          printf "  %s video2x disabled - skipping AI upscale.\n\n" "$(clr_yellow '⚠')"
          DO_VIDEO2X=0
        fi
      else
        printf "  %s video2x disabled - continuing without AI upscale.\n\n" "$(clr_yellow '⚠')"
        DO_VIDEO2X=0
      fi
    fi
    if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
      detect_vulkan_gpus
      if [[ -n "${VULKAN_GPU_LABEL}" ]]; then
        printf "  %s %s: %s\n\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_HINT}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
      else
        printf "  %s %s\n\n" "$(clr_dim '○')" "$(clr_dim "${AI_GPU_NONE}")"
      fi
    fi
  fi

  # ── Deep3D check / bootstrap ──────────────────────────────────────────────
  if [[ "${DO_DEEP3D}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_dim "${DEEP3D_CHECK}")"
    if check_deep3d; then
      printf "  %s %s: %s\n\n" "$(clr_bold_green '✓')" "${DEEP3D_FOUND}" "$(clr_dim "${DEEP3D_DIR}")"
      local _ev_script_dir; _ev_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
      if [[ -f "${_ev_script_dir}/deep3d_flow_cv.py" ]]; then
        cp "${_ev_script_dir}/deep3d_flow_cv.py" "${DEEP3D_DIR}/deep3d_flow_cv.py"
      fi
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${DEEP3D_NOT_FOUND}"
      echo ""
      printf "  %s [y/n] (y): " "$(clr_bold "Install Deep3D automatically?")"
      local d3d_dl_ans; read -r d3d_dl_ans; d3d_dl_ans="${d3d_dl_ans:-y}"
      echo ""
      if [[ "$(lc "${d3d_dl_ans}")" == y* ]]; then
        if ! bootstrap_deep3d; then
          printf "  %s Deep3D disabled - skipping AI stabilization.\n\n" "$(clr_yellow '⚠')"
          DO_DEEP3D=0
        fi
      else
        printf "  %s Deep3D disabled - continuing without AI stabilization.\n\n" "$(clr_yellow '⚠')"
        DO_DEEP3D=0
      fi
    fi
  fi

  # ── Action parameters ─────────────────────────────────────────────────────
  local fps_multiplier=2
  local stab_shakiness=7 stab_accuracy=15 stab_smoothing=30
  local stab_mode="vidstab"
  local stab_maxangle=0.15 stab_maxshift=60

  if [[ "${do_fps}" -eq 1 ]]; then
    printf "  %s (2): " "$(clr_bold "${TARGET_FPS_PROMPT}")"
    local _fps_mult_raw; read -r _fps_mult_raw; _fps_mult_raw="${_fps_mult_raw:-2}"
    case "${_fps_mult_raw}" in
      4) fps_multiplier=4 ;;
      8) fps_multiplier=8 ;;
      *) fps_multiplier=2 ;;
    esac
    echo ""
  fi

  if [[ "${do_stab}" -eq 1 ]]; then
    if check_vidstab; then
      stab_mode="vidstab"
      printf "  %s\n" "$(clr_bold "${STAB_MODE_LABEL}:")"
      printf "    1) %s\n" "${STAB_MODE_STANDARD}"
      printf "    2) %s\n" "${STAB_MODE_CONCERT}"
      printf "  %s (1): " "$(clr_dim "Choice")"
      local stab_preset_choice; read -r stab_preset_choice; stab_preset_choice="${stab_preset_choice:-1}"
      if [[ "${stab_preset_choice}" == "2" ]]; then
        stab_shakiness=5; stab_accuracy=15; stab_smoothing=50
        stab_maxangle=0.05; stab_maxshift=30
        printf "  %s %s\n" "$(clr_cyan '→')" "$(clr_dim "${STAB_CONCERT_INFO}")"
      else
        _read_int stab_shakiness "$(clr_dim "${SHAKINESS_LABEL}")" 7 1 10
        _read_int stab_accuracy  "$(clr_dim "${ACCURACY_LABEL}")"  15 1 15
        _read_int stab_smoothing "$(clr_dim "${SMOOTHING_LABEL}")" 30 0 100
        stab_maxangle=0.15; stab_maxshift=60
      fi
    elif check_deshake; then
      stab_mode="deshake"
      printf "  %s %s\n" "$(clr_yellow '⚠')" "${VIDSTAB_FALLBACK_DESHAKE}"
      _read_int stab_smoothing "$(clr_dim "${SMOOTHING_LABEL}")" 30 0 100
    else
      printf "  %s %s\n\n" "$(clr_yellow '⚠')" "${DESHAKE_NOT_FOUND}"
      do_stab=0
    fi
  fi

  if [[ "${DO_DENOISE}" -eq 1 ]]; then
    _read_int DENOISE_LUMA_S   "$(clr_dim "${DENOISE_LUMA_S_LABEL}")"   4 0 10
    _read_int DENOISE_CHROMA_S "$(clr_dim "${DENOISE_CHROMA_S_LABEL}")" 4 0 10
    _read_int DENOISE_LUMA_T   "$(clr_dim "${DENOISE_LUMA_T_LABEL}")"   3 0 10
    _read_int DENOISE_CHROMA_T "$(clr_dim "${DENOISE_CHROMA_T_LABEL}")" 3 0 10
  fi

  if [[ "${DO_SHARPEN}" -eq 1 ]]; then
    while true; do
      printf "  %s (5): " "$(clr_dim "${SHARPEN_MATRIX_LABEL}")"
      read -r SHARPEN_MATRIX; SHARPEN_MATRIX="${SHARPEN_MATRIX:-5}"
      if [[ "${SHARPEN_MATRIX}" =~ ^[0-9]+$ ]] && \
         [[ "${SHARPEN_MATRIX}" -ge 3 ]] && [[ "${SHARPEN_MATRIX}" -le 23 ]] && \
         [[ $(( SHARPEN_MATRIX % 2 )) -eq 1 ]]; then
        break
      fi
      printf "  %s  Enter an odd integer between 3 and 23.\n" "$(clr_bold_red '✗')"
    done
    _read_float SHARPEN_LUMA_AMOUNT   "$(clr_dim "${SHARPEN_LUMA_AMOUNT_LABEL}")"   1.0 -2.0 5.0
    _read_float SHARPEN_CHROMA_AMOUNT "$(clr_dim "${SHARPEN_CHROMA_AMOUNT_LABEL}")" 0.0 -2.0 5.0
  fi

  if [[ "${DO_UPSCALE}" -eq 1 ]]; then
    printf "  %s (1080): " "$(clr_bold "${UPSCALE_TARGET_LABEL}")"
    local upscale_input; read -r upscale_input
    if [[ "${upscale_input}" =~ ^([0-9]+)[xX]([0-9]+)$ ]]; then
      UPSCALE_TARGET_W="${BASH_REMATCH[1]}"; UPSCALE_TARGET_H="${BASH_REMATCH[2]}"
    else
      case "${upscale_input:-1080}" in
        720)             UPSCALE_TARGET_W=1280;  UPSCALE_TARGET_H=720  ;;
        1080)            UPSCALE_TARGET_W=1920;  UPSCALE_TARGET_H=1080 ;;
        1440)            UPSCALE_TARGET_W=2560;  UPSCALE_TARGET_H=1440 ;;
        2160|4k|4K|4K*) UPSCALE_TARGET_W=3840;  UPSCALE_TARGET_H=2160 ;;
        *)               UPSCALE_TARGET_W=1920;  UPSCALE_TARGET_H=1080 ;;
      esac
    fi
  fi

  if [[ "${DO_DOWNSIZE}" -eq 1 ]]; then
    printf "  %s (1080): " "$(clr_bold "${DOWNSIZE_TARGET_LABEL}")"
    local downsize_input; read -r downsize_input
    if [[ "${downsize_input}" =~ ^([0-9]+)[xX]([0-9]+)$ ]]; then
      DOWNSIZE_TARGET_W="${BASH_REMATCH[1]}"; DOWNSIZE_TARGET_H="${BASH_REMATCH[2]}"
    else
      case "${downsize_input:-1080}" in
        480)             DOWNSIZE_TARGET_W=854;   DOWNSIZE_TARGET_H=480  ;;
        720)             DOWNSIZE_TARGET_W=1280;  DOWNSIZE_TARGET_H=720  ;;
        1080)            DOWNSIZE_TARGET_W=1920;  DOWNSIZE_TARGET_H=1080 ;;
        1440)            DOWNSIZE_TARGET_W=2560;  DOWNSIZE_TARGET_H=1440 ;;
        2160|4k|4K|4K*) DOWNSIZE_TARGET_W=3840;  DOWNSIZE_TARGET_H=2160 ;;
        *)               DOWNSIZE_TARGET_W=1920;  DOWNSIZE_TARGET_H=1080 ;;
      esac
    fi
  fi

  if [[ "${DO_COLOR}" -eq 1 ]]; then
    _read_float COLOR_CONTRAST   "$(clr_dim "${COLOR_CONTRAST_LABEL}")"   1.1 0.0 2.0
    _read_float COLOR_BRIGHTNESS "$(clr_dim "${COLOR_BRIGHTNESS_LABEL}")" 0.0 -1.0 1.0
    _read_float COLOR_SATURATION "$(clr_dim "${COLOR_SATURATION_LABEL}")" 1.1 0.0 2.0
    _read_float COLOR_GAMMA      "$(clr_dim "${COLOR_GAMMA_LABEL}")"      1.0 0.1 10.0
  fi

  if [[ "${DO_COMPRESS}" -eq 1 ]]; then
    _read_int COMPRESS_PERCENT "$(clr_bold "${COMPRESS_PERCENT_LABEL}")" 50 1 100
    echo ""
  fi

  if [[ "${DO_RIFE}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_yellow "⚠  ${RIFE_DISK_WARN}")"
    printf "  %s (2): " "$(clr_bold "${RIFE_MULTIPLIER_PROMPT}")"
    local rife_mult_input; read -r rife_mult_input
    case "${rife_mult_input:-2}" in
      4) RIFE_MULTIPLIER=4 ;;
      8) RIFE_MULTIPLIER=8 ;;
      *) RIFE_MULTIPLIER=2 ;;
    esac
  fi

  if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_yellow "⚠  ${VIDEO2X_DISK_WARN}")"
    printf "  %s (2): " "$(clr_bold "${VIDEO2X_SCALE_PROMPT}")"
    local v2x_scale_input; read -r v2x_scale_input
    case "${v2x_scale_input:-2}" in
      4) VIDEO2X_SCALE=4 ;;
      *) VIDEO2X_SCALE=2 ;;
    esac
    printf "  %s (realesr-animevideov3): " "$(clr_bold "${VIDEO2X_MODEL_PROMPT}")"
    local v2x_model_input; read -r v2x_model_input
    case "${v2x_model_input:-realesr-animevideov3}" in
      realesrgan-x4plus|x4plus)     VIDEO2X_MODEL="realesrgan-x4plus" ;;
      realesr-general-x4v3|general) VIDEO2X_MODEL="realesr-general-x4v3" ;;
      *)                            VIDEO2X_MODEL="realesr-animevideov3" ;;
    esac
  fi

  if [[ "${DO_DEEP3D}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_yellow "⚠  ${DEEP3D_DISK_WARN}")"
    local _d3d_cuda_name=""
    if "${DEEP3D_PYTHON}" -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
      _d3d_cuda_name="$("${DEEP3D_PYTHON}" -c \
        "import torch; print(torch.cuda.get_device_name(0))" 2>/dev/null || echo "CUDA GPU")"
    else
      _d3d_cuda_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
        | head -1 | xargs 2>/dev/null || echo "CUDA GPU")"
    fi
    DEEP3D_DEVICE="cuda:0"
    DEEP3D_GPU_NAME="${_d3d_cuda_name}"
    printf "  %s %s: %s\n\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_HINT}" "$(clr_magenta "${_d3d_cuda_name}")"
    _read_int DEEP3D_STABILITY "$(clr_bold "${DEEP3D_STABILITY_LABEL}")" 12 1 50
  fi

  # ── Ollama / TikTok check ─────────────────────────────────────────────────
  if [[ "${DO_TIKTOK}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_yellow "⚠  ${TIKTOK_DISK_WARN}")"
    printf "  %s\n\n" "$(clr_dim "${TIKTOK_NOTE}")"

    printf "  %s\n" "$(clr_dim "${TIKTOK_OLLAMA_CHECK}")"
    if check_ollama; then
      printf "  %s %s\n" "$(clr_bold_green '✓')" "${TIKTOK_OLLAMA_FOUND}"
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${TIKTOK_OLLAMA_NOT_FOUND}"
      printf "  %s\n\n" "$(clr_dim "Make sure Ollama is running: ollama serve")"
      printf "  %s [y/n] (n): " "$(clr_bold "Continue anyway?")"
      local ollama_cont; read -r ollama_cont; ollama_cont="${ollama_cont:-n}"
      if [[ "${CONFIRM_YES_CHARS}" != *"${ollama_cont:0:1}"* ]]; then
        printf "  %s\n\n" "${CANCELLED}"; exit 0
      fi
    fi

    # Prompt for model name (default gemma3:4b)
    printf "  %s (%s): " "$(clr_bold "${TIKTOK_MODEL_PROMPT}")" "$(clr_dim "${TIKTOK_OLLAMA_MODEL}")"
    local tiktok_model_input; read -r tiktok_model_input
    [[ -n "${tiktok_model_input}" ]] && TIKTOK_OLLAMA_MODEL="${tiktok_model_input}"

    # Check if the chosen model is available; offer to pull it
    if ! check_ollama_model "${TIKTOK_OLLAMA_MODEL}"; then
      printf "  %s %s: %s\n" "$(clr_bold_yellow '⚠')" \
        "${TIKTOK_OLLAMA_MODEL_NOT_FOUND}" "$(clr_dim "${TIKTOK_OLLAMA_MODEL}")"
      printf "  %s [y/n] (y): " "$(clr_bold "${TIKTOK_OLLAMA_PULL_PROMPT}")"
      local pull_ans; read -r pull_ans; pull_ans="${pull_ans:-y}"
      if [[ "${CONFIRM_YES_CHARS}" == *"${pull_ans:0:1}"* ]]; then
        if ! pull_ollama_model "${TIKTOK_OLLAMA_MODEL}"; then
          printf "  %s %s: ollama pull %s\n\n" \
            "$(clr_bold_yellow '⚠')" "${TIKTOK_OLLAMA_PULL_FAIL}" "${TIKTOK_OLLAMA_MODEL}"
          printf "  Continue without model pull? [y/n] (n): "
          local skip_pull_ans; read -r skip_pull_ans; skip_pull_ans="${skip_pull_ans:-n}"
          if [[ "${CONFIRM_YES_CHARS}" != *"${skip_pull_ans:0:1}"* ]]; then
            printf "  %s\n\n" "${CANCELLED}"; exit 0
          fi
        else
          printf "  %s %s\n" "$(clr_bold_green '✓')" "$(clr_dim "Model pulled successfully")"
        fi
      fi
    else
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${TIKTOK_OLLAMA_FOUND}" \
        "$(clr_dim "${TIKTOK_OLLAMA_MODEL}")"
    fi
    echo ""

    # TikTok parameters
    _read_int TIKTOK_MIN_SCORE      "$(clr_dim "${TIKTOK_MIN_SCORE_PROMPT}")"      7 1 10
    _read_int TIKTOK_CLIP_MIN        "$(clr_dim "${TIKTOK_CLIP_MIN_PROMPT}")"        3 1 10
    _read_int TIKTOK_CLIP_MAX        "$(clr_dim "${TIKTOK_CLIP_MAX_PROMPT}")"        7 1 30
    _read_int TIKTOK_FRAME_INTERVAL  "$(clr_dim "${TIKTOK_FRAME_INTERVAL_PROMPT}")"  5 1 30

    printf "  %s\n  %s: " \
      "$(clr_dim 'Audio mixing - press Enter to skip music overlay')" \
      "$(clr_bold "${TIKTOK_MUSIC_PROMPT}")"
    local music_input; read -r music_input
    if [[ -n "${music_input}" && -f "${music_input}" ]]; then
      TIKTOK_MUSIC_FILE="${music_input}"
      _read_float TIKTOK_ORIG_AUDIO_VOLUME  "$(clr_dim "${TIKTOK_ORIG_VOL_PROMPT}")"  0.7 0.0 1.0
      _read_float TIKTOK_MUSIC_VOLUME       "$(clr_dim "${TIKTOK_MUSIC_VOL_PROMPT}")" 0.3 0.0 1.0
    elif [[ -n "${music_input}" ]]; then
      printf "  %s Music file not found - audio overlay disabled.\n\n" "$(clr_yellow '⚠')"
    fi
  fi
  echo ""

  # ── Collect files ─────────────────────────────────────────────────────────
  local video_files=()
  local _f_base _f_stem
  for ext in "${selected_exts[@]}"; do
    while IFS= read -r -d '' f; do
      if [[ "${SKIP_EXISTING}" -eq 1 ]]; then
        _f_base="$(basename "${f}")"
        _f_stem="${_f_base%.*}"
        if [[ -n "${_SKIP_STEM_MAP["$(lc "${_f_stem}")"]:-}" ]]; then
          (( _skipped_count++ )) || true
          continue
        fi
      fi
      video_files+=("$f")
    done < <(find "${folder}" -maxdepth 1 -type f -iname "*.${ext}" -print0 2>/dev/null | sort -z)
  done

  local total="${#video_files[@]}"

  # ── Pre-flight summary ────────────────────────────────────────────────────
  local divider; divider="$(printf '─%.0s' {1..60})"
  echo "  ${divider}"
  printf "  %s  %d %s\n" "$(clr_bold_cyan '▶')" "${total}" "$(clr_bold "${FILES_LABEL} selected")"
  [[ "${_skipped_count}" -gt 0 ]] && \
    printf "  %s  %d %s\n" "$(clr_dim '○')" "${_skipped_count}" "$(clr_dim "${SKIP_EXISTING_SKIPPED}")"
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_dim "${out_dir}")"

  printf "  %s: " "$(clr_bold "${ACTIONS_LABEL}")"
  local action_list=()
  [[ "${do_black_bars}" -eq 1 ]] && action_list+=("black bars")
  [[ "${do_fps}" -eq 1 ]]        && action_list+=("minterpolate ${fps_multiplier}×")
  [[ "${do_stab}" -eq 1 ]]       && action_list+=("stabilize (sh=${stab_shakiness} ac=${stab_accuracy} sm=${stab_smoothing})")
  [[ "${DO_DENOISE}" -eq 1 ]]    && action_list+=("denoise (ls=${DENOISE_LUMA_S} cs=${DENOISE_CHROMA_S})")
  [[ "${DO_SHARPEN}" -eq 1 ]]    && action_list+=("sharpen (m=${SHARPEN_MATRIX} la=${SHARPEN_LUMA_AMOUNT})")
  [[ "${DO_UPSCALE}" -eq 1 ]]    && action_list+=("upscale→${UPSCALE_TARGET_W}x${UPSCALE_TARGET_H}")
  [[ "${DO_DOWNSIZE}" -eq 1 ]]   && action_list+=("downsize→${DOWNSIZE_TARGET_W}x${DOWNSIZE_TARGET_H}")
  [[ "${DO_COLOR}" -eq 1 ]]      && action_list+=("color (c=${COLOR_CONTRAST} b=${COLOR_BRIGHTNESS})")
  [[ "${DO_COMPRESS}" -eq 1 ]]   && action_list+=("compress ${COMPRESS_PERCENT}%")
  [[ "${DO_RIFE}" -eq 1 ]]       && action_list+=("RIFE ${RIFE_MULTIPLIER}× (${RIFE_MODEL})")
  [[ "${DO_VIDEO2X}" -eq 1 ]]    && action_list+=("video2x ${VIDEO2X_SCALE}× (${VIDEO2X_MODEL})")
  [[ "${DO_DEEP3D}" -eq 1 ]]     && action_list+=("deep3d (stability=${DEEP3D_STABILITY})")
  [[ "${DO_MPG_TO_MP4}" -eq 1 ]] && action_list+=("mpg→mp4")
  [[ "${DO_TIKTOK}"    -eq 1 ]] && action_list+=("tiktok reel (model=${TIKTOK_OLLAMA_MODEL} score≥${TIKTOK_MIN_SCORE} ${TIKTOK_CLIP_MIN}-${TIKTOK_CLIP_MAX}s clips)")
  local IFS_SAVE="${IFS}"; IFS=', '; printf "%s\n" "$(clr_cyan "${action_list[*]}")"; IFS="${IFS_SAVE}"

  [[ "${use_gpu}" -eq 1 ]] && \
    printf "  %s: %s\n" "$(clr_bold_magenta 'GPU')" "$(clr_magenta "${GPU_LABEL}")"
  [[ ("${DO_RIFE}" -eq 1 || "${DO_VIDEO2X}" -eq 1) && -n "${VULKAN_GPU_LABEL:-}" ]] && \
    printf "  %s: %s\n" "$(clr_bold_magenta 'AI GPU')" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
  [[ "${DO_DEEP3D}" -eq 1 && -n "${DEEP3D_GPU_NAME:-}" ]] && \
    printf "  %s: %s\n" "$(clr_bold_magenta 'AI GPU')" "$(clr_magenta "${DEEP3D_GPU_NAME} (CUDA)")"
  printf "  %s: %s\n" "$(clr_dim "${THREADS_LABEL}")" "$(clr_dim "${THREAD_COUNT}")"
  echo "  ${divider}"
  echo ""

  printf "  %s (y): " "${CONFIRM_PROMPT}"
  local confirm; read -r confirm; confirm="${confirm:-y}"
  if [[ "${CONFIRM_YES_CHARS}" != *"${confirm:0:1}"* ]]; then
    printf "  %s\n\n" "${CANCELLED}"; exit 0
  fi
  mkdir -p "${out_dir}"

  # ── Background mode ───────────────────────────────────────────────────────
  echo ""
  printf "  %s (n): " "$(clr_bold "${BG_PROMPT}")"
  local bg_ans; read -r bg_ans; bg_ans="${bg_ans:-n}"
  echo ""

  LOG_FILE="${out_dir}/process-$(date '+%Y%m%d-%H%M%S').log"

  if [[ "${CONFIRM_YES_CHARS}" == *"${bg_ans:0:1}"* ]]; then
    BG_MODE=1
    (
      trap '' HUP
      exec < /dev/null
      _run_processing > /dev/null 2>&1
    ) &
    local bg_pid=$!
    disown "${bg_pid}"
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${BG_STARTED}"
    printf "  %s: %s\n" "$(clr_dim "${BG_PID_LABEL}")" "$(clr_dim "${bg_pid}")"
    printf "  %s: %s\n" "$(clr_dim "${BG_LOG_LABEL}")" "$(clr_cyan "${LOG_FILE}")"
    printf "\n  %s\n" "$(clr_dim "${BG_MONITOR_TIP}")"
    printf "  %s\n\n" "$(clr_cyan "tail -f ${LOG_FILE}")"
  else
    echo ""
    _run_processing
  fi
}

main "$@"
