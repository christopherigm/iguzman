#!/usr/bin/env bash
# edit-videos.sh
#
# Interactive FFmpeg batch video editor.
# Actions: Remove black bars, Interpolate FPS, Convert to H.264, Video stabilization.
#
# Run: bash cli/edit-videos/edit-videos.sh

set -euo pipefail

# ── ANSI Colors ───────────────────────────────────────────────────────────────

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
CYAN='\033[36m'
MAGENTA='\033[35m'

clr_green()        { printf "${GREEN}%s${RESET}" "$*"; }
clr_red()          { printf "${RED}%s${RESET}" "$*"; }
clr_yellow()       { printf "${YELLOW}%s${RESET}" "$*"; }
clr_cyan()         { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold()         { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()          { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()    { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()   { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow()  { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()     { printf "${BOLD}${RED}%s${RESET}" "$*"; }
clr_magenta()      { printf "${MAGENTA}%s${RESET}" "$*"; }
clr_bold_magenta() { printf "${BOLD}${MAGENTA}%s${RESET}" "$*"; }

_fmt_time() {
  local sec="$1"
  if [[ $sec -ge 3600 ]]; then
    printf "%dh%02dm%02ds" $(( sec/3600 )) $(( (sec%3600)/60 )) $(( sec%60 ))
  elif [[ $sec -ge 60 ]]; then
    printf "%dm%02ds" $(( sec/60 )) $(( sec%60 ))
  else
    printf "%ds" "${sec}"
  fi
}

# ── i18n ──────────────────────────────────────────────────────────────────────

setup_strings() {
  local lang="$1"

  if [[ "${lang}" == "es" ]]; then
    WELCOME="Editor de Videos con FFmpeg"
    SUBTITLE="Procesamiento en lote de videos con filtros FFmpeg."
    FFMPEG_CHECK="Verificando FFmpeg..."
    FFMPEG_FOUND="FFmpeg encontrado"
    FFMPEG_NOT_FOUND="FFmpeg no encontrado. Instálalo en: https://ffmpeg.org/download.html"
    FFMPEG_OLD_VERSION="Versión de FFmpeg desactualizada detectada"
    FFMPEG_MIN_VERSION="Se recomienda FFmpeg 7 o superior para mejores resultados (última versión estable: 8.1)."
    FFMPEG_UPGRADE_TITLE="Cómo actualizar FFmpeg en Linux (opcional):"
    GPU_DETECT="Detectando aceleración GPU..."
    GPU_FOUND_MSG="GPU con aceleración detectada"
    GPU_NONE="Sin GPU con aceleración detectada — se usará la CPU."
    GPU_USE_PROMPT="¿Usar GPU para codificación H.264? [s/n]"
    FOLDER_PROMPT="Ruta de la carpeta de videos"
    FOLDER_NOT_FOUND="Carpeta no encontrada"
    FOLDER_HINT="Ingresa la ruta absoluta, ej: /home/usuario/Videos"
    SCANNING="Escaneando videos..."
    NO_VIDEOS="No se encontraron archivos de video en la carpeta seleccionada."
    FORMATS_FOUND="Formatos encontrados"
    SELECT_FORMATS_TITLE="Selecciona los formatos a procesar"
    SELECT_ACTIONS_TITLE="Selecciona las acciones a aplicar"
    ACTION_BLACK_BARS="Eliminar franjas negras (cropdetect)"
    ACTION_FPS="Interpolar FPS (minterpolate)"
    ACTION_H264="Convertir a H.264 (libx264)"
    ACTION_STAB="Estabilizar video (vid.stab, dos pases)"
    TARGET_FPS_PROMPT="FPS objetivo [60/90/120 o valor personalizado]"
    SHAKINESS_LABEL="Intensidad de vibración a detectar [1-10]"
    ACCURACY_LABEL="Precisión del análisis [1-15]"
    SMOOTHING_LABEL="Suavizado de la estabilización [0-100]"
    CONFIRM_PROMPT="¿Confirmar y comenzar el procesamiento? [s/n]"
    PROCESSING_TITLE="Procesando videos"
    STEP_CROPDETECT="Detectando franjas negras"
    STEP_VIDSTABDETECT="Analizando movimiento (pase 1/2)"
    STEP_ENCODE="Codificando"
    STEP_COPY="Copiando al destino"
    STEP_DONE="listo"
    STEP_FAIL="FALLÓ"
    NO_BLACK_BARS="Sin franjas negras, se omite el recorte"
    VIDSTAB_NOT_FOUND="vid.stab no disponible en este FFmpeg. Se omite la estabilización."
    VIDSTAB_FALLBACK_DESHAKE="vid.stab no disponible — usando filtro deshake para estabilización básica."
    DESHAKE_NOT_FOUND="Ni vid.stab ni deshake están disponibles. Se omite la estabilización."
    OUTPUT_FOLDER="Carpeta de salida"
    SUMMARY_OK="Procesados correctamente"
    SUMMARY_FAIL="Con errores"
    ALL_DONE="¡Procesamiento completado!"
    CONFIRM_YES_CHARS="sy"
    CB_PROMPT="Usa ↑↓ para navegar · Espacio para seleccionar · Enter para confirmar"
    CB_HINT="(a = todos  ·  n = ninguno)"
    NO_FORMATS_SELECTED="Ningún formato seleccionado. Saliendo."
    NO_ACTIONS_SELECTED="Ninguna acción seleccionada. Saliendo."
    ACTIONS_LABEL="Acciones"
    FILES_LABEL="archivos"
    THREADS_LABEL="hilos CPU"
    CANCELLED="Cancelado."
    HDR_DETECT="Detectando perfil HDR/color..."
    HDR_FOUND_HDR10="Fuente HDR10 detectada — aplicando mapeo de tono a SDR BT.709"
    HDR_FOUND_HLG="Fuente HLG detectada — aplicando mapeo de tono a SDR BT.709"
    HDR_FOUND_DV="Fuente Dolby Vision detectada — usando mapeo de tono HDR10 como respaldo"
    HDR_FOUND_10BIT="Fuente SDR de 10 bits detectada — convirtiendo a 8 bits BT.709"
    ZSCALE_NOT_FOUND="Filtro zscale no disponible — se omite la conversión HDR (instala libzimg para mejores resultados)"
    STEP_PREPROCESS="Pre-convirtiendo a intermedio H.264 SDR"
  else
    WELCOME="FFmpeg Video Editor"
    SUBTITLE="Batch-process videos with FFmpeg filters."
    FFMPEG_CHECK="Checking FFmpeg..."
    FFMPEG_FOUND="FFmpeg found"
    FFMPEG_NOT_FOUND="FFmpeg not found. Install it at: https://ffmpeg.org/download.html"
    FFMPEG_OLD_VERSION="Outdated FFmpeg version detected"
    FFMPEG_MIN_VERSION="FFmpeg 7 or newer is recommended for best results (latest stable: 8.1)."
    FFMPEG_UPGRADE_TITLE="How to upgrade FFmpeg on Linux (optional):"
    GPU_DETECT="Detecting GPU acceleration..."
    GPU_FOUND_MSG="Hardware-accelerated GPU detected"
    GPU_NONE="No hardware-accelerated GPU detected — CPU will be used."
    GPU_USE_PROMPT="Use GPU acceleration for H.264 encoding? [y/n]"
    FOLDER_PROMPT="Videos folder path"
    FOLDER_NOT_FOUND="Folder not found"
    FOLDER_HINT="Enter an absolute path, e.g. /home/user/Videos"
    SCANNING="Scanning for videos..."
    NO_VIDEOS="No video files found in the selected folder."
    FORMATS_FOUND="Formats found"
    SELECT_FORMATS_TITLE="Select formats to process"
    SELECT_ACTIONS_TITLE="Select actions to apply"
    ACTION_BLACK_BARS="Remove black bars (cropdetect)"
    ACTION_FPS="Interpolate FPS (minterpolate)"
    ACTION_H264="Convert to H.264 (libx264)"
    ACTION_STAB="Video stabilization (vid.stab, two-pass)"
    TARGET_FPS_PROMPT="Target FPS [60/90/120 or custom value]"
    SHAKINESS_LABEL="Shakiness level to detect [1-10]"
    ACCURACY_LABEL="Analysis accuracy [1-15]"
    SMOOTHING_LABEL="Stabilization smoothing [0-100]"
    CONFIRM_PROMPT="Confirm and start processing? [y/n]"
    PROCESSING_TITLE="Processing videos"
    STEP_CROPDETECT="Detecting black bars"
    STEP_VIDSTABDETECT="Analyzing motion (pass 1/2)"
    STEP_ENCODE="Encoding"
    STEP_COPY="Copying to output"
    STEP_DONE="done"
    STEP_FAIL="FAILED"
    NO_BLACK_BARS="No black bars detected, skipping crop"
    VIDSTAB_NOT_FOUND="vid.stab not available in this FFmpeg build. Skipping stabilization."
    VIDSTAB_FALLBACK_DESHAKE="vid.stab not available — falling back to deshake filter for basic stabilization."
    DESHAKE_NOT_FOUND="Neither vid.stab nor deshake are available. Skipping stabilization."
    OUTPUT_FOLDER="Output folder"
    SUMMARY_OK="Successfully processed"
    SUMMARY_FAIL="Failed"
    ALL_DONE="Processing complete!"
    CONFIRM_YES_CHARS="y"
    CB_PROMPT="Use ↑↓ to navigate · Space to toggle · Enter to confirm"
    CB_HINT="(a = all  ·  n = none)"
    NO_FORMATS_SELECTED="No formats selected. Exiting."
    NO_ACTIONS_SELECTED="No actions selected. Exiting."
    ACTIONS_LABEL="Actions"
    FILES_LABEL="files"
    THREADS_LABEL="CPU threads"
    CANCELLED="Cancelled."
    HDR_DETECT="Detecting HDR/color profile..."
    HDR_FOUND_HDR10="HDR10 source detected — applying tone-mapping to SDR BT.709"
    HDR_FOUND_HLG="HLG source detected — applying tone-mapping to SDR BT.709"
    HDR_FOUND_DV="Dolby Vision source detected — applying HDR10 tone-mapping fallback"
    HDR_FOUND_10BIT="10-bit SDR source detected — converting to 8-bit BT.709"
    ZSCALE_NOT_FOUND="zscale filter not available — skipping HDR color conversion (install libzimg for best results)"
    STEP_PREPROCESS="Pre-converting to H.264 SDR intermediate"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────

print_header() {
  local line
  line="$(printf '─%.0s' {1..54})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-52s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE:0:52}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

# ── Interactive checkbox ──────────────────────────────────────────────────────
# Globals: set _CB_LABELS and _CB_SEL before calling.
# Result: SELECTED_INDICES array with indices of selected items.

_CB_LABELS=()
_CB_SEL=()
_CB_CURSOR=0
SELECTED_INDICES=()

_cb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local checkbox pointer label_str

    if [[ "${is_sel}" -eq 1 ]]; then
      checkbox="$(clr_bold_cyan '[✓]')"
    else
      checkbox="$(clr_dim '[ ]')"
    fi

    if [[ $j -eq $_CB_CURSOR ]]; then
      pointer="$(clr_cyan '▶')"
      label_str="$(clr_bold_cyan "${lbl}")"
    else
      pointer=" "
      label_str="${lbl}"
    fi

    printf "  %s %s %s\n" "${pointer}" "${checkbox}" "${label_str}"
  done
}

interactive_checkbox() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0

  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 0 ]]; then
      _CB_CURSOR=$i
      break
    fi
  done

  _cb_render
  printf '\033[?25l'

  while true; do
    local key esc
    IFS= read -r -s -n1 key 2>/dev/null || key=""

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n1 -t 0.05 esc 2>/dev/null || esc=""
      if [[ "${esc}" == '[' ]]; then
        IFS= read -r -s -n1 -t 0.05 key 2>/dev/null || key=""
        if [[ "${key}" == 'A' ]]; then
          _CB_CURSOR=$(( (_CB_CURSOR - 1 + num) % num ))
          printf "\033[%dA" "${num}"; _cb_render
        elif [[ "${key}" == 'B' ]]; then
          _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
          printf "\033[%dA" "${num}"; _cb_render
        fi
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      _CB_SEL[$_CB_CURSOR]=$(( 1 - _CB_SEL[$_CB_CURSOR] ))
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=1; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=0; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    [[ "${_CB_SEL[$i]}" -eq 1 ]] && SELECTED_INDICES+=("$i")
  done
}

# ── GPU Detection ─────────────────────────────────────────────────────────────

GPU_ENCODER=""
GPU_LABEL=""

detect_gpu() {
  printf "  %s\n" "$(clr_dim "${GPU_DETECT}")"

  # NVIDIA NVENC — check nvidia-smi then verify ffmpeg has h264_nvenc
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    local gpu_name
    gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | xargs 2>/dev/null || true)"
    if "${FFMPEG_BIN}" -hide_banner -encoders 2>/dev/null | grep -q 'h264_nvenc'; then
      GPU_ENCODER="h264_nvenc"
      GPU_LABEL="NVIDIA ${gpu_name} (h264_nvenc)"
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${GPU_FOUND_MSG}" "$(clr_cyan "${GPU_LABEL}")"
      return 0
    fi
  fi

  # VA-API — AMD / Intel on Linux
  if [[ -e /dev/dri/renderD128 ]]; then
    if "${FFMPEG_BIN}" -hide_banner -encoders 2>/dev/null | grep -q 'h264_vaapi'; then
      GPU_ENCODER="h264_vaapi"
      GPU_LABEL="VA-API /dev/dri/renderD128 (h264_vaapi)"
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${GPU_FOUND_MSG}" "$(clr_cyan "${GPU_LABEL}")"
      return 0
    fi
  fi

  printf "  %s  %s\n" "$(clr_dim '○')" "$(clr_dim "${GPU_NONE}")"
  return 1
}

# ── FFmpeg binary bootstrap ───────────────────────────────────────────────────
# Downloads a static FFmpeg build from johnvansickle.com when the system
# ffmpeg is missing or older than v7.

FFMPEG_BIN="ffmpeg"
FFPROBE_BIN="ffprobe"
FFMPEG_LOCAL_DIR="${HOME}/.local/share/edit-videos/ffmpeg"

_arch_tag() {
  local machine; machine="$(uname -m)"
  case "${machine}" in
    x86_64)          echo "amd64" ;;
    aarch64|arm64)   echo "arm64" ;;
    armv7*|armv6*)   echo "armhf" ;;
    i?86)            echo "i686"  ;;
    *)               echo ""      ;;
  esac
}

bootstrap_ffmpeg() {
  local arch; arch="$(_arch_tag)"
  if [[ -z "${arch}" ]]; then
    printf "  %s Unknown CPU architecture — cannot auto-download FFmpeg.\n" "$(clr_bold_red '✗')"
    exit 1
  fi

  local url="https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${arch}-static.tar.xz"
  local md5_url="${url}.md5"
  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/ffmpeg.tar.xz"

  printf "  %s\n" "$(clr_dim "Downloading static FFmpeg (johnvansickle.com) for ${arch}...")"

  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "${archive}" "${url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; exit 1; }
  elif command -v curl &>/dev/null; then
    curl -L --progress-bar -o "${archive}" "${url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; exit 1; }
  else
    printf "  %s Neither wget nor curl found — cannot download FFmpeg.\n" "$(clr_bold_red '✗')"
    exit 1
  fi

  # Optional MD5 check
  if command -v md5sum &>/dev/null; then
    local md5_file="${tmp_dir}/ffmpeg.tar.xz.md5"
    if command -v wget &>/dev/null; then
      wget -q -O "${md5_file}" "${md5_url}" 2>/dev/null || true
    else
      curl -sL -o "${md5_file}" "${md5_url}" 2>/dev/null || true
    fi
    if [[ -s "${md5_file}" ]]; then
      local expected; expected="$(awk '{print $1}' "${md5_file}")"
      local actual;   actual="$(md5sum "${archive}" | awk '{print $1}')"
      if [[ "${expected}" != "${actual}" ]]; then
        printf "  %s MD5 mismatch — archive may be corrupted.\n" "$(clr_bold_red '✗')"
        rm -rf "${tmp_dir}"; exit 1
      fi
      printf "  %s MD5 verified.\n" "$(clr_bold_green '✓')"
    fi
  fi

  mkdir -p "${FFMPEG_LOCAL_DIR}"
  tar -xf "${archive}" -C "${tmp_dir}"
  local extracted_dir; extracted_dir="$(find "${tmp_dir}" -maxdepth 1 -type d -name 'ffmpeg-*' | head -1)"
  cp "${extracted_dir}/ffmpeg"  "${FFMPEG_LOCAL_DIR}/ffmpeg"
  cp "${extracted_dir}/ffprobe" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true
  chmod +x "${FFMPEG_LOCAL_DIR}/ffmpeg" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
  FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
  printf "  %s FFmpeg installed to %s\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${FFMPEG_LOCAL_DIR}")"
}

# ── FFmpeg helpers ────────────────────────────────────────────────────────────

THREAD_COUNT="$(nproc 2>/dev/null || echo 4)"
THREAD_FLAGS=(-threads "${THREAD_COUNT}" -filter_threads "${THREAD_COUNT}" -filter_complex_threads "${THREAD_COUNT}")

probe_video() {
  # Outputs: "<duration_sec> <fps_int>"
  local input="$1"
  local info
  info="$("${FFMPEG_BIN}" -i "${input}" 2>&1 || true)"

  local dur_sec=0 fps=30

  if [[ "${info}" =~ Duration:[[:space:]]+([0-9]+):([0-9]+):([0-9]+) ]]; then
    local h="${BASH_REMATCH[1]}" m="${BASH_REMATCH[2]}" s="${BASH_REMATCH[3]}"
    dur_sec=$(( h * 3600 + m * 60 + s ))
  fi

  if [[ "${info}" =~ ([0-9]+)[[:space:]]*(fps|tbr) ]]; then
    fps="${BASH_REMATCH[1]}"
    [[ "${fps}" -eq 0 ]] && fps=30
  fi

  echo "${dur_sec} ${fps}"
}

detect_black_bars() {
  # Outputs the crop string "W:H:X:Y" or empty if no bars found.
  local input="$1" limit="${2:-24}" round="${3:-16}"
  local log_tmp
  log_tmp="$(mktemp)"

  "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" -i "${input}" \
    -vf "cropdetect=limit=${limit}:round=${round}:reset=0" \
    -f null - 2>"${log_tmp}" &
  local ffmpeg_pid=$!

  printf '\033[?25l' >/dev/tty
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  while kill -0 "${ffmpeg_pid}" 2>/dev/null; do
    printf "\r    %s\033[K" "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" >/dev/tty
    spin_idx=$(( spin_idx + 1 ))
    sleep 0.15
  done
  wait "${ffmpeg_pid}" || true
  printf '\033[?25h' >/dev/tty
  printf "\r\033[K" >/dev/tty

  local log; log="$(<"${log_tmp}")"
  rm -f "${log_tmp}"

  local crop=""
  while IFS= read -r line; do
    if [[ "${line}" =~ crop=([0-9]+:[0-9]+:[0-9]+:[0-9]+) ]]; then
      crop="${BASH_REMATCH[1]}"
    fi
  done <<< "${log}"

  echo "${crop}"
}

check_vidstab() {
  "${FFMPEG_BIN}" -hide_banner -filters 2>/dev/null | grep -q 'vidstabdetect'
}

check_deshake() {
  "${FFMPEG_BIN}" -hide_banner -filters 2>/dev/null | grep -q 'deshake'
}

check_zscale() {
  "${FFMPEG_BIN}" -hide_banner -filters 2>/dev/null | grep -q 'zscale'
}

probe_hdr_type() {
  # Returns: "hdr10", "hlg", "dolby_vision", "sdr_10bit", or "sdr_8bit"
  local input="$1"
  local pix_fmt="" color_transfer="" color_primaries=""

  if [[ -x "${FFPROBE_BIN}" ]] || command -v ffprobe &>/dev/null; then
    local _ffprobe="${FFPROBE_BIN}"
    [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"
    local info
    info="$("${_ffprobe}" -v quiet -select_streams v:0 \
      -show_entries stream=pix_fmt,color_transfer,color_primaries \
      -of default=noprint_wrappers=1 "${input}" 2>/dev/null)"
    pix_fmt="$(grep 'pix_fmt='        <<< "${info}" | cut -d= -f2)"
    color_transfer="$(grep  'color_transfer='  <<< "${info}" | cut -d= -f2)"
    color_primaries="$(grep 'color_primaries=' <<< "${info}" | cut -d= -f2)"

    # Dolby Vision: detected via stream side data
    local dv_info
    dv_info="$("${_ffprobe}" -v quiet -select_streams v:0 \
      -show_entries stream_side_data=side_data_type \
      -of default=noprint_wrappers=1:nokey=1 "${input}" 2>/dev/null)"
    if grep -qi "DOVI\|Dolby Vision" <<< "${dv_info}"; then
      echo "dolby_vision"; return
    fi
  else
    # Fallback: parse ffmpeg -i output
    local info
    info="$("${FFMPEG_BIN}" -i "${input}" 2>&1 || true)"
    [[ "${info}" =~ yuv420p10 ]]                                    && pix_fmt="yuv420p10le"
    [[ "${info}" =~ smpte2084 ]]                                    && color_transfer="smpte2084"
    [[ "${info}" =~ arib-std-b67 || "${info}" =~ [[:space:]]hlg ]] && color_transfer="arib-std-b67"
    [[ "${info}" =~ bt2020 ]]                                       && color_primaries="bt2020"
    if [[ "${info}" =~ [Dd]olby[[:space:]]*[Vv]ision || "${info}" =~ dvh1 || "${info}" =~ dvhe ]]; then
      echo "dolby_vision"; return
    fi
  fi

  # Not 10-bit or 12-bit → plain SDR 8-bit
  if [[ "${pix_fmt}" != *"10"* && "${pix_fmt}" != *"12"* ]]; then
    echo "sdr_8bit"; return
  fi

  # 10-bit: classify by transfer function
  case "${color_transfer}" in
    smpte2084|bt2020-10|bt2020_10)
      echo "hdr10" ;;
    arib-std-b67|hlg)
      echo "hlg" ;;
    *)
      # 10-bit with bt2020 primaries but unrecognised transfer → treat as HDR10
      if [[ "${color_primaries}" == *"bt2020"* ]]; then
        echo "hdr10"
      else
        echo "sdr_10bit"
      fi
      ;;
  esac
}

get_hdr_conversion_filters() {
  # Populates the nameref array $2 with one filter string per element.
  local hdr_type="$1"
  local -n _hdr_out="$2"
  _hdr_out=()

  case "${hdr_type}" in
    hdr10|dolby_vision)
      # PQ (SMPTE ST 2084) → linear light → Hable tone-map → SDR BT.709 8-bit
      _hdr_out=(
        "zscale=t=linear:npl=100"
        "format=gbrpf32le"
        "zscale=p=bt709"
        "tonemap=tonemap=hable:desat=0"
        "zscale=t=bt709:m=bt709:r=tv"
        "format=yuv420p"
      )
      ;;
    hlg)
      # HLG → linear light → SDR BT.709 8-bit (zscale handles HLG→linear natively)
      _hdr_out=(
        "zscale=t=linear:npl=100"
        "format=gbrpf32le"
        "zscale=p=bt709"
        "tonemap=tonemap=hable:desat=0"
        "zscale=t=bt709:m=bt709:r=tv"
        "format=yuv420p"
      )
      ;;
    sdr_10bit)
      # 10-bit SDR without HDR metadata → reduce pixel depth to 8-bit
      _hdr_out=("format=yuv420p")
      ;;
  esac
}

run_ffmpeg_step() {
  # Args: step_label duration_sec [ffmpeg args...]
  # duration_sec=0 means unknown — shows a spinner instead of percentage.
  local label="$1" dur="${2:-0}"; shift 2
  printf "    %s\n" "${label}..."

  local stderr_tmp bar_width=25
  stderr_tmp="$(mktemp)"
  local step_start=$SECONDS

  "${FFMPEG_BIN}" "${THREAD_FLAGS[@]}" "$@" -y 2>"${stderr_tmp}" &
  local ffmpeg_pid=$!

  printf '\033[?25l'
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

  while kill -0 "${ffmpeg_pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local pct=-1
    if [[ "${dur}" -gt 0 ]]; then
      local time_str
      time_str="$(grep -o 'time=[0-9:]*' "${stderr_tmp}" 2>/dev/null | tail -1 | cut -d= -f2 || true)"
      if [[ -n "${time_str}" && "${time_str}" != "N/A" ]]; then
        local h=0 m=0 s=0
        IFS=: read -r h m s <<< "${time_str}"
        local cur_sec=$(( 10#${h:-0}*3600 + 10#${m:-0}*60 + 10#${s:-0} ))
        pct=$(( cur_sec * 100 / dur ))
        [[ "${pct}" -gt 99 ]] && pct=99
      fi
    fi

    if [[ "${pct}" -ge 0 ]]; then
      local filled=$(( pct * bar_width / 100 ))
      local empty=$(( bar_width - filled ))
      local bar="" i
      for ((i=0; i<filled; i++)); do bar+="█"; done
      for ((i=0; i<empty; i++)); do bar+="░"; done
      local eta_str=""
      if [[ "${pct}" -ge 1 && "${elapsed}" -gt 0 ]]; then
        local remaining=$(( elapsed * (100 - pct) / pct ))
        eta_str="  ETA ~$(_fmt_time "${remaining}")"
      fi
      printf "\r    [%s] %3d%%  %s%s\033[K" "$(clr_cyan "${bar}")" "${pct}" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${eta_str}")"
    else
      printf "\r    %s  %s\033[K" "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")"
      spin_idx=$(( spin_idx + 1 ))
    fi
    sleep 0.15
  done

  wait "${ffmpeg_pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"

  if [[ "${ec}" -eq 0 ]]; then
    if [[ "${dur}" -gt 0 ]]; then
      local bar="" i
      for ((i=0; i<bar_width; i++)); do bar+="█"; done
      printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    else
      printf "\r\033[K"
    fi
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
    rm -f "${stderr_tmp}"
    return 0
  else
    printf "\r\033[K"
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
    local tail_out
    tail_out="$(tail -3 "${stderr_tmp}" 2>/dev/null | grep -v '^$' | head -3 || true)"
    [[ -n "${tail_out}" ]] && printf "    %s\n" "$(clr_dim "${tail_out}")"
    rm -f "${stderr_tmp}"
    return "${ec}"
  fi
}

# ── Process a single video ────────────────────────────────────────────────────

process_video() {
  local input="$1"
  local output="$2"
  local do_black_bars="$3"
  local do_fps="$4"
  local do_h264="$5"
  local do_stab="$6"
  local target_fps="$7"
  local stab_shakiness="$8"
  local stab_accuracy="$9"
  local stab_smoothing="${10}"
  local use_gpu="${11}"
  local gpu_encoder="${12}"
  local stab_mode="${13:-vidstab}"

  local trf_file=""
  local intermediate=""
  local src="${input}"
  local vf_chain=()

  # Probe duration so run_ffmpeg_step can show a percentage bar.
  local probe_out dur_sec=0
  probe_out="$(probe_video "${input}")"
  dur_sec="${probe_out%% *}"

  # ── Auto-detect HDR / 10-bit; prepend color conversion when re-encoding ──
  local do_any=$(( do_black_bars | do_fps | do_h264 | do_stab ))
  if [[ "${do_any}" -eq 1 ]]; then
    printf "    %s\n" "$(clr_dim "${HDR_DETECT}")"
    local hdr_type
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
        printf "    %s %s\n" "$(clr_yellow '⚠')" "$(clr_dim "${ZSCALE_NOT_FOUND}")"
      fi
    fi
  fi

  # ── Pass A: cropdetect (analysis only, no output file) ──────────────────
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

  # ── Pre-transcode to H.264 SDR when stabilizing HDR/HEVC source ─────────
  # Decoding H.265 Main10 + applying HDR filters twice (detect + encode pass)
  # is the main bottleneck on 4K HDR sources. Pre-converting to a fast H.264
  # SDR intermediate lets vidstabdetect decode 3-5× faster and skips the
  # expensive HDR tone-mapping on the second pass.
  if [[ "${do_stab}" -eq 1 && "${stab_mode}" == "vidstab" && "${hdr_type}" != "sdr_8bit" ]]; then
    intermediate="$(mktemp /tmp/edit_videos_pre_XXXXXX.mp4)"
    local pre_vf=""
    [[ "${#vf_chain[@]}" -gt 0 ]] && pre_vf="$(IFS=','; echo "${vf_chain[*]}")"
    local pre_args=(-i "${src}")
    [[ -n "${pre_vf}" ]] && pre_args+=(-vf "${pre_vf}")
    pre_args+=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy "${intermediate}")
    if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" "${pre_args[@]}"; then
      rm -f "${intermediate}"; intermediate=""
      return 1
    fi
    src="${intermediate}"
    vf_chain=()
  fi

  # ── Pass B: stabilization ────────────────────────────────────────────────
  if [[ "${do_stab}" -eq 1 ]]; then
    if [[ "${stab_mode}" == "vidstab" ]]; then
      trf_file="$(mktemp /tmp/vstab_XXXXXX.trf)"

      # Include any prior CPU filters (e.g. crop) so motion analysis is on the
      # actual frame geometry that will be encoded.
      local detect_vf
      if [[ "${#vf_chain[@]}" -gt 0 ]]; then
        detect_vf="$(IFS=','; echo "${vf_chain[*]}"),vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${trf_file}"
      else
        detect_vf="vidstabdetect=shakiness=${stab_shakiness}:accuracy=${stab_accuracy}:result=${trf_file}"
      fi

      if ! run_ffmpeg_step "${STEP_VIDSTABDETECT}" "${dur_sec}" -i "${src}" -vf "${detect_vf}" -f null -; then
        rm -f "${trf_file}"; [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi

      vf_chain+=("vidstabtransform=input=${trf_file}:smoothing=${stab_smoothing}:interpol=bicubic")

    else
      # deshake fallback: single-pass, no temp file needed.
      # rx/ry max shift in pixels (scale smoothing 0-100 → 4-64 px).
      local deshake_r=$(( 4 + stab_smoothing * 60 / 100 ))
      vf_chain+=("deshake=rx=${deshake_r}:ry=${deshake_r}:edge=1:search=0")
    fi
  fi

  # ── FPS interpolation filter (added to chain, encoded in final pass) ─────
  if [[ "${do_fps}" -eq 1 ]]; then
    vf_chain+=("minterpolate=fps=${target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=16")
  fi

  # ── Final pass: encode with full filter chain ────────────────────────────
  local needs_encode=0
  [[ "${#vf_chain[@]}" -gt 0 ]] && needs_encode=1
  [[ "${do_h264}" -eq 1 ]]      && needs_encode=1

  if [[ "${needs_encode}" -eq 1 ]]; then
    local pre_input_args=() encode_args=()

    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      # NVENC: CPU filters → NVENC encode. No special filter needed.
      encode_args=(-c:v h264_nvenc -preset p4 -cq 23 -c:a copy)

    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      # VA-API: all CPU filters run first, then upload frames to GPU via hwupload.
      pre_input_args=(-vaapi_device /dev/dri/renderD128)
      vf_chain+=("format=nv12" "hwupload")
      encode_args=(-c:v h264_vaapi -qp 23 -c:a copy)

    else
      # CPU: libx264
      encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
    fi

    local final_vf=""
    [[ "${#vf_chain[@]}" -gt 0 ]] && final_vf="$(IFS=','; echo "${vf_chain[*]}")"

    local ffmpeg_args=("${pre_input_args[@]}" -i "${src}")
    [[ -n "${final_vf}" ]] && ffmpeg_args+=(-vf "${final_vf}")
    ffmpeg_args+=("${encode_args[@]}" "${output}")

    if ! run_ffmpeg_step "${STEP_ENCODE}" "${dur_sec}" "${ffmpeg_args[@]}"; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"; [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

  else
    # No modifications — just copy to output folder.
    if ! run_ffmpeg_step "${STEP_COPY}" "${dur_sec}" -i "${src}" -c copy "${output}"; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"; [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi
  fi

  [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
  [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
  return 0
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  # ── Language ────────────────────────────────────────────────────────────
  printf "  Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang
  local lang="en"
  [[ "${raw_lang,,}" == es* ]] && lang="es"
  setup_strings "${lang}"
  local main_start=$SECONDS

  clear
  print_header

  # ── FFmpeg check ────────────────────────────────────────────────────────

  # If a previously-downloaded static binary exists, prefer it.
  if [[ -x "${FFMPEG_LOCAL_DIR}/ffmpeg" ]]; then
    FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
    FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
  fi

  printf "  %s\n" "$(clr_dim "${FFMPEG_CHECK}")"

  local ffmpeg_ver major_ver
  if command -v "${FFMPEG_BIN}" &>/dev/null || [[ -x "${FFMPEG_BIN}" ]]; then
    ffmpeg_ver="$("${FFMPEG_BIN}" -version 2>/dev/null | head -1 | sed 's/ffmpeg version //')"
  else
    ffmpeg_ver=""
  fi

  # Git builds (start with N-) are cutting-edge; treat as current.
  if [[ "${ffmpeg_ver}" =~ ^N- ]]; then
    major_ver=99
  elif [[ "${ffmpeg_ver}" =~ ^([0-9]+) ]]; then
    major_ver="${BASH_REMATCH[1]}"
  else
    major_ver=0
  fi

  if [[ -z "${ffmpeg_ver}" || "${major_ver}" -lt 7 ]]; then
    if [[ -z "${ffmpeg_ver}" ]]; then
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${FFMPEG_NOT_FOUND}"
    else
      printf "  %s %s: %s\n" "$(clr_bold_yellow '⚠')" "${FFMPEG_OLD_VERSION}" "$(clr_dim "${ffmpeg_ver}")"
      printf "  %s\n" "$(clr_yellow "${FFMPEG_MIN_VERSION}")"
    fi
    echo ""
    printf "  %s [y/n] (y): " "$(clr_bold "Download a static FFmpeg binary automatically?")"
    local dl_ans; read -r dl_ans; dl_ans="${dl_ans:-y}"
    if [[ "${dl_ans,,}" == y* ]]; then
      bootstrap_ffmpeg
      ffmpeg_ver="$("${FFMPEG_BIN}" -version 2>/dev/null | head -1 | sed 's/ffmpeg version //')"
    else
      if [[ -z "${ffmpeg_ver}" ]]; then
        printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${FFMPEG_NOT_FOUND}"
        exit 1
      fi
      # Outdated but user declined — continue with a warning.
      printf "  %s\n\n" "$(clr_yellow "Continuing with outdated FFmpeg. Results may vary.")"
    fi
  fi

  printf "  %s %s: %s\n\n" "$(clr_bold_green '✓')" "${FFMPEG_FOUND}" "$(clr_dim "${ffmpeg_ver}")"

  # ── GPU detection ────────────────────────────────────────────────────────
  local use_gpu=0
  if detect_gpu; then
    printf "  %s: " "${GPU_USE_PROMPT}"
    local gpu_ans; read -r gpu_ans
    gpu_ans="${gpu_ans:-n}"
    local fchar="${gpu_ans:0:1}"
    [[ "${CONFIRM_YES_CHARS}" == *"${fchar,,}"* ]] && use_gpu=1
  fi
  echo ""

  # ── Folder selection ─────────────────────────────────────────────────────
  local folder=""
  while true; do
    printf "  %s: " "$(clr_bold "${FOLDER_PROMPT}")"
    read -r folder
    folder="${folder%/}"
    if [[ -d "${folder}" ]]; then
      break
    fi
    printf "  %s %s: %s\n  %s\n" \
      "$(clr_red '✗')" "${FOLDER_NOT_FOUND}" \
      "$(clr_dim "${folder}")" \
      "$(clr_dim "${FOLDER_HINT}")"
  done
  echo ""

  # ── Scan for video formats ────────────────────────────────────────────────
  printf "  %s\n" "$(clr_dim "${SCANNING}")"

  local all_exts=(mp4 mkv avi mov wmv flv webm mpeg mpg m4v ts mts m2ts 3gp ogv)
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
  for ext in "${found_formats[@]}"; do
    _CB_LABELS+=(".${ext}  (${FORMAT_COUNT[$ext]} ${FILES_LABEL})")
    _CB_SEL+=(1)
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

  # ── Action selection ──────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold "${SELECT_ACTIONS_TITLE}:")"
  printf "  %s\n" "$(clr_dim "${CB_PROMPT}")"
  printf "  %s\n\n" "$(clr_dim "${CB_HINT}")"

  _CB_LABELS=(
    "${ACTION_BLACK_BARS}"
    "${ACTION_FPS}"
    "${ACTION_H264}"
    "${ACTION_STAB}"
  )
  _CB_SEL=(0 0 0 0)
  interactive_checkbox

  local do_black_bars=0 do_fps=0 do_h264=0 do_stab=0
  for idx in "${SELECTED_INDICES[@]}"; do
    case "${idx}" in
      0) do_black_bars=1 ;;
      1) do_fps=1 ;;
      2) do_h264=1 ;;
      3) do_stab=1 ;;
    esac
  done

  if [[ "${do_black_bars}" -eq 0 && "${do_fps}" -eq 0 && "${do_h264}" -eq 0 && "${do_stab}" -eq 0 ]]; then
    printf "\n  %s\n\n" "$(clr_yellow "${NO_ACTIONS_SELECTED}")"
    exit 0
  fi
  echo ""

  # ── Action parameters ─────────────────────────────────────────────────────
  local target_fps=60
  local stab_shakiness=7 stab_accuracy=15 stab_smoothing=30
  local stab_mode="vidstab"

  if [[ "${do_fps}" -eq 1 ]]; then
    printf "  %s (60): " "$(clr_bold "${TARGET_FPS_PROMPT}")"
    read -r target_fps
    target_fps="${target_fps:-60}"
    if ! [[ "${target_fps}" =~ ^[0-9]+$ ]] || [[ "${target_fps}" -lt 1 ]]; then
      target_fps=60
    fi
  fi

  if [[ "${do_stab}" -eq 1 ]]; then
    if check_vidstab; then
      stab_mode="vidstab"
      printf "  %s (7): " "$(clr_dim "${SHAKINESS_LABEL}")"
      read -r stab_shakiness; stab_shakiness="${stab_shakiness:-7}"
      printf "  %s (15): " "$(clr_dim "${ACCURACY_LABEL}")"
      read -r stab_accuracy; stab_accuracy="${stab_accuracy:-15}"
      printf "  %s (30): " "$(clr_dim "${SMOOTHING_LABEL}")"
      read -r stab_smoothing; stab_smoothing="${stab_smoothing:-30}"
    elif check_deshake; then
      stab_mode="deshake"
      printf "  %s %s\n" "$(clr_yellow '⚠')" "${VIDSTAB_FALLBACK_DESHAKE}"
      printf "  %s (30): " "$(clr_dim "${SMOOTHING_LABEL}")"
      read -r stab_smoothing; stab_smoothing="${stab_smoothing:-30}"
    else
      printf "  %s %s\n\n" "$(clr_yellow '⚠')" "${DESHAKE_NOT_FOUND}"
      do_stab=0
    fi
  fi
  echo ""

  # ── Collect files to process ──────────────────────────────────────────────
  local video_files=()
  for ext in "${selected_exts[@]}"; do
    while IFS= read -r -d '' f; do
      video_files+=("$f")
    done < <(find "${folder}" -maxdepth 1 -type f -iname "*.${ext}" -print0 2>/dev/null | sort -z)
  done

  local total="${#video_files[@]}"

  # ── Output folder ─────────────────────────────────────────────────────────
  local date_str
  date_str="$(date '+%Y-%m-%d')"
  local out_dir="${folder}/output-${date_str}"

  # ── Pre-flight summary ────────────────────────────────────────────────────
  local divider
  divider="$(printf '─%.0s' {1..60})"
  echo "  ${divider}"
  printf "  %s  %d %s\n" "$(clr_bold_cyan '▶')" "${total}" "$(clr_bold "${FILES_LABEL} selected")"
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_dim "${out_dir}")"

  printf "  %s: " "$(clr_bold "${ACTIONS_LABEL}")"
  local action_list=()
  [[ "${do_black_bars}" -eq 1 ]] && action_list+=("black bars")
  [[ "${do_fps}" -eq 1 ]]        && action_list+=("FPS→${target_fps}")
  [[ "${do_h264}" -eq 1 ]]       && action_list+=("H.264")
  [[ "${do_stab}" -eq 1 ]]       && action_list+=("stabilize (sh=${stab_shakiness} ac=${stab_accuracy} sm=${stab_smoothing})")
  local IFS_SAVE="${IFS}"; IFS=', '; printf "%s\n" "$(clr_cyan "${action_list[*]}")"; IFS="${IFS_SAVE}"

  if [[ "${use_gpu}" -eq 1 ]]; then
    printf "  %s: %s\n" "$(clr_bold_magenta 'GPU')" "$(clr_magenta "${GPU_LABEL}")"
  fi
  printf "  %s: %s\n" "$(clr_dim "${THREADS_LABEL}")" "$(clr_dim "${THREAD_COUNT}")"
  echo "  ${divider}"
  echo ""

  printf "  %s (y): " "${CONFIRM_PROMPT}"
  local confirm; read -r confirm
  confirm="${confirm:-y}"
  fchar="${confirm:0:1}"
  if [[ "${CONFIRM_YES_CHARS}" != *"${fchar,,}"* ]]; then
    printf "  %s\n\n" "${CANCELLED}"; exit 0
  fi
  mkdir -p "${out_dir}"
  echo ""

  # ── Processing queue ──────────────────────────────────────────────────────
  printf "  %s\n" "$(clr_bold "${PROCESSING_TITLE}...")"
  echo "  ${divider}"

  local count_ok=0 count_fail=0 count_idx=0
  local failed_files=()
  local vf

  for vf in "${video_files[@]}"; do
    count_idx=$(( count_idx + 1 ))
    local base; base="$(basename "${vf}")"
    local out="${out_dir}/${base}"

    printf "\n  [%d/%d] %s\n" "${count_idx}" "${total}" "$(clr_bold "${base}")"

    if process_video "${vf}" "${out}" \
        "${do_black_bars}" "${do_fps}" "${do_h264}" "${do_stab}" \
        "${target_fps}" "${stab_shakiness}" "${stab_accuracy}" "${stab_smoothing}" \
        "${use_gpu}" "${GPU_ENCODER}" "${stab_mode}"; then
      count_ok=$(( count_ok + 1 ))
    else
      printf "  %s %s: %s\n" "$(clr_red '✗')" "${STEP_FAIL}" "${base}"
      count_fail=$(( count_fail + 1 ))
      failed_files+=("${base}")
    fi
  done

  # ── Summary ───────────────────────────────────────────────────────────────
  echo ""
  echo "  ${divider}"
  printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${SUMMARY_OK}" "$(clr_bold "${count_ok}")"
  if [[ "${count_fail}" -gt 0 ]]; then
    printf "  %s %s: %s\n" "$(clr_red '✗')" "${SUMMARY_FAIL}" "$(clr_bold "${count_fail}")"
    for f in "${failed_files[@]}"; do
      printf "    %s %s\n" "$(clr_dim '·')" "$(clr_dim "${f}")"
    done
  fi
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_dim "${out_dir}")"
  local total_elapsed=$(( SECONDS - main_start ))
  printf "  %s: %s\n" "$(clr_dim "Total time")" "$(clr_dim "$(_fmt_time "${total_elapsed}")")"
  echo "  ${divider}"
  printf "\n  %s %s\n\n" "$(clr_bold_green '✓')" "${ALL_DONE}"
}

main "$@"
