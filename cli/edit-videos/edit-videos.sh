#!/usr/bin/env bash
# edit-videos.sh
#
# Interactive FFmpeg batch video editor.
# Actions: Remove black bars, Interpolate FPS, Convert to H.264, Video stabilization, Downsize resolution.
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

_log() {
  [[ -z "${LOG_FILE}" ]] && return 0
  printf "[%s] %s\n" "$(date '+%H:%M:%S')" "$*" >> "${LOG_FILE}"
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
    GPU_USE_PROMPT="¿Usar GPU para codificación H.264? [S/n]"
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
    ACTION_H264="Convertir a H.264"
    ACTION_STAB="Estabilizar video (vid.stab, dos pases)"
    TARGET_FPS_PROMPT="FPS objetivo [60/90/120 o valor personalizado]"
    SHAKINESS_LABEL="Intensidad de vibración a detectar [1-10]"
    ACCURACY_LABEL="Precisión del análisis [1-15]"
    SMOOTHING_LABEL="Suavizado de la estabilización [0-100]"
    STAB_MODE_LABEL="Modo de estabilización"
    STAB_MODE_STANDARD="Estándar (mano alzada)"
    STAB_MODE_CONCERT="Concierto / flashes (límite de rotación estricto)"
    STAB_CONCERT_INFO="Modo concierto: shakiness=5 suavizado=50 maxángulo=3° maxdesplaz=30px"
    CONFIRM_PROMPT="¿Confirmar y comenzar el procesamiento? [s/n]"
    PROCESSING_TITLE="Procesando videos"
    STEP_CROPDETECT="Detectando franjas negras"
    STEP_VIDSTABDETECT="Analizando movimiento (pase 1/2)"
    STEP_ENCODE="Codificando"
    STEP_COPY="Copiando al destino"
    STEP_DONE="listo"
    STEP_FAIL="FALLÓ"
    STEP_FINALIZING="Finalizando..."
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
    OUTPUT_FOLDER_PROMPT="Carpeta de salida"
    CANCELLED="Cancelado."
    HDR_DETECT="Detectando perfil HDR/color..."
    HDR_FOUND_HDR10="Fuente HDR10 detectada — aplicando mapeo de tono a SDR BT.709"
    HDR_FOUND_HLG="Fuente HLG detectada — aplicando mapeo de tono a SDR BT.709"
    HDR_FOUND_DV="Fuente Dolby Vision detectada — usando mapeo de tono HDR10 como respaldo"
    HDR_FOUND_10BIT="Fuente SDR de 10 bits detectada — convirtiendo a 8 bits BT.709"
    ZSCALE_NOT_FOUND="Filtro zscale no disponible — se omite la conversión HDR (instala libzimg para mejores resultados)"
    ZSCALE_FALLBACK_COLORSPACE="zscale no disponible — usando filtro colorspace para conversión básica HDR→SDR (instala libzimg para mapeo de tono completo)"
    STEP_PREPROCESS="Pre-convirtiendo a intermedio H.264 SDR"
    BG_PROMPT="¿Ejecutar en segundo plano (el proceso sobrevive al cierre del terminal)? [s/n]"
    BG_STARTED="Procesamiento en segundo plano iniciado"
    BG_PID_LABEL="PID"
    BG_LOG_LABEL="Registro"
    BG_MONITOR_TIP="Monitorear el progreso con: tail -f"
    ACTION_DENOISE="Eliminar ruido del video (hqdn3d)"
    ACTION_SHARPEN="Nitidez (unsharp mask)"
    ACTION_UPSCALE="Aumentar resolución (scale+lanczos)"
    ACTION_COLOR="Mejorar color y contraste (eq)"
    DENOISE_LUMA_S_LABEL="Fuerza espacial de luma [0-10]"
    DENOISE_CHROMA_S_LABEL="Fuerza espacial de croma [0-10]"
    DENOISE_LUMA_T_LABEL="Fuerza temporal de luma [0-10]"
    DENOISE_CHROMA_T_LABEL="Fuerza temporal de croma [0-10]"
    SHARPEN_MATRIX_LABEL="Tamaño de la matriz (impar, 3-23)"
    SHARPEN_LUMA_AMOUNT_LABEL="Intensidad de luma [-2.0 a 5.0]"
    SHARPEN_CHROMA_AMOUNT_LABEL="Intensidad de croma [-2.0 a 5.0]"
    UPSCALE_TARGET_LABEL="Resolución objetivo [720, 1080, 1440, 2160 o AnchoxAlto]"
    UPSCALE_SKIP_MSG="Resolución ya es igual o superior al objetivo, se omite el escalado"
    COLOR_CONTRAST_LABEL="Contraste [0.0-2.0, 1.0=neutro]"
    COLOR_BRIGHTNESS_LABEL="Brillo [-1.0 a 1.0, 0.0=neutro]"
    COLOR_SATURATION_LABEL="Saturación [0.0-2.0, 1.0=neutro]"
    COLOR_GAMMA_LABEL="Gamma [0.1-10.0, 1.0=neutro]"
    ACTION_RIFE="Interpolar FPS — IA (rife-ncnn-vulkan)"
    RIFE_MULTIPLIER_PROMPT="Multiplicador de FPS [2/4/8]"
    RIFE_DISK_WARN="Aviso: RIFE extrae todos los fotogramas a /tmp (~1-2 GB por minuto de 1080p). Asegúrate de tener espacio suficiente."
    RIFE_CHECK="Verificando rife-ncnn-vulkan..."
    RIFE_FOUND="rife-ncnn-vulkan encontrado"
    RIFE_NOT_FOUND="rife-ncnn-vulkan no encontrado"
    RIFE_DOWNLOADING="Descargando rife-ncnn-vulkan desde GitHub..."
    RIFE_DOWNLOAD_FAIL="No se pudo obtener la URL de descarga de RIFE. Instálalo manualmente."
    RIFE_UNZIP_MISSING="unzip no disponible — no se puede extraer el archivo RIFE (instala con: sudo apt install unzip)"
    RIFE_STEP_EXTRACT="Extrayendo fotogramas"
    RIFE_STEP_INTERP="Interpolando fotogramas (RIFE)"
    RIFE_STEP_ENCODE="Recodificando video interpolado"
    RIFE_MPG_PRECONVERT="Pre-convirtiendo MPG/MPEG a MP4 para interpolación con RIFE"
    BTBN_REQUIRED_MSG="FFmpeg del sistema no es compatible. Este script requiere FFmpeg BtbN (compilación estática con soporte GPU)."
    BTBN_REQUIRED_TITLE="Por qué se requiere FFmpeg BtbN:"
    BTBN_REQUIRED_REASON="Los binarios BtbN incluyen NVENC/VAAPI y todos los filtros de CPU (vidstab, zscale, etc.) en un solo ejecutable estático portátil."
    BTBN_DOWNLOAD_PROMPT="¿Descargar FFmpeg BtbN automáticamente?"
    BTBN_DECLINED_MSG="Se requiere FFmpeg BtbN para ejecutar este script. Descárgalo en: https://github.com/BtbN/FFmpeg-Builds/releases"
    ACTION_DOWNSIZE="Reducir resolución (scale+lanczos)"
    DOWNSIZE_TARGET_LABEL="Resolución máxima [480, 720, 1080, 1440, 2160 o AnchoxAlto]"
    DOWNSIZE_SKIP_MSG="Resolución ya es igual o inferior al objetivo, se omite la reducción"
    ACTION_VIDEO2X="Aumentar resolución — IA (Real-ESRGAN)"
    VIDEO2X_SCALE_PROMPT="Factor de escala [2/4]"
    VIDEO2X_MODEL_PROMPT="Modelo [realesr-animevideov3 / realesrgan-x4plus / realesr-general-x4v3]"
    VIDEO2X_DISK_WARN="Aviso: Real-ESRGAN extrae todos los fotogramas a /tmp (~1-2 GB por minuto de 1080p). Requiere GPU Vulkan."
    VIDEO2X_CHECK="Verificando realesrgan-ncnn-vulkan..."
    VIDEO2X_FOUND="realesrgan-ncnn-vulkan encontrado"
    VIDEO2X_NOT_FOUND="realesrgan-ncnn-vulkan no encontrado"
    VIDEO2X_DOWNLOADING="Descargando realesrgan-ncnn-vulkan desde GitHub..."
    VIDEO2X_DOWNLOAD_FAIL="No se pudo obtener la URL de descarga. Instala realesrgan-ncnn-vulkan manualmente."
    VIDEO2X_STEP_EXTRACT="Extrayendo fotogramas"
    VIDEO2X_STEP_UPSCALE="Escalando con IA (Real-ESRGAN)"
    VIDEO2X_STEP_ENCODE="Recodificando video escalado"
    VIDEO2X_MPG_PRECONVERT="Pre-convirtiendo MPG/MPEG a MP4 para escalado con IA"
    ACTION_DEEP3D="Estabilizar — IA (Deep3D)"
    DEEP3D_STABILITY_LABEL="Nivel de estabilidad [1-50]"
    DEEP3D_DISK_WARN="Aviso: Deep3D analiza cada fotograma con una red neuronal. Puede tardar varios minutos por video."
    DEEP3D_CHECK="Verificando Deep3D..."
    DEEP3D_FOUND="Deep3D encontrado"
    DEEP3D_NOT_FOUND="Deep3D no encontrado"
    DEEP3D_INSTALLING="Clonando Deep3D e instalando dependencias en el entorno virtual..."
    DEEP3D_INSTALL_FAIL="No se pudo instalar Deep3D. Verifique la conexión y git."
    DEEP3D_STEP_ANALYZE="Analizando geometría del video (pase 1/3)"
    DEEP3D_STEP_RECTIFY="Rectificando video (pase 2/3)"
    DEEP3D_STEP_ENCODE="Recodificando video estabilizado (pase 3/3)"
    AI_GPU_HINT="GPU con aceleración de hardware detectada para IA"
    AI_GPU_NONE="Sin GPU Vulkan — las herramientas de IA usarán CPU (más lento)"
    AI_GPU_USING="Usando GPU"
    VULKAN_TOOLS_WARN="vulkan-tools no encontrado — se recomienda instalarlo para identificar el GPU Vulkan con precisión"
    VULKAN_TOOLS_HINT="Instalar con: sudo apt install vulkan-tools"
    GPU_REQUIRED_LABEL="requiere GPU"
    AI_VULKAN_REQUIRED="Requiere GPU Vulkan (no disponible en este sistema)"
    AI_CUDA_REQUIRED="Requiere GPU CUDA (no disponible en este sistema)"
    CODEC_SELECT_LABEL="Códec de salida"
    CODEC_H264_OPTION="H.264 (AVC) — compatible con todos los reproductores"
    CODEC_H265_OPTION="H.265 (HEVC) — archivos ~40% más pequeños, requiere reproductores modernos"
    CODEC_H265_NO_GPU="Codificador GPU H.265 no disponible — se usará CPU (libx265)"
    CODEC_H265_NO_ENC="H.265 (libx265) no disponible en este FFmpeg — se usará H.264"
    ACTION_H265="Convertir a H.265 (HEVC)"
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
    GPU_USE_PROMPT="Use GPU acceleration for H.264 encoding? [Y/n]"
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
    ACTION_H264="Convert to H.264"
    ACTION_STAB="Video stabilization (vid.stab, two-pass)"
    TARGET_FPS_PROMPT="Target FPS [60/90/120 or custom value]"
    SHAKINESS_LABEL="Shakiness level to detect [1-10]"
    ACCURACY_LABEL="Analysis accuracy [1-15]"
    SMOOTHING_LABEL="Stabilization smoothing [0-100]"
    STAB_MODE_LABEL="Stabilization mode"
    STAB_MODE_STANDARD="Standard (handheld)"
    STAB_MODE_CONCERT="Concert / flash-safe (strict rotation cap)"
    STAB_CONCERT_INFO="Concert mode: shakiness=5 smoothing=50 maxangle=3° maxshift=30px"
    CONFIRM_PROMPT="Confirm and start processing? [y/n]"
    PROCESSING_TITLE="Processing videos"
    STEP_CROPDETECT="Detecting black bars"
    STEP_VIDSTABDETECT="Analyzing motion (pass 1/2)"
    STEP_ENCODE="Encoding"
    STEP_COPY="Copying to output"
    STEP_DONE="done"
    STEP_FAIL="FAILED"
    STEP_FINALIZING="Finalizing..."
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
    OUTPUT_FOLDER_PROMPT="Output folder"
    CANCELLED="Cancelled."
    HDR_DETECT="Detecting HDR/color profile..."
    HDR_FOUND_HDR10="HDR10 source detected — applying tone-mapping to SDR BT.709"
    HDR_FOUND_HLG="HLG source detected — applying tone-mapping to SDR BT.709"
    HDR_FOUND_DV="Dolby Vision source detected — applying HDR10 tone-mapping fallback"
    HDR_FOUND_10BIT="10-bit SDR source detected — converting to 8-bit BT.709"
    ZSCALE_NOT_FOUND="zscale filter not available — skipping HDR color conversion (install libzimg for best results)"
    ZSCALE_FALLBACK_COLORSPACE="zscale not available — using colorspace filter for basic HDR→SDR conversion (install libzimg for full tone-mapping)"
    STEP_PREPROCESS="Pre-converting to H.264 SDR intermediate"
    BG_PROMPT="Run in background (process survives terminal close)? [y/n]"
    BG_STARTED="Background processing started"
    BG_PID_LABEL="PID"
    BG_LOG_LABEL="Log"
    BG_MONITOR_TIP="Monitor progress with: tail -f"
    ACTION_DENOISE="Denoise video (hqdn3d)"
    ACTION_SHARPEN="Sharpen (unsharp mask)"
    ACTION_UPSCALE="Upscale resolution (scale+lanczos)"
    ACTION_COLOR="Color & contrast boost (eq)"
    DENOISE_LUMA_S_LABEL="Luma spatial strength [0-10]"
    DENOISE_CHROMA_S_LABEL="Chroma spatial strength [0-10]"
    DENOISE_LUMA_T_LABEL="Luma temporal strength [0-10]"
    DENOISE_CHROMA_T_LABEL="Chroma temporal strength [0-10]"
    SHARPEN_MATRIX_LABEL="Matrix size (odd, 3-23)"
    SHARPEN_LUMA_AMOUNT_LABEL="Luma amount [-2.0 to 5.0]"
    SHARPEN_CHROMA_AMOUNT_LABEL="Chroma amount [-2.0 to 5.0]"
    UPSCALE_TARGET_LABEL="Target resolution [720, 1080, 1440, 2160 or WxH]"
    UPSCALE_SKIP_MSG="Already at or above target resolution, skipping upscale"
    COLOR_CONTRAST_LABEL="Contrast [0.0-2.0, 1.0=neutral]"
    COLOR_BRIGHTNESS_LABEL="Brightness [-1.0 to 1.0, 0.0=neutral]"
    COLOR_SATURATION_LABEL="Saturation [0.0-2.0, 1.0=neutral]"
    COLOR_GAMMA_LABEL="Gamma [0.1-10.0, 1.0=neutral]"
    ACTION_RIFE="Interpolate FPS — AI (rife-ncnn-vulkan)"
    RIFE_MULTIPLIER_PROMPT="FPS multiplier [2/4/8]"
    RIFE_DISK_WARN="Note: RIFE extracts all frames to /tmp (~1-2 GB per minute of 1080p). Make sure /tmp has enough space."
    RIFE_CHECK="Checking rife-ncnn-vulkan..."
    RIFE_FOUND="rife-ncnn-vulkan found"
    RIFE_NOT_FOUND="rife-ncnn-vulkan not found"
    RIFE_DOWNLOADING="Downloading rife-ncnn-vulkan from GitHub..."
    RIFE_DOWNLOAD_FAIL="Could not determine RIFE download URL. Please install manually."
    RIFE_UNZIP_MISSING="unzip not available — cannot extract RIFE archive (install with: sudo apt install unzip)"
    RIFE_STEP_EXTRACT="Extracting frames"
    RIFE_STEP_INTERP="Interpolating frames (RIFE)"
    RIFE_STEP_ENCODE="Re-encoding interpolated video"
    RIFE_MPG_PRECONVERT="Pre-converting MPG/MPEG to MP4 for RIFE interpolation"
    BTBN_REQUIRED_MSG="System FFmpeg is no longer supported. This script requires BtbN FFmpeg (GPU-capable static build)."
    BTBN_REQUIRED_TITLE="Why BtbN FFmpeg is required:"
    BTBN_REQUIRED_REASON="BtbN builds include NVENC/VAAPI and all CPU filters (vidstab, zscale, etc.) in a single portable static binary."
    BTBN_DOWNLOAD_PROMPT="Download BtbN FFmpeg automatically?"
    BTBN_DECLINED_MSG="BtbN FFmpeg is required to run this script. Download it at: https://github.com/BtbN/FFmpeg-Builds/releases"
    ACTION_DOWNSIZE="Downsize resolution (scale+lanczos)"
    DOWNSIZE_TARGET_LABEL="Maximum resolution [480, 720, 1080, 1440, 2160 or WxH]"
    DOWNSIZE_SKIP_MSG="Already at or below target resolution, skipping downsize"
    ACTION_VIDEO2X="Upscale — AI (Real-ESRGAN)"
    VIDEO2X_SCALE_PROMPT="Scale factor [2/4]"
    VIDEO2X_MODEL_PROMPT="Model [realesr-animevideov3 / realesrgan-x4plus / realesr-general-x4v3]"
    VIDEO2X_DISK_WARN="Note: Real-ESRGAN extracts all frames to /tmp (~1-2 GB per minute of 1080p). Requires a Vulkan GPU."
    VIDEO2X_CHECK="Checking realesrgan-ncnn-vulkan..."
    VIDEO2X_FOUND="realesrgan-ncnn-vulkan found"
    VIDEO2X_NOT_FOUND="realesrgan-ncnn-vulkan not found"
    VIDEO2X_DOWNLOADING="Downloading realesrgan-ncnn-vulkan from GitHub..."
    VIDEO2X_DOWNLOAD_FAIL="Could not determine download URL. Please install realesrgan-ncnn-vulkan manually."
    VIDEO2X_STEP_EXTRACT="Extracting frames"
    VIDEO2X_STEP_UPSCALE="AI upscaling (Real-ESRGAN)"
    VIDEO2X_STEP_ENCODE="Re-encoding upscaled video"
    VIDEO2X_MPG_PRECONVERT="Pre-converting MPG/MPEG to MP4 for AI upscaling"
    ACTION_DEEP3D="Stabilize — AI (Deep3D)"
    DEEP3D_STABILITY_LABEL="Stability level [1-50]"
    DEEP3D_DISK_WARN="Note: Deep3D runs a neural network per frame. May take several minutes per video."
    DEEP3D_CHECK="Checking Deep3D..."
    DEEP3D_FOUND="Deep3D found"
    DEEP3D_NOT_FOUND="Deep3D not found"
    DEEP3D_INSTALLING="Cloning Deep3D and installing dependencies into venv..."
    DEEP3D_INSTALL_FAIL="Could not install Deep3D. Check internet connection and git."
    DEEP3D_STEP_ANALYZE="Analyzing video geometry (pass 1/3)"
    DEEP3D_STEP_RECTIFY="Rectifying video (pass 2/3)"
    DEEP3D_STEP_ENCODE="Re-encoding stabilized video (pass 3/3)"
    AI_GPU_HINT="Hardware-accelerated GPU detected for AI processing"
    AI_GPU_NONE="No Vulkan GPU detected — AI tools will run on CPU (slower)"
    AI_GPU_USING="Using GPU"
    VULKAN_TOOLS_WARN="vulkan-tools not found — install it for accurate Vulkan GPU identification"
    VULKAN_TOOLS_HINT="Install with: sudo apt install vulkan-tools"
    GPU_REQUIRED_LABEL="requires GPU"
    AI_VULKAN_REQUIRED="Requires Vulkan GPU (not available on this system)"
    AI_CUDA_REQUIRED="Requires CUDA GPU (not available on this system)"
    CODEC_SELECT_LABEL="Output codec"
    CODEC_H264_OPTION="H.264 (AVC) — compatible with all players"
    CODEC_H265_OPTION="H.265 (HEVC) — ~40% smaller files, requires modern players"
    CODEC_H265_NO_GPU="H.265 GPU encoder not available — using CPU (libx265)"
    CODEC_H265_NO_ENC="H.265 (libx265) not available in this FFmpeg build — falling back to H.264"
    ACTION_H265="Convert to H.265 (HEVC)"
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
_CB_DISABLED=()
_CB_CURSOR=0
SELECTED_INDICES=()

_cb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local is_dis="${_CB_DISABLED[$j]:-0}"
    local checkbox pointer label_str

    if [[ "${is_dis}" -eq 1 ]]; then
      checkbox="$(clr_dim '[—]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_dim '▶')"
        label_str="$(clr_dim "${lbl} [${GPU_REQUIRED_LABEL}]")"
      else
        pointer=" "
        label_str="$(clr_dim "${lbl} [${GPU_REQUIRED_LABEL}]")"
      fi
    elif [[ "${is_sel}" -eq 1 ]]; then
      checkbox="$(clr_bold_cyan '[✓]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "
        label_str="${lbl}"
      fi
    else
      checkbox="$(clr_dim '[ ]')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"
        label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "
        label_str="${lbl}"
      fi
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
      if [[ "${_CB_DISABLED[$_CB_CURSOR]:-0}" -eq 0 ]]; then
        _CB_SEL[$_CB_CURSOR]=$(( 1 - _CB_SEL[$_CB_CURSOR] ))
        printf "\033[%dA" "${num}"; _cb_render
      fi
      continue
    fi
    if [[ "${key}" == 'a' || "${key}" == 'A' ]]; then
      for ((i=0; i<num; i++)); do [[ "${_CB_DISABLED[$i]:-0}" -eq 0 ]] && _CB_SEL[$i]=1; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
    if [[ "${key}" == 'n' || "${key}" == 'N' ]]; then
      for ((i=0; i<num; i++)); do [[ "${_CB_DISABLED[$i]:-0}" -eq 0 ]] && _CB_SEL[$i]=0; done
      printf "\033[%dA" "${num}"; _cb_render; continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); fi
  done
}

# ── Interactive radio button ──────────────────────────────────────────────────
# Like interactive_checkbox but single-select. Uses same _CB_LABELS / _CB_SEL globals.
# Set exactly one entry in _CB_SEL to 1 before calling to set the default.
# Result: SELECTED_INDICES[0] holds the chosen index.

_rb_render() {
  local j num="${#_CB_LABELS[@]}"
  for ((j=0; j<num; j++)); do
    local lbl="${_CB_LABELS[$j]}"
    local is_sel="${_CB_SEL[$j]}"
    local radio pointer label_str
    if [[ "${is_sel}" -eq 1 ]]; then
      radio="$(clr_bold_cyan '(●)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="${lbl}"
      fi
    else
      radio="$(clr_dim '(○)')"
      if [[ $j -eq $_CB_CURSOR ]]; then
        pointer="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        pointer=" "; label_str="$(clr_dim "${lbl}")"
      fi
    fi
    printf "  %s %s %s\n" "${pointer}" "${radio}" "${label_str}"
  done
}

interactive_radio() {
  local num="${#_CB_LABELS[@]}"
  _CB_CURSOR=0
  local i
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then _CB_CURSOR=$i; break; fi
  done

  _rb_render
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
          printf "\033[%dA" "${num}"; _rb_render
        elif [[ "${key}" == 'B' ]]; then
          _CB_CURSOR=$(( (_CB_CURSOR + 1) % num ))
          printf "\033[%dA" "${num}"; _rb_render
        fi
      fi
      continue
    fi

    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi

    if [[ "${key}" == ' ' ]]; then
      for ((i=0; i<num; i++)); do _CB_SEL[$i]=0; done
      _CB_SEL[$_CB_CURSOR]=1
      printf "\033[%dA" "${num}"; _rb_render
      continue
    fi
  done

  printf '\033[?25h'; echo ""

  SELECTED_INDICES=()
  for ((i=0; i<num; i++)); do
    if [[ "${_CB_SEL[$i]}" -eq 1 ]]; then SELECTED_INDICES+=("$i"); break; fi
  done
}

# ── Background mode / logging ─────────────────────────────────────────────────

BG_MODE=0
LOG_FILE=""

# ── Quality enhancement globals ───────────────────────────────────────────────

DO_DENOISE=0
DENOISE_LUMA_S=4; DENOISE_CHROMA_S=4; DENOISE_LUMA_T=3; DENOISE_CHROMA_T=3
DO_SHARPEN=0
SHARPEN_MATRIX=5; SHARPEN_LUMA_AMOUNT=1.0; SHARPEN_CHROMA_AMOUNT=0.0
DO_UPSCALE=0
UPSCALE_TARGET_W=1920; UPSCALE_TARGET_H=1080
DO_DOWNSIZE=0
DOWNSIZE_TARGET_W=1920; DOWNSIZE_TARGET_H=1080
DO_COLOR=0
COLOR_CONTRAST=1.1; COLOR_BRIGHTNESS=0.0; COLOR_SATURATION=1.1; COLOR_GAMMA=1.0

# ── RIFE globals ──────────────────────────────────────────────────────────────

DO_RIFE=0
RIFE_MULTIPLIER=2
RIFE_BIN="rife-ncnn-vulkan"
RIFE_LOCAL_DIR="${HOME}/.local/share/edit-videos/rife"
RIFE_MODEL="rife-v4.6"

# ── Video2X globals ───────────────────────────────────────────────────────────

DO_VIDEO2X=0
VIDEO2X_SCALE=2
VIDEO2X_MODEL="realesr-animevideov3"
VIDEO2X_BIN="realesrgan-ncnn-vulkan"
VIDEO2X_LOCAL_DIR="${HOME}/.local/share/edit-videos/realesrgan"

# ── Deep3D globals ────────────────────────────────────────────────────────────

DO_DEEP3D=0
DEEP3D_STABILITY=12
DEEP3D_DEVICE="cpu"
DEEP3D_GPU_NAME=""
DEEP3D_DIR="${HOME}/.local/share/edit-videos/deep3d"
DEEP3D_PYTHON="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)/venv/bin/python"

# ── GPU Detection ─────────────────────────────────────────────────────────────

USE_H265=0
GPU_ENCODER=""
GPU_LABEL=""
VULKAN_GPU_LABEL=""
HAS_VULKAN_GPU=0
HAS_CUDA_GPU=0

_has_encoder() {
  # Tests whether a given ffmpeg binary supports an encoder.
  # Uses a captured variable to avoid pipefail false-negatives
  # (ffmpeg -encoders exits non-zero; with pipefail that would mask grep's result).
  local bin="$1" encoder="$2" encoder_list
  encoder_list="$("${bin}" -hide_banner -encoders 2>/dev/null || true)"
  grep -q "${encoder}" <<< "${encoder_list}" || return 1
}

_switch_to_system_ffmpeg_or_redownload() {
  # The cached binary lacks NVENC/VAAPI.  Offer to re-download a GPU-capable
  # BtbN build.  System ffmpeg is no longer a supported fallback.
  local btbn_asset; btbn_asset="$(_btbn_asset)"
  if [[ -n "${btbn_asset}" ]]; then
    printf "  %s  %s\n" "$(clr_bold_yellow '⚠')" \
      "$(clr_yellow "Cached FFmpeg build lacks GPU encoders.")"
    printf "  %s [y/n] (y): " "$(clr_bold "Re-download a GPU-capable BtbN FFmpeg build?")"
    local _ans; read -r _ans; _ans="${_ans:-y}"
    if [[ "${_ans,,}" == y* ]]; then
      bootstrap_ffmpeg
      return 0
    fi
  fi
  # User declined re-download: disable GPU encoding rather than fall back to system ffmpeg.
  printf "  %s  %s\n" "$(clr_bold_yellow '⚠')" \
    "$(clr_yellow "GPU encoding disabled — BtbN FFmpeg required for hardware acceleration.")"
  GPU_ENCODER=""
  return 1
}

detect_gpu() {
  printf "  %s\n" "$(clr_dim "${GPU_DETECT}")"

  # NVIDIA NVENC — check nvidia-smi then find an ffmpeg with h264_nvenc
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    local gpu_name
    gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | xargs 2>/dev/null || true)"
    # Check current FFMPEG_BIN first; fall back to system ffmpeg if needed.
    local _nvenc_ok=0
    if _has_encoder "${FFMPEG_BIN}" 'h264_nvenc'; then
      _nvenc_ok=1
    elif command -v ffmpeg &>/dev/null && _has_encoder ffmpeg 'h264_nvenc'; then
      _switch_to_system_ffmpeg_or_redownload
      # After re-download FFMPEG_BIN may have changed; either way GPU is available.
      _nvenc_ok=1
    fi
    if [[ "${_nvenc_ok}" -eq 1 ]]; then
      GPU_ENCODER="h264_nvenc"
      GPU_LABEL="NVIDIA ${gpu_name} (h264_nvenc)"
      printf "  %s %s: %s\n" "$(clr_bold_green '✓')" "${GPU_FOUND_MSG}" "$(clr_cyan "${GPU_LABEL}")"
      return 0
    fi
  fi

  # VA-API — AMD / Intel on Linux
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

_VULKAN_TOOLS_WARNED=0

detect_vulkan_gpus() {
  # Populates VULKAN_GPU_LABEL with the primary Vulkan-capable GPU name.
  # Idempotent — skips detection if already set.
  [[ -n "${VULKAN_GPU_LABEL}" ]] && return 0

  # Warn once if vulkan-tools is missing (vulkaninfo is the most reliable probe)
  if ! command -v vulkaninfo &>/dev/null && [[ "${_VULKAN_TOOLS_WARNED}" -eq 0 ]]; then
    _VULKAN_TOOLS_WARNED=1
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${VULKAN_TOOLS_WARN}")"
    printf "  %s\n\n" "$(clr_dim "${VULKAN_TOOLS_HINT}")"
  fi

  # Try vulkaninfo first (most accurate — enumerates all Vulkan devices)
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

  # NVIDIA fallback via nvidia-smi
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    local gpu_name
    gpu_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
      | head -1 | xargs 2>/dev/null)"
    if [[ -n "${gpu_name}" ]]; then
      VULKAN_GPU_LABEL="${gpu_name} (NVIDIA Vulkan)"
      return 0
    fi
  fi

  # AMD / Intel — sysfs DRM node
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

# ── FFmpeg binary bootstrap ───────────────────────────────────────────────────
# Downloads a GPU-capable static FFmpeg build from BtbN/FFmpeg-Builds (GitHub)
# for x86_64 and arm64.
# BtbN builds include NVENC/VAAPI + all CPU filters (vidstab, zscale, etc.).
# NVENC uses dlopen() at runtime — no CUDA headers needed at build time.

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

# Returns the BtbN asset name for the current arch, or empty if unsupported.
_btbn_asset() {
  case "$(_arch_tag)" in
    amd64) echo "ffmpeg-master-latest-linux64-gpl.tar.xz" ;;
    arm64) echo "ffmpeg-master-latest-linuxarm64-gpl.tar.xz" ;;
    *)     echo "" ;;
  esac
}

_download_file() {
  local url="$1" dest="$2"
  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "${dest}" "${url}"
  elif command -v curl &>/dev/null; then
    curl -L --progress-bar -o "${dest}" "${url}"
  else
    printf "  %s Neither wget nor curl found — cannot download.\n" "$(clr_bold_red '✗')"
    return 1
  fi
}

bootstrap_ffmpeg() {
  local arch; arch="$(_arch_tag)"
  if [[ -z "${arch}" ]]; then
    printf "  %s Unknown CPU architecture — cannot auto-download FFmpeg.\n" "$(clr_bold_red '✗')"
    exit 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/ffmpeg.tar.xz"
  local source_label url btbn_bin_subdir=""

  # ── BtbN: GPU-capable (NVENC/VAAPI) + all CPU filters ───────────────────
  local btbn_asset; btbn_asset="$(_btbn_asset)"
  if [[ -z "${btbn_asset}" ]]; then
    printf "  %s No prebuilt FFmpeg available for arch %s.\n" "$(clr_bold_red '✗')" "${arch}"
    rm -rf "${tmp_dir}"; exit 1
  fi
  url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${btbn_asset}"
  source_label="BtbN/FFmpeg-Builds (GPU-capable)"
  btbn_bin_subdir="bin"   # BtbN puts binaries under <extracted>/bin/

  printf "  %s\n" "$(clr_dim "Downloading static FFmpeg (${source_label}) for ${arch}...")"

  if ! _download_file "${url}" "${archive}"; then
    printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; exit 1
  fi

  mkdir -p "${FFMPEG_LOCAL_DIR}"
  tar -xf "${archive}" -C "${tmp_dir}"
  local extracted_dir; extracted_dir="$(find "${tmp_dir}" -maxdepth 1 -mindepth 1 -type d | head -1)"

  # BtbN: binaries in <dir>/bin/
  local src_bin_dir="${extracted_dir}"
  if [[ -n "${btbn_bin_subdir}" && -f "${extracted_dir}/${btbn_bin_subdir}/ffmpeg" ]]; then
    src_bin_dir="${extracted_dir}/${btbn_bin_subdir}"
  fi

  cp "${src_bin_dir}/ffmpeg"  "${FFMPEG_LOCAL_DIR}/ffmpeg"
  cp "${src_bin_dir}/ffprobe" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true
  chmod +x "${FFMPEG_LOCAL_DIR}/ffmpeg" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
  FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
  printf "  %s FFmpeg installed to %s (%s)\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${FFMPEG_LOCAL_DIR}")" "$(clr_dim "${source_label}")"
}

# ── RIFE (rife-ncnn-vulkan) helpers ──────────────────────────────────────────

check_rife() {
  if [[ -x "${RIFE_LOCAL_DIR}/rife-ncnn-vulkan" ]]; then
    RIFE_BIN="${RIFE_LOCAL_DIR}/rife-ncnn-vulkan"
    return 0
  fi
  if command -v rife-ncnn-vulkan &>/dev/null; then
    RIFE_BIN="rife-ncnn-vulkan"
    return 0
  fi
  return 1
}

find_rife_model() {
  local preferred=("rife-v4.6" "rife-v4.4" "rife-v4.3" "rife-v4" "rife-v3.9" "rife-v2.4" "rife-v2.3" "rife-v2")
  for m in "${preferred[@]}"; do
    if [[ -d "${RIFE_LOCAL_DIR}/${m}" ]]; then
      RIFE_MODEL="${m}"
      return 0
    fi
  done
  local found; found="$(find "${RIFE_LOCAL_DIR}" -maxdepth 1 -type d -name 'rife-v*' 2>/dev/null | sort -V | tail -1)"
  if [[ -n "${found}" ]]; then
    RIFE_MODEL="$(basename "${found}")"
    return 0
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
  local dl_url=""
  if command -v curl &>/dev/null; then
    dl_url="$(curl -sL "${api_url}" | grep -o '"browser_download_url":"[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
    [[ -z "${dl_url}" ]] && dl_url="$(curl -sL "${api_url}" | grep -o '"browser_download_url": "[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
  elif command -v wget &>/dev/null; then
    dl_url="$(wget -qO- "${api_url}" | grep -o '"browser_download_url":"[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
    [[ -z "${dl_url}" ]] && dl_url="$(wget -qO- "${api_url}" | grep -o '"browser_download_url": "[^"]*\(linux\|ubuntu\)[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
  fi

  if [[ -z "${dl_url}" ]]; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${RIFE_DOWNLOAD_FAIL}"
    return 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/rife.zip"

  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "${archive}" "${dl_url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }
  else
    curl -L --progress-bar -o "${archive}" "${dl_url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }
  fi

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

run_rife_step() {
  # Args: label in_dir out_dir multiplier
  local label="$1" in_dir="$2" out_dir="$3" multiplier="$4"
  printf "    %s\n" "${label}..."

  local in_count; in_count="$(find "${in_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l)"
  local expected_out=$(( in_count * multiplier ))

  local rife_model_path
  if [[ "${RIFE_BIN}" == "${RIFE_LOCAL_DIR}/rife-ncnn-vulkan" ]]; then
    rife_model_path="${RIFE_LOCAL_DIR}/${RIFE_MODEL}"
  else
    rife_model_path="${RIFE_MODEL}"
  fi

  "${RIFE_BIN}" -i "${in_dir}" -o "${out_dir}" -n "${expected_out}" -m "${rife_model_path}" >> "${LOG_FILE}" 2>&1 &
  local rife_pid=$!
  local step_start=$SECONDS

  printf '\033[?25l'
  local spin_idx=0 bar_width=25
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

  while kill -0 "${rife_pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local out_count; out_count="$(find "${out_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l || echo 0)"

    if [[ "${expected_out}" -gt 0 && "${out_count}" -gt 0 ]]; then
      local pct=$(( out_count * 100 / expected_out ))
      [[ "${pct}" -gt 99 ]] && pct=99
      local filled=$(( pct * bar_width / 100 ))
      local empty=$(( bar_width - filled ))
      local bar="" i
      for ((i=0; i<filled; i++)); do bar+="█"; done
      for ((i=0; i<empty;  i++)); do bar+="░"; done
      local eta_str=""
      if [[ "${pct}" -ge 1 && "${elapsed}" -gt 0 ]]; then
        local remaining=$(( elapsed * (100 - pct) / pct ))
        eta_str="  ETA ~$(_fmt_time "${remaining}")"
      fi
      printf "\r    [%s] %3d%%  %s%s\033[K" \
        "$(clr_cyan "${bar}")" "${pct}" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${eta_str}")"
    else
      printf "\r    %s  %s\033[K" \
        "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")"
      spin_idx=$(( spin_idx + 1 ))
    fi
    sleep 0.3
  done

  wait "${rife_pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"

  if [[ "${ec}" -eq 0 ]]; then
    local bar="" i
    for ((i=0; i<bar_width; i++)); do bar+="█"; done
    printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
    return 0
  else
    printf "\r\033[K"
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
    return "${ec}"
  fi
}

# ── Video2X (video2x AppImage) helpers ───────────────────────────────────────

check_video2x() {
  if [[ -x "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" ]]; then
    # Treat a local install without a models directory as incomplete so the
    # bootstrap prompt re-runs and downloads the full bundle (binary + models).
    if [[ ! -d "${VIDEO2X_LOCAL_DIR}/models" ]]; then
      return 1
    fi
    VIDEO2X_BIN="${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan"
    return 0
  fi
  if command -v realesrgan-ncnn-vulkan &>/dev/null; then
    VIDEO2X_BIN="realesrgan-ncnn-vulkan"
    return 0
  fi
  return 1
}

bootstrap_video2x() {
  if ! command -v unzip &>/dev/null; then
    printf "  %s unzip not available — cannot extract archive (install with: sudo apt install unzip)\n" "$(clr_bold_red '✗')"
    return 1
  fi

  printf "  %s\n" "$(clr_dim "${VIDEO2X_DOWNLOADING}")"

  # xinntao/Real-ESRGAN releases bundle both the binary and model files;
  # xinntao/Real-ESRGAN-ncnn-vulkan releases ship the binary only (no models).
  local api_url="https://api.github.com/repos/xinntao/Real-ESRGAN/releases"
  local dl_url=""
  local _fetch=""
  if command -v curl &>/dev/null; then
    _fetch="$(curl -sL "${api_url}")"
  elif command -v wget &>/dev/null; then
    _fetch="$(wget -qO- "${api_url}")"
  fi

  if [[ -n "${_fetch}" ]]; then
    dl_url="$(printf '%s' "${_fetch}" | grep -o '"browser_download_url":"[^"]*ncnn-vulkan[^"]*ubuntu[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
    [[ -z "${dl_url}" ]] && dl_url="$(printf '%s' "${_fetch}" | grep -o '"browser_download_url": "[^"]*ncnn-vulkan[^"]*ubuntu[^"]*\.zip"' | head -1 | cut -d'"' -f4)"
  fi

  if [[ -z "${dl_url}" ]]; then
    printf "  %s %s\n" "$(clr_bold_red '✗')" "${VIDEO2X_DOWNLOAD_FAIL}"
    return 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  local archive="${tmp_dir}/realesrgan.zip"

  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "${archive}" "${dl_url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }
  else
    curl -L --progress-bar -o "${archive}" "${dl_url}" || { printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }
  fi

  mkdir -p "${VIDEO2X_LOCAL_DIR}"
  unzip -q "${archive}" -d "${tmp_dir}/extracted" || { printf "  %s Extraction failed.\n" "$(clr_bold_red '✗')"; rm -rf "${tmp_dir}"; return 1; }

  # The zip may extract flat (binary + models/ at root) or into a single subdirectory.
  # Detect by checking whether the binary exists at the top level.
  local src_dir="${tmp_dir}/extracted"
  if [[ ! -f "${src_dir}/realesrgan-ncnn-vulkan" ]]; then
    local sub; sub="$(find "${src_dir}" -maxdepth 1 -mindepth 1 -type d | head -1)"
    [[ -n "${sub}" ]] && src_dir="${sub}"
  fi

  cp -r "${src_dir}/"* "${VIDEO2X_LOCAL_DIR}/" 2>/dev/null || true
  chmod +x "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  VIDEO2X_BIN="${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan"
  printf "  %s Real-ESRGAN installed to %s\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${VIDEO2X_LOCAL_DIR}")"
}

run_video2x_step() {
  # Args: label in_dir out_dir scale model expected_count
  local label="$1" in_dir="$2" out_dir="$3" scale="$4" model="$5" expected_out="$6"
  printf "    %s\n" "${label}..."

  local model_args=(-n "${model}" -s "${scale}")
  if [[ "${VIDEO2X_BIN}" == "${VIDEO2X_LOCAL_DIR}/realesrgan-ncnn-vulkan" && -d "${VIDEO2X_LOCAL_DIR}/models" ]]; then
    model_args+=(-m "${VIDEO2X_LOCAL_DIR}/models")
  fi

  "${VIDEO2X_BIN}" -i "${in_dir}" -o "${out_dir}" "${model_args[@]}" >> "${LOG_FILE}" 2>&1 &
  local esrgan_pid=$!
  local step_start=$SECONDS

  printf '\033[?25l'
  local spin_idx=0 bar_width=25
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

  while kill -0 "${esrgan_pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local out_count; out_count="$(find "${out_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l || echo 0)"

    if [[ "${expected_out}" -gt 0 && "${out_count}" -gt 0 ]]; then
      local pct=$(( out_count * 100 / expected_out ))
      [[ "${pct}" -gt 99 ]] && pct=99
      local filled=$(( pct * bar_width / 100 ))
      local empty=$(( bar_width - filled ))
      local bar="" i
      for ((i=0; i<filled; i++)); do bar+="█"; done
      for ((i=0; i<empty;  i++)); do bar+="░"; done
      local eta_str=""
      if [[ "${pct}" -ge 1 && "${elapsed}" -gt 0 ]]; then
        local remaining=$(( elapsed * (100 - pct) / pct ))
        eta_str="  ETA ~$(_fmt_time "${remaining}")"
      fi
      printf "\r    [%s] %3d%%  %s%s\033[K" \
        "$(clr_cyan "${bar}")" "${pct}" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${eta_str}")"
    else
      printf "\r    %s  %s\033[K" \
        "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")"
      spin_idx=$(( spin_idx + 1 ))
    fi
    sleep 0.3
  done

  wait "${esrgan_pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"

  if [[ "${ec}" -eq 0 ]]; then
    local bar="" i
    for ((i=0; i<bar_width; i++)); do bar+="█"; done
    printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
    return 0
  else
    printf "\r\033[K"
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
    return "${ec}"
  fi
}

# ── Deep3D helpers ────────────────────────────────────────────────────────────

check_deep3d() {
  [[ ! -f "${DEEP3D_DIR}/geometry_optimizer.py" ]] && return 1
  [[ ! -f "${DEEP3D_DIR}/rectify.py" ]]            && return 1
  [[ ! -x "${DEEP3D_PYTHON}" ]]                    && return 1
  "${DEEP3D_PYTHON}" -c "import torch, cv2, tqdm, path, imageio, scipy, skimage" &>/dev/null || return 1
  # When a CUDA GPU is present, torch must have been compiled with CUDA support.
  if [[ "${HAS_CUDA_GPU:-0}" -eq 1 ]]; then
    "${DEEP3D_PYTHON}" -c "import torch; assert torch.cuda.is_available()" &>/dev/null || return 1
  fi
  return 0
}

bootstrap_deep3d() {
  if ! command -v git &>/dev/null; then
    printf "  %s git not found — cannot clone Deep3D repository.\n" "$(clr_bold_red '✗')"
    return 1
  fi

  if [[ ! -x "${DEEP3D_PYTHON}" ]]; then
    printf "  %s Python venv not found at: %s\n" "$(clr_bold_red '✗')" "$(clr_dim "${DEEP3D_PYTHON}")"
    local _venv_dir; _venv_dir="$(dirname "$(dirname "${DEEP3D_PYTHON}")")"
    printf "  %s Create it first: python3 -m venv %s\n" "$(clr_dim 'Hint:')" "$(clr_cyan "${_venv_dir}")"
    return 1
  fi

  printf "  %s\n" "$(clr_dim "${DEEP3D_INSTALLING}")"

  # 1. Clone repo
  if [[ ! -f "${DEEP3D_DIR}/geometry_optimizer.py" ]]; then
    mkdir -p "$(dirname "${DEEP3D_DIR}")"
    git clone --depth=1 https://github.com/yaochih/Deep3D-Stabilizer-release "${DEEP3D_DIR}" 2>&1 | \
      while IFS= read -r _line; do printf "  %s\n" "$(clr_dim "${_line}")"; done
    if [[ ! -f "${DEEP3D_DIR}/geometry_optimizer.py" ]]; then
      printf "  %s Failed to clone Deep3D repository.\n" "$(clr_bold_red '✗')"
      return 1
    fi
  fi

  # 2. Copy OpenCV flow helper into repo (replaces PWC-Net python2 step)
  local _script_dir; _script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
  if [[ -f "${_script_dir}/deep3d_flow_cv.py" ]]; then
    cp "${_script_dir}/deep3d_flow_cv.py" "${DEEP3D_DIR}/deep3d_flow_cv.py"
  else
    printf "  %s deep3d_flow_cv.py not found next to edit-videos.sh\n" "$(clr_bold_red '✗')"
    return 1
  fi

  # 3. Patch generate_flows() in sequence_io.py to use OpenCV instead of python2+PWC-Net
  local _patch_script; _patch_script="$(mktemp /tmp/deep3d_patch_XXXXXX.py)"
  cat > "${_patch_script}" << 'PYEOF'
import re, sys

path = sys.argv[1]
with open(path) as f:
    content = f.read()

old_method = r'    def generate_flows\(self\):.*?(?=\n    def )'
new_method = """    def generate_flows(self):
        # OpenCV Farneback optical flow — replaces PWC-Net (no python2/CUDA 8 required)
        import sys as _sys
        _script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deep3d_flow_cv.py')
        print('=> preparing optical flow using OpenCV Farneback...')
        for i in self.opt.intervals:
            ret = os.system('{} \"{}\" --output_dir \"{}\" --interval {}'.format(
                _sys.executable, _script, str(self.root), i))
        assert ret == 0, 'Failed to compute optical flow. Check OpenCV installation.'
"""
content = re.sub(old_method, new_method, content, flags=re.DOTALL)
with open(path, 'w') as f:
    f.write(content)
print('sequence_io.py patched successfully')
PYEOF

  if ! python3 "${_patch_script}" "${DEEP3D_DIR}/sequence_io.py"; then
    printf "  %s Failed to patch sequence_io.py\n" "$(clr_bold_red '✗')"
    rm -f "${_patch_script}"; return 1
  fi
  rm -f "${_patch_script}"

  # 4. Install Python dependencies into venv
  # Auto-detect CUDA version (e.g. 12.8 → cu128) and use the matching torch wheel.
  local _torch_index="https://download.pytorch.org/whl/cpu"
  local _torch_label="CPU"
  local _cuda_ver=""
  if command -v nvcc &>/dev/null; then
    _cuda_ver="$(nvcc --version 2>/dev/null | grep -oP 'release \K[0-9]+\.[0-9]+')"
  elif command -v nvidia-smi &>/dev/null; then
    _cuda_ver="$(nvidia-smi 2>/dev/null | grep -oP 'CUDA Version: \K[0-9]+\.[0-9]+')"
  fi
  if [[ -n "${_cuda_ver}" ]]; then
    # Convert "12.8" → "cu128"
    local _cu_tag; _cu_tag="cu$(echo "${_cuda_ver}" | tr -d '.')"
    _torch_index="https://download.pytorch.org/whl/${_cu_tag}"
    _torch_label="CUDA ${_cuda_ver} (${_cu_tag})"
  fi
  printf "  %s\n" "$(clr_dim "Installing PyTorch (${_torch_label}) — this may take a few minutes...")"
  # If CUDA is needed but the existing torch is CPU-only, force a reinstall so the
  # CUDA-enabled wheels replace the CPU build already present in the venv.
  local _torch_pip_flags=(--quiet)
  if [[ -n "${_cuda_ver}" ]]; then
    if ! "${DEEP3D_PYTHON}" -c "import torch; assert torch.cuda.is_available()" &>/dev/null; then
      _torch_pip_flags+=(--force-reinstall)
      printf "  %s\n" "$(clr_dim "CPU-only torch detected in venv — reinstalling with CUDA support...")"
    fi
  fi
  "${DEEP3D_PYTHON}" -m pip install "${_torch_pip_flags[@]}" torch torchvision \
    --extra-index-url "${_torch_index}" || {
    printf "  %s Failed to install PyTorch.\n" "$(clr_bold_red '✗')"; return 1
  }
  printf "  %s\n" "$(clr_dim "Installing opencv-python, scipy, tqdm, imageio, scikit-image, path...")"
  "${DEEP3D_PYTHON}" -m pip install --quiet \
    "opencv-python>=4.5" scipy tqdm imageio "scikit-image" path || {
    printf "  %s Failed to install dependencies.\n" "$(clr_bold_red '✗')"; return 1
  }

  printf "  %s Deep3D installed to %s\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${DEEP3D_DIR}")"
}

run_deep3d_step() {
  # Args: label dur_sec abs_input_path name python_script_basename [extra_args...]
  local label="$1" dur="${2:-0}" input_path="$3" name="$4" script="$5"
  shift 5
  local extra_args=("$@")

  printf "    %s\n" "${label}..."
  local step_start=$SECONDS

  local progress_tmp bar_width=25
  progress_tmp="$(mktemp)"

  (
    cd "${DEEP3D_DIR}"
    "${DEEP3D_PYTHON}" "${script}" "${input_path}" \
      --name "${name}" --output_dir "outputs" --cuda "${DEEP3D_DEVICE}" "${extra_args[@]}"
  ) > "${progress_tmp}" 2>&1 &
  local _d3d_pid=$!

  printf '\033[?25l'
  local spin_idx=0
  local spinners=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local _d3d_finalizing=0

  while kill -0 "${_d3d_pid}" 2>/dev/null; do
    local elapsed=$(( SECONDS - step_start ))
    local elapsed_str; elapsed_str="$(_fmt_time "${elapsed}")"
    local pct=-1

    # Parse "optical flow N/TOTAL" lines emitted by the Python scripts
    local flow_line
    flow_line="$(grep -o 'optical flow [0-9]*/[0-9]*' "${progress_tmp}" 2>/dev/null | tail -1 || true)"
    if [[ -n "${flow_line}" ]]; then
      local cur_flow total_flow
      cur_flow="${flow_line##*optical flow }"
      total_flow="${cur_flow##*/}"
      cur_flow="${cur_flow%%/*}"
      if [[ "${total_flow}" -gt 0 ]]; then
        if [[ "${cur_flow}" -ge "${total_flow}" ]]; then
          _d3d_finalizing=1
        else
          pct=$(( cur_flow * 100 / total_flow ))
        fi
      fi
    fi

    if [[ "${_d3d_finalizing}" -eq 1 ]]; then
      printf "\r    %s  %s  %s\033[K" \
        "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${STEP_FINALIZING}")"
      spin_idx=$(( spin_idx + 1 ))
    elif [[ "${pct}" -ge 0 ]]; then
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
      printf "\r    [%s] %3d%%  %s%s\033[K" \
        "$(clr_cyan "${bar}")" "${pct}" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${eta_str}")"
    else
      printf "\r    %s  %s\033[K" \
        "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")"
      spin_idx=$(( spin_idx + 1 ))
    fi
    sleep 0.3
  done

  wait "${_d3d_pid}"
  local ec=$?
  printf '\033[?25h'
  local total_elapsed=$(( SECONDS - step_start ))
  local total_str; total_str="$(_fmt_time "${total_elapsed}")"
  printf "\r\033[K"

  # Flush captured Python output to the log file
  cat "${progress_tmp}" >> "${LOG_FILE}" 2>/dev/null || true
  rm -f "${progress_tmp}"

  if [[ "${ec}" -eq 0 ]]; then
    local bar="" i
    for ((i=0; i<bar_width; i++)); do bar+="█"; done
    printf "\r    [%s] 100%%  %s\033[K\n" "$(clr_bold_green "${bar}")" "$(clr_dim "${total_str}")"
    printf "    %s\n" "$(clr_bold_green "✓ ${STEP_DONE}  (${total_str})")"
    return 0
  else
    printf "    %s\n" "$(clr_bold_red "✗ ${STEP_FAIL}  (${total_str})")"
    return "${ec}"
  fi
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

probe_dimensions() {
  # Outputs: "<width> <height>" of the first video stream.
  local input="$1"
  local w=0 h=0 info

  if [[ -x "${FFPROBE_BIN}" ]] || command -v ffprobe &>/dev/null; then
    local _ffprobe="${FFPROBE_BIN}"
    [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"
    info="$("${_ffprobe}" -v quiet -select_streams v:0 \
      -show_entries stream=width,height \
      -of default=noprint_wrappers=1 "${input}" 2>/dev/null)"
    w="$(grep 'width='  <<< "${info}" | cut -d= -f2 | tr -d '[:space:]')"
    h="$(grep 'height=' <<< "${info}" | cut -d= -f2 | tr -d '[:space:]')"
  fi

  if [[ -z "${w}" || "${w}" -eq 0 ]]; then
    info="$("${FFMPEG_BIN}" -i "${input}" 2>&1 || true)"
    if [[ "${info}" =~ [[:space:]]([0-9]+)x([0-9]+)[[:space:],] ]]; then
      w="${BASH_REMATCH[1]}"
      h="${BASH_REMATCH[2]}"
    fi
  fi

  echo "${w:-0} ${h:-0}"
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

  if [[ "${BG_MODE}" -eq 0 ]]; then
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
  else
    wait "${ffmpeg_pid}" || true
  fi

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
  local _ffmpeg_finalizing=0

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
        if [[ "${pct}" -ge 100 ]]; then
          _ffmpeg_finalizing=1
          pct=-1
        fi
      fi
    fi

    if [[ "${_ffmpeg_finalizing}" -eq 1 ]]; then
      printf "\r    %s  %s  %s\033[K" "$(clr_cyan "${spinners[$(( spin_idx % 10 ))]}")" "$(clr_dim "${elapsed_str}")" "$(clr_dim "${STEP_FINALIZING}")"
      spin_idx=$(( spin_idx + 1 ))
    elif [[ "${pct}" -ge 0 ]]; then
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
  local stab_maxangle="${14:-0.15}"
  local stab_maxshift="${15:-60}"
  local do_rife="${16:-0}"
  local rife_multiplier="${17:-2}"

  local trf_file=""
  local intermediate=""
  local src="${input}"
  local vf_chain=()

  # Probe duration so run_ffmpeg_step can show a percentage bar.
  local probe_out dur_sec=0
  probe_out="$(probe_video "${input}")"
  dur_sec="${probe_out%% *}"

  # ── Auto-detect HDR / 10-bit; prepend color conversion when re-encoding ──
  local do_any=$(( do_black_bars | do_fps | do_h264 | do_stab | DO_DENOISE | DO_SHARPEN | DO_UPSCALE | DO_DOWNSIZE | DO_COLOR | do_rife | DO_VIDEO2X | DO_DEEP3D ))
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
        printf "    %s %s\n" "$(clr_yellow '⚠')" "$(clr_dim "${ZSCALE_FALLBACK_COLORSPACE}")"
        # Without zscale/libzimg, use FFmpeg's built-in colorspace filter to
        # apply the BT.2020→BT.709 matrix and primaries conversion, plus a
        # BT.2020-10 gamma approximation (the closest SDR-compatible TRC that
        # the colorspace filter supports).
        # Note: the colorspace filter does NOT support PQ (smpte2084) or HLG
        # (arib-std-b67) as TRC values — those require zscale for proper
        # linearisation. iall=bt2020 sets itrc=bt2020-10 internally, which at
        # least makes the matrix math correct; the gamma will be approximate for
        # HDR10/HLG but is far better than the raw format=yuv420p path.
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

  # ── Downsize (before quality filters so they operate on the target resolution)
  if [[ "${DO_DOWNSIZE}" -eq 1 ]]; then
    local ds_dim_out ds_vid_w ds_vid_h
    ds_dim_out="$(probe_dimensions "${input}")"
    ds_vid_w="${ds_dim_out%% *}"
    ds_vid_h="${ds_dim_out##* }"
    if [[ "${ds_vid_w}" -le "${DOWNSIZE_TARGET_W}" && "${ds_vid_h}" -le "${DOWNSIZE_TARGET_H}" ]]; then
      printf "    %s %s (%sx%s ≤ %sx%s)\n" \
        "$(clr_dim '○')" "${DOWNSIZE_SKIP_MSG}" \
        "${ds_vid_w}" "${ds_vid_h}" "${DOWNSIZE_TARGET_W}" "${DOWNSIZE_TARGET_H}"
    else
      # Fit within target box (AR preserved), then round to even dimensions for H.264.
      vf_chain+=("scale=${DOWNSIZE_TARGET_W}:${DOWNSIZE_TARGET_H}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
    fi
  fi

  # ── Quality filters ────────────────────────────────────────────────────────
  if [[ "${DO_DENOISE}" -eq 1 ]]; then
    vf_chain+=("hqdn3d=${DENOISE_LUMA_S}:${DENOISE_CHROMA_S}:${DENOISE_LUMA_T}:${DENOISE_CHROMA_T}")
  fi

  if [[ "${DO_COLOR}" -eq 1 ]]; then
    vf_chain+=("eq=contrast=${COLOR_CONTRAST}:brightness=${COLOR_BRIGHTNESS}:saturation=${COLOR_SATURATION}:gamma=${COLOR_GAMMA}")
  fi

  if [[ "${DO_SHARPEN}" -eq 1 ]]; then
    vf_chain+=("unsharp=${SHARPEN_MATRIX}:${SHARPEN_MATRIX}:${SHARPEN_LUMA_AMOUNT}:${SHARPEN_MATRIX}:${SHARPEN_MATRIX}:${SHARPEN_CHROMA_AMOUNT}")
  fi

  # Skip lanczos upscale when Video2X AI upscale is handling it.
  if [[ "${DO_UPSCALE}" -eq 1 && "${DO_VIDEO2X}" -eq 0 ]]; then
    local dim_out vid_w vid_h
    dim_out="$(probe_dimensions "${input}")"
    vid_w="${dim_out%% *}"
    vid_h="${dim_out##* }"
    if [[ "${vid_w}" -ge "${UPSCALE_TARGET_W}" || "${vid_h}" -ge "${UPSCALE_TARGET_H}" ]]; then
      printf "    %s %s (%sx%s ≥ %sx%s)\n" \
        "$(clr_dim '○')" "${UPSCALE_SKIP_MSG}" \
        "${vid_w}" "${vid_h}" "${UPSCALE_TARGET_W}" "${UPSCALE_TARGET_H}"
    else
      # Two-step scale: fit within target box (AR preserved), then ensure even dimensions for H.264.
      vf_chain+=("scale=${UPSCALE_TARGET_W}:${UPSCALE_TARGET_H}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
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
    local pre_input_args=() pre_codec_args=()
    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      pre_codec_args=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
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

      vf_chain+=("vidstabtransform=input=${trf_file}:smoothing=${stab_smoothing}:maxangle=${stab_maxangle}:maxshift=${stab_maxshift}:interpol=bicubic")

    else
      # deshake fallback: single-pass, no temp file needed.
      # rx/ry max shift in pixels (scale smoothing 0-100 → 4-64 px).
      local deshake_r=$(( 4 + stab_smoothing * 60 / 100 ))
      vf_chain+=("deshake=rx=${deshake_r}:ry=${deshake_r}:edge=1:search=0")
    fi
  fi

  # ── FPS interpolation filter (added to chain, encoded in final pass) ─────
  # Skip minterpolate when RIFE is handling interpolation.
  if [[ "${do_fps}" -eq 1 && "${do_rife}" -eq 0 ]]; then
    vf_chain+=("minterpolate=fps=${target_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=16")
  fi

  # ── Deep3D AI stabilization ─────────────────────────────────────────
  if [[ "${DO_DEEP3D}" -eq 1 ]]; then
    # If pending vf_chain filters exist, bake them into an intermediate first
    # so Deep3D receives a fully-filtered video file.
    local d3d_pre_intermediate=""
    if [[ "${#vf_chain[@]}" -gt 0 ]]; then
      d3d_pre_intermediate="$(mktemp /tmp/deep3d_pre_XXXXXX.mp4)"
      local d3d_pre_vf; d3d_pre_vf="$(IFS=','; echo "${vf_chain[*]}")"
      local d3d_pre_input_args=() d3d_pre_codec_args=()
      if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
        d3d_pre_codec_args=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
      elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
        d3d_pre_input_args=(-vaapi_device /dev/dri/renderD128)
        d3d_pre_vf="${d3d_pre_vf},format=nv12,hwupload"
        d3d_pre_codec_args=(-c:v h264_vaapi -qp 18 -c:a copy)
      else
        d3d_pre_codec_args=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy)
      fi
      if ! run_ffmpeg_step "${STEP_PREPROCESS}" "${dur_sec}" \
          "${d3d_pre_input_args[@]}" -i "${src}" -vf "${d3d_pre_vf}" "${d3d_pre_codec_args[@]}" "${d3d_pre_intermediate}"; then
        rm -f "${d3d_pre_intermediate}"
        [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
        [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi
      src="${d3d_pre_intermediate}"
      vf_chain=()
    fi

    # Resolve an absolute path for Deep3D scripts (they cd into DEEP3D_DIR).
    local d3d_abs_src
    d3d_abs_src="$(realpath "${src}" 2>/dev/null || readlink -f "${src}" 2>/dev/null || echo "${src}")"

    # Decide where to write the final H.264 output from Deep3D.
    local d3d_out_temp=""
    local d3d_encode_target="${output}"
    if [[ "${do_rife}" -eq 1 || "${DO_VIDEO2X}" -eq 1 ]]; then
      d3d_out_temp="$(mktemp /tmp/deep3d_out_XXXXXX.mp4)"
      d3d_encode_target="${d3d_out_temp}"
    fi

    local d3d_name="stab_$$_${RANDOM}"
    local d3d_out_avi="${DEEP3D_DIR}/outputs/${d3d_name}/output.avi"

    # Pass 1 — geometry optimisation (depth + pose estimation per frame).
    printf "    %s %s: %s\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}" "$(clr_magenta "${DEEP3D_GPU_NAME} (CUDA)")"
    if ! run_deep3d_step "${DEEP3D_STEP_ANALYZE}" "${dur_sec}" \
        "${d3d_abs_src}" "${d3d_name}" "geometry_optimizer.py"; then
      rm -rf "${DEEP3D_DIR}/outputs/${d3d_name}"
      [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    # Pass 2 — trajectory smoothing + warp rectification.
    if ! run_deep3d_step "${DEEP3D_STEP_RECTIFY}" "${dur_sec}" \
        "${d3d_abs_src}" "${d3d_name}" "rectify.py" "--stability" "${DEEP3D_STABILITY}"; then
      rm -rf "${DEEP3D_DIR}/outputs/${d3d_name}"
      [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    # Pass 3 — re-encode Deep3D's MJPG AVI + restore original audio.
    local d3d_encode_args=() d3d_enc_pre_input_args=() d3d_enc_vf_args=()
    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      d3d_encode_args=(-c:v h264_nvenc -preset p4 -cq 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
      d3d_encode_args=(-c:v hevc_nvenc -preset p4 -cq 28 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      d3d_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      d3d_enc_vf_args=(-vf "format=nv12,hwupload")
      d3d_encode_args=(-c:v h264_vaapi -qp 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_vaapi" ]]; then
      d3d_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      d3d_enc_vf_args=(-vf "format=nv12,hwupload")
      d3d_encode_args=(-c:v hevc_vaapi -qp 28 -c:a copy)
    elif [[ "${USE_H265}" -eq 1 ]]; then
      d3d_encode_args=(-c:v libx265 -preset faster -crf 28 -c:a copy)
    else
      d3d_encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
    fi

    if ! run_ffmpeg_step "${DEEP3D_STEP_ENCODE}" "${dur_sec}" \
        "${d3d_enc_pre_input_args[@]}" \
        -i "${d3d_out_avi}" -i "${input}" \
        -map 0:v -map 1:a? \
        "${d3d_enc_vf_args[@]}" \
        "${d3d_encode_args[@]}" \
        "${d3d_encode_target}"; then
      rm -rf "${DEEP3D_DIR}/outputs/${d3d_name}"
      [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    rm -rf "${DEEP3D_DIR}/outputs/${d3d_name}"
    [[ -n "${d3d_pre_intermediate}" ]] && rm -f "${d3d_pre_intermediate}"

    # If no further AI steps, we're done.
    if [[ "${do_rife}" -eq 0 && "${DO_VIDEO2X}" -eq 0 ]]; then
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 0
    fi

    # Chain: Deep3D output becomes the new source for RIFE / Video2X.
    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    intermediate="${d3d_out_temp}"
    src="${d3d_out_temp}"
    vf_chain=()
  fi

  # ── RIFE AI FPS interpolation ─────────────────────────────────────────────
  if [[ "${do_rife}" -eq 1 ]]; then
    local rife_in_dir rife_out_dir
    rife_in_dir="$(mktemp -d /tmp/rife_in_XXXXXX)"
    rife_out_dir="$(mktemp -d /tmp/rife_out_XXXXXX)"

    # MPG/MPEG containers report r_frame_rate as the field rate for interlaced
    # content (e.g. 50/1 for 25fps PAL), so frames extracted at the real rate
    # but reassembled at the doubled field rate play back at 2× speed.
    # Pre-convert to an MP4 intermediate to normalise the container first.
    local rife_mpg_intermediate=""
    local _rife_src_ext="${src##*.}"; _rife_src_ext="${_rife_src_ext,,}"
    if [[ "${_rife_src_ext}" == "mpg" || "${_rife_src_ext}" == "mpeg" || "${_rife_src_ext}" == "m2v" || "${_rife_src_ext}" == "vob" ]]; then
      rife_mpg_intermediate="$(mktemp /tmp/edit_videos_rife_mpg_XXXXXX.mp4)"
      local _rife_pre_input=() _rife_pre_vf_args=() _rife_pre_codec=()
      if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
        _rife_pre_codec=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
      elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
        _rife_pre_input=(-vaapi_device /dev/dri/renderD128)
        _rife_pre_vf_args=(-vf "format=nv12,hwupload")
        _rife_pre_codec=(-c:v h264_vaapi -qp 18 -c:a copy)
      else
        _rife_pre_codec=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy)
      fi
      if ! run_ffmpeg_step "${RIFE_MPG_PRECONVERT}" "${dur_sec}" \
          "${_rife_pre_input[@]}" -i "${src}" "${_rife_pre_vf_args[@]}" "${_rife_pre_codec[@]}" "${rife_mpg_intermediate}"; then
        rm -f "${rife_mpg_intermediate}"
        rm -rf "${rife_in_dir}" "${rife_out_dir}"
        [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
        [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi
      src="${rife_mpg_intermediate}"
    fi

    # Compute source FPS using ffprobe rational (avoids decimal parse bugs).
    local _fp="${FFPROBE_BIN}"; [[ ! -x "${_fp}" ]] && _fp="ffprobe"
    local fps_frac; fps_frac="$("${_fp}" -v quiet -select_streams v:0 \
        -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${src}" 2>/dev/null)"
    local fps_num fps_den
    fps_num="${fps_frac%/*}"; fps_den="${fps_frac#*/}"
    [[ -z "${fps_num}" || "${fps_num}" -le 0 ]] && fps_num=30 && fps_den=1
    [[ -z "${fps_den}" || "${fps_den}" -le 0 ]] && fps_den=1
    local out_fps_num=$(( fps_num * rife_multiplier ))
    local out_fps="${out_fps_num}/${fps_den}"  # rational e.g. 60000/1001

    # Step 1 — extract frames, applying any pending vf_chain filters inline.
    local extract_vf=""
    [[ "${#vf_chain[@]}" -gt 0 ]] && extract_vf="$(IFS=','; echo "${vf_chain[*]}")"
    local extract_args=(-i "${src}")
    [[ -n "${extract_vf}" ]] && extract_args+=(-vf "${extract_vf}")
    extract_args+=("${rife_in_dir}/%08d.png")

    if ! run_ffmpeg_step "${RIFE_STEP_EXTRACT}" "${dur_sec}" "${extract_args[@]}"; then
      rm -rf "${rife_in_dir}" "${rife_out_dir}"
      [[ -n "${rife_mpg_intermediate}" ]] && rm -f "${rife_mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    # Step 2 — RIFE interpolation.
    [[ -n "${VULKAN_GPU_LABEL}" ]] && \
      printf "    %s %s: %s\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
    if ! run_rife_step "${RIFE_STEP_INTERP}" "${rife_in_dir}" "${rife_out_dir}" "${rife_multiplier}"; then
      rm -rf "${rife_in_dir}" "${rife_out_dir}"
      [[ -n "${rife_mpg_intermediate}" ]] && rm -f "${rife_mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi
    rm -rf "${rife_in_dir}"

    # Step 3 — re-encode interpolated frames + audio from original input.
    # When Real-ESRGAN is also selected, write to a temp file so VIDEO2X
    # can upscale the interpolated result afterwards.
    local rife_encode_args=() rife_enc_pre_input_args=() rife_enc_vf_args=()
    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      rife_encode_args=(-c:v h264_nvenc -preset p4 -cq 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
      rife_encode_args=(-c:v hevc_nvenc -preset p4 -cq 28 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      rife_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      rife_enc_vf_args=(-vf "format=nv12,hwupload")
      rife_encode_args=(-c:v h264_vaapi -qp 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_vaapi" ]]; then
      rife_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      rife_enc_vf_args=(-vf "format=nv12,hwupload")
      rife_encode_args=(-c:v hevc_vaapi -qp 28 -c:a copy)
    elif [[ "${USE_H265}" -eq 1 ]]; then
      rife_encode_args=(-c:v libx265 -preset faster -crf 28 -c:a copy)
    else
      rife_encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
    fi

    local rife_chained_temp=""
    local rife_encode_target="${output}"
    if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
      rife_chained_temp="$(mktemp /tmp/rife_chain_XXXXXX.mp4)"
      rife_encode_target="${rife_chained_temp}"
    fi

    local rife_out_dur="${dur_sec}"
    if ! run_ffmpeg_step "${RIFE_STEP_ENCODE}" "${rife_out_dur}" \
        "${rife_enc_pre_input_args[@]}" \
        -framerate "${out_fps}" -i "${rife_out_dir}/%08d.png" \
        -i "${input}" \
        -map 0:v -map 1:a? \
        "${rife_enc_vf_args[@]}" \
        "${rife_encode_args[@]}" \
        "${rife_encode_target}"; then
      rm -rf "${rife_out_dir}"
      [[ -n "${rife_chained_temp}" ]] && rm -f "${rife_chained_temp}"
      [[ -n "${rife_mpg_intermediate}" ]] && rm -f "${rife_mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    rm -rf "${rife_out_dir}"
    [[ -n "${rife_mpg_intermediate}" ]] && rm -f "${rife_mpg_intermediate}"
    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"

    if [[ "${DO_VIDEO2X}" -eq 0 ]]; then
      return 0
    fi

    # Chain into Real-ESRGAN: use the RIFE output as the new source.
    src="${rife_chained_temp}"
    intermediate="${rife_chained_temp}"  # cleaned up by the VIDEO2X block below
    vf_chain=()  # filters were already baked in during RIFE frame extraction
  fi

  # ── Real-ESRGAN AI upscaling ──────────────────────────────────────────────
  if [[ "${DO_VIDEO2X}" -eq 1 ]]; then
    local esrgan_in_dir esrgan_out_dir
    esrgan_in_dir="$(mktemp -d /tmp/esrgan_in_XXXXXX)"
    esrgan_out_dir="$(mktemp -d /tmp/esrgan_out_XXXXXX)"

    # MPG/MPEG containers report r_frame_rate as the field rate for interlaced
    # content (e.g. 50/1 for 25fps PAL), so frames extracted at the real rate
    # but reassembled at the doubled field rate play back at 2× speed.
    # Pre-convert to an MP4 intermediate to normalise the container first.
    local mpg_intermediate=""
    local _src_ext="${src##*.}"; _src_ext="${_src_ext,,}"
    if [[ "${_src_ext}" == "mpg" || "${_src_ext}" == "mpeg" || "${_src_ext}" == "m2v" || "${_src_ext}" == "vob" ]]; then
      mpg_intermediate="$(mktemp /tmp/edit_videos_mpg_XXXXXX.mp4)"
      local _v2x_pre_input=() _v2x_pre_vf_args=() _v2x_pre_codec=()
      if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
        _v2x_pre_codec=(-c:v h264_nvenc -preset p1 -cq 18 -c:a copy)
      elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
        _v2x_pre_input=(-vaapi_device /dev/dri/renderD128)
        _v2x_pre_vf_args=(-vf "format=nv12,hwupload")
        _v2x_pre_codec=(-c:v h264_vaapi -qp 18 -c:a copy)
      else
        _v2x_pre_codec=(-c:v libx264 -preset ultrafast -crf 18 -c:a copy)
      fi
      if ! run_ffmpeg_step "${VIDEO2X_MPG_PRECONVERT}" "${dur_sec}" \
          "${_v2x_pre_input[@]}" -i "${src}" "${_v2x_pre_vf_args[@]}" "${_v2x_pre_codec[@]}" "${mpg_intermediate}"; then
        rm -f "${mpg_intermediate}"
        rm -rf "${esrgan_in_dir}" "${esrgan_out_dir}"
        [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
        [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
        return 1
      fi
      src="${mpg_intermediate}"
    fi

    # Get rational framerate for final reassemble
    local _fp="${FFPROBE_BIN}"; [[ ! -x "${_fp}" ]] && _fp="ffprobe"
    local fps_frac; fps_frac="$("${_fp}" -v quiet -select_streams v:0 \
        -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${src}" 2>/dev/null)"
    local fps_num fps_den
    fps_num="${fps_frac%/*}"; fps_den="${fps_frac#*/}"
    [[ -z "${fps_num}" || "${fps_num}" -le 0 ]] && fps_num=30 && fps_den=1
    [[ -z "${fps_den}" || "${fps_den}" -le 0 ]] && fps_den=1
    local src_fps="${fps_num}/${fps_den}"

    # Step 1 — extract frames, applying any pending vf_chain filters inline
    local extract_vf=""
    [[ "${#vf_chain[@]}" -gt 0 ]] && extract_vf="$(IFS=','; echo "${vf_chain[*]}")"
    local extract_args=(-i "${src}")
    [[ -n "${extract_vf}" ]] && extract_args+=(-vf "${extract_vf}")
    extract_args+=(-qscale:v 1 -qmin 1 -qmax 1 -vsync 0 "${esrgan_in_dir}/%08d.png")

    if ! run_ffmpeg_step "${VIDEO2X_STEP_EXTRACT}" "${dur_sec}" "${extract_args[@]}"; then
      rm -rf "${esrgan_in_dir}" "${esrgan_out_dir}"
      [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    local in_count; in_count="$(find "${esrgan_in_dir}" -maxdepth 1 -name '*.png' 2>/dev/null | wc -l)"

    # Step 2 — Real-ESRGAN upscale with frame-count progress bar
    [[ -n "${VULKAN_GPU_LABEL}" ]] && \
      printf "    %s %s: %s\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_USING}" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
    if ! run_video2x_step "${VIDEO2X_STEP_UPSCALE}" "${esrgan_in_dir}" "${esrgan_out_dir}" "${VIDEO2X_SCALE}" "${VIDEO2X_MODEL}" "${in_count}"; then
      rm -rf "${esrgan_in_dir}" "${esrgan_out_dir}"
      [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi
    rm -rf "${esrgan_in_dir}"

    # Step 3 — reassemble upscaled frames with original audio
    local esrgan_encode_args=() esrgan_enc_pre_input_args=() esrgan_enc_vf_args=()
    if [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_nvenc" ]]; then
      esrgan_encode_args=(-c:v h264_nvenc -preset p4 -cq 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
      esrgan_encode_args=(-c:v hevc_nvenc -preset p4 -cq 28 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      esrgan_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      esrgan_enc_vf_args=(-vf "format=nv12,hwupload")
      esrgan_encode_args=(-c:v h264_vaapi -qp 23 -c:a copy)
    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_vaapi" ]]; then
      esrgan_enc_pre_input_args=(-vaapi_device /dev/dri/renderD128)
      esrgan_enc_vf_args=(-vf "format=nv12,hwupload")
      esrgan_encode_args=(-c:v hevc_vaapi -qp 28 -c:a copy)
    elif [[ "${USE_H265}" -eq 1 ]]; then
      esrgan_encode_args=(-c:v libx265 -preset faster -crf 28 -c:a copy)
    else
      esrgan_encode_args=(-c:v libx264 -preset faster -crf 23 -c:a copy)
    fi

    if ! run_ffmpeg_step "${VIDEO2X_STEP_ENCODE}" "${dur_sec}" \
        "${esrgan_enc_pre_input_args[@]}" \
        -framerate "${src_fps}" -i "${esrgan_out_dir}/%08d.png" \
        -i "${input}" \
        -map 0:v -map 1:a? \
        "${esrgan_enc_vf_args[@]}" \
        "${esrgan_encode_args[@]}" \
        "${output}"; then
      rm -rf "${esrgan_out_dir}"
      [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
      [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
      [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
      return 1
    fi

    rm -rf "${esrgan_out_dir}"
    [[ -n "${mpg_intermediate}" ]] && rm -f "${mpg_intermediate}"
    [[ -n "${trf_file}" ]] && rm -f "${trf_file}"
    [[ -n "${intermediate}" ]] && rm -f "${intermediate}"
    return 0
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

    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "hevc_nvenc" ]]; then
      encode_args=(-c:v hevc_nvenc -preset p4 -cq 28 -c:a copy)

    elif [[ "${use_gpu}" -eq 1 && "${gpu_encoder}" == "h264_vaapi" ]]; then
      # VA-API: all CPU filters run first, then upload frames to GPU via hwupload.
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

# ── Processing queue (shared by foreground and background modes) ──────────────

_run_processing() {
  local _start_epoch; _start_epoch="$(date +%s)"
  local count_ok=0 count_fail=0 count_idx=0
  local failed_files=()
  local divider
  divider="$(printf '─%.0s' {1..60})"

  # ── Log header ──────────────────────────────────────────────────────────────
  if [[ -n "${LOG_FILE}" ]]; then
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

    printf "\n  [%d/%d] %s\n" "${count_idx}" "${#video_files[@]}" "$(clr_bold "${base}")"
    _log "[${count_idx}/${#video_files[@]}] Starting: ${base}"

    if process_video "${vf}" "${out}" \
        "${do_black_bars}" "${do_fps}" "${do_h264}" "${do_stab}" \
        "${target_fps}" "${stab_shakiness}" "${stab_accuracy}" "${stab_smoothing}" \
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

  # ── Summary ─────────────────────────────────────────────────────────────────
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

  # ── Log footer ──────────────────────────────────────────────────────────────
  if [[ -n "${LOG_FILE}" ]]; then
    {
      printf "===========================\n"
      printf "Done: %d  Failed: %d\n" "${count_ok}" "${count_fail}"
      printf "Finished: %s\n" "$(date '+%Y-%m-%d %H:%M:%S')"
      printf "Total time: %s\n" "$(_fmt_time "${_elapsed}")"
    } >> "${LOG_FILE}"
  fi
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

  # ── FFmpeg check (BtbN required — system ffmpeg is not supported) ────────

  printf "  %s\n" "$(clr_dim "${FFMPEG_CHECK}")"

  local ffmpeg_ver
  if [[ -x "${FFMPEG_LOCAL_DIR}/ffmpeg" ]]; then
    # Previously-downloaded BtbN binary found — use it.
    FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
    FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
    ffmpeg_ver="$("${FFMPEG_BIN}" -version 2>/dev/null | head -1 | sed 's/ffmpeg version //')"
    printf "  %s %s: %s\n\n" "$(clr_bold_green '✓')" "${FFMPEG_FOUND}" "$(clr_dim "${ffmpeg_ver}")"
  else
    # No BtbN binary cached — it is mandatory.
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${BTBN_REQUIRED_MSG}")"
    printf "  %s %s\n" "$(clr_dim '→')" "$(clr_dim "${BTBN_REQUIRED_REASON}")"
    echo ""
    printf "  %s [y/n] (y): " "$(clr_bold "${BTBN_DOWNLOAD_PROMPT}")"
    local dl_ans; read -r dl_ans; dl_ans="${dl_ans:-y}"
    if [[ "${dl_ans,,}" == y* ]]; then
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

  # ── AI GPU detection (Vulkan + CUDA) — must run before action selector ───
  detect_vulkan_gpus && HAS_VULKAN_GPU=1 || HAS_VULKAN_GPU=0
  HAS_CUDA_GPU=0
  if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
    HAS_CUDA_GPU=1
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
    "${ACTION_DENOISE}"
    "${ACTION_SHARPEN}"
    "${ACTION_UPSCALE}"
    "${ACTION_DOWNSIZE}"
    "${ACTION_COLOR}"
    "${ACTION_RIFE}"
    "${ACTION_VIDEO2X}"
    "${ACTION_DEEP3D}"
  )
  _CB_SEL=(0 0 0 0 0 0 0 0 0 0 0 0)
  # Indices 9 (RIFE) and 10 (Video2X) require Vulkan; index 11 (Deep3D) requires CUDA.
  local _dis_vulkan=0 _dis_cuda=0
  [[ "${HAS_VULKAN_GPU}" -eq 0 ]] && _dis_vulkan=1
  [[ "${HAS_CUDA_GPU}" -eq 0 ]]   && _dis_cuda=1
  _CB_DISABLED=(0 0 0 0 0 0 0 0 0 "${_dis_vulkan}" "${_dis_vulkan}" "${_dis_cuda}")
  interactive_checkbox

  local do_black_bars=0 do_fps=0 do_h264=0 do_stab=0
  DO_DENOISE=0; DO_SHARPEN=0; DO_UPSCALE=0; DO_DOWNSIZE=0; DO_COLOR=0; DO_RIFE=0; DO_VIDEO2X=0; DO_DEEP3D=0
  for idx in "${SELECTED_INDICES[@]}"; do
    case "${idx}" in
      0) do_black_bars=1 ;;
      1) do_fps=1 ;;
      2) do_h264=1 ;;
      3) do_stab=1 ;;
      4) DO_DENOISE=1 ;;
      5) DO_SHARPEN=1 ;;
      6) DO_UPSCALE=1 ;;
      7) DO_DOWNSIZE=1 ;;
      8) DO_COLOR=1 ;;
      9) DO_RIFE=1 ;;
      10) DO_VIDEO2X=1 ;;
      11) DO_DEEP3D=1 ;;
    esac
  done

  if [[ "${do_black_bars}" -eq 0 && "${do_fps}" -eq 0 && "${do_h264}" -eq 0 && "${do_stab}" -eq 0 && \
        "${DO_DENOISE}" -eq 0 && "${DO_SHARPEN}" -eq 0 && "${DO_UPSCALE}" -eq 0 && "${DO_DOWNSIZE}" -eq 0 && \
        "${DO_COLOR}" -eq 0 && "${DO_RIFE}" -eq 0 && "${DO_VIDEO2X}" -eq 0 && "${DO_DEEP3D}" -eq 0 ]]; then
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
    # Upgrade GPU_ENCODER to the H.265 equivalent when available.
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
    # Verify CPU encoder is available (covers no-GPU path and GPU fallback above).
    if [[ "${use_gpu}" -eq 0 ]] && ! _has_encoder "${FFMPEG_BIN}" 'libx265'; then
      printf "  %s  %s\n\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${CODEC_H265_NO_ENC}")"
      USE_H265=0
    fi
  fi
  echo ""

  # ── RIFE check / bootstrap ────────────────────────────────────────────────
  if [[ "${DO_RIFE}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_dim "${RIFE_CHECK}")"
    if check_rife; then
      find_rife_model
      printf "  %s %s: %s (model: %s)\n" \
        "$(clr_bold_green '✓')" "${RIFE_FOUND}" "$(clr_dim "${RIFE_BIN}")" "$(clr_cyan "${RIFE_MODEL}")"
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${RIFE_NOT_FOUND}"
      echo ""
      printf "  %s [y/n] (y): " "$(clr_bold "Download rife-ncnn-vulkan automatically?")"
      local rife_dl_ans; read -r rife_dl_ans; rife_dl_ans="${rife_dl_ans:-y}"
      echo ""
      if [[ "${rife_dl_ans,,}" == y* ]]; then
        if ! bootstrap_rife; then
          printf "  %s RIFE disabled — skipping interpolation.\n\n" "$(clr_yellow '⚠')"
          DO_RIFE=0
        fi
      else
        printf "  %s RIFE disabled — continuing without AI interpolation.\n\n" "$(clr_yellow '⚠')"
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
    if check_video2x; then
      printf "  %s %s: %s\n" \
        "$(clr_bold_green '✓')" "${VIDEO2X_FOUND}" "$(clr_dim "${VIDEO2X_BIN}")"
    else
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${VIDEO2X_NOT_FOUND}"
      echo ""
      printf "  %s [y/n] (y): " "$(clr_bold "Download video2x AppImage automatically?")"
      local v2x_dl_ans; read -r v2x_dl_ans; v2x_dl_ans="${v2x_dl_ans:-y}"
      echo ""
      if [[ "${v2x_dl_ans,,}" == y* ]]; then
        if ! bootstrap_video2x; then
          printf "  %s video2x disabled — skipping AI upscale.\n\n" "$(clr_yellow '⚠')"
          DO_VIDEO2X=0
        fi
      else
        printf "  %s video2x disabled — continuing without AI upscale.\n\n" "$(clr_yellow '⚠')"
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

  # ── Deep3D check / bootstrap ─────────────────────────────────────────────
  if [[ "${DO_DEEP3D}" -eq 1 ]]; then
    printf "  %s\n" "$(clr_dim "${DEEP3D_CHECK}")"
    if check_deep3d; then
      printf "  %s %s: %s\n\n" \
        "$(clr_bold_green '✓')" "${DEEP3D_FOUND}" "$(clr_dim "${DEEP3D_DIR}")"
      # Always sync the flow helper so the latest version (with CUDA support) is used.
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
      if [[ "${d3d_dl_ans,,}" == y* ]]; then
        if ! bootstrap_deep3d; then
          printf "  %s Deep3D disabled — skipping AI stabilization.\n\n" "$(clr_yellow '⚠')"
          DO_DEEP3D=0
        fi
      else
        printf "  %s Deep3D disabled — continuing without AI stabilization.\n\n" "$(clr_yellow '⚠')"
        DO_DEEP3D=0
      fi
    fi
  fi

  # ── Action parameters ─────────────────────────────────────────────────────
  local target_fps=60
  local stab_shakiness=7 stab_accuracy=15 stab_smoothing=30
  local stab_mode="vidstab"
  local stab_maxangle=0.15 stab_maxshift=60

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

      printf "  %s\n" "$(clr_bold "${STAB_MODE_LABEL}:")"
      printf "    1) %s\n" "${STAB_MODE_STANDARD}"
      printf "    2) %s\n" "${STAB_MODE_CONCERT}"
      printf "  %s (1): " "$(clr_dim "Choice")"
      local stab_preset_choice; read -r stab_preset_choice; stab_preset_choice="${stab_preset_choice:-1}"

      if [[ "${stab_preset_choice}" == "2" ]]; then
        # Concert / flash-safe preset — tight caps prevent flash-induced rotation artifacts
        stab_shakiness=5
        stab_accuracy=15
        stab_smoothing=50
        stab_maxangle=0.05   # ≈ 3° — suppresses flash-induced spin
        stab_maxshift=30
        printf "  %s %s\n" "$(clr_cyan '→')" "$(clr_dim "${STAB_CONCERT_INFO}")"
      else
        # Standard handheld — prompt params, apply a generous-but-sane cap
        printf "  %s (7): " "$(clr_dim "${SHAKINESS_LABEL}")"
        read -r stab_shakiness; stab_shakiness="${stab_shakiness:-7}"
        printf "  %s (15): " "$(clr_dim "${ACCURACY_LABEL}")"
        read -r stab_accuracy; stab_accuracy="${stab_accuracy:-15}"
        printf "  %s (30): " "$(clr_dim "${SMOOTHING_LABEL}")"
        read -r stab_smoothing; stab_smoothing="${stab_smoothing:-30}"
        # maxangle=0.15 rad (≈8.6°) and maxshift=60px cap extreme outliers silently
        stab_maxangle=0.15
        stab_maxshift=60
      fi

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

  if [[ "${DO_DENOISE}" -eq 1 ]]; then
    printf "  %s (4): " "$(clr_dim "${DENOISE_LUMA_S_LABEL}")"
    read -r DENOISE_LUMA_S; DENOISE_LUMA_S="${DENOISE_LUMA_S:-4}"
    printf "  %s (4): " "$(clr_dim "${DENOISE_CHROMA_S_LABEL}")"
    read -r DENOISE_CHROMA_S; DENOISE_CHROMA_S="${DENOISE_CHROMA_S:-4}"
    printf "  %s (3): " "$(clr_dim "${DENOISE_LUMA_T_LABEL}")"
    read -r DENOISE_LUMA_T; DENOISE_LUMA_T="${DENOISE_LUMA_T:-3}"
    printf "  %s (3): " "$(clr_dim "${DENOISE_CHROMA_T_LABEL}")"
    read -r DENOISE_CHROMA_T; DENOISE_CHROMA_T="${DENOISE_CHROMA_T:-3}"
  fi

  if [[ "${DO_SHARPEN}" -eq 1 ]]; then
    printf "  %s (5): " "$(clr_dim "${SHARPEN_MATRIX_LABEL}")"
    read -r SHARPEN_MATRIX; SHARPEN_MATRIX="${SHARPEN_MATRIX:-5}"
    printf "  %s (1.0): " "$(clr_dim "${SHARPEN_LUMA_AMOUNT_LABEL}")"
    read -r SHARPEN_LUMA_AMOUNT; SHARPEN_LUMA_AMOUNT="${SHARPEN_LUMA_AMOUNT:-1.0}"
    printf "  %s (0.0): " "$(clr_dim "${SHARPEN_CHROMA_AMOUNT_LABEL}")"
    read -r SHARPEN_CHROMA_AMOUNT; SHARPEN_CHROMA_AMOUNT="${SHARPEN_CHROMA_AMOUNT:-0.0}"
  fi

  if [[ "${DO_UPSCALE}" -eq 1 ]]; then
    printf "  %s (1080): " "$(clr_bold "${UPSCALE_TARGET_LABEL}")"
    local upscale_input; read -r upscale_input
    if [[ "${upscale_input}" =~ ^([0-9]+)[xX]([0-9]+)$ ]]; then
      UPSCALE_TARGET_W="${BASH_REMATCH[1]}"
      UPSCALE_TARGET_H="${BASH_REMATCH[2]}"
    else
      case "${upscale_input:-1080}" in
        720)              UPSCALE_TARGET_W=1280;  UPSCALE_TARGET_H=720  ;;
        1080)             UPSCALE_TARGET_W=1920;  UPSCALE_TARGET_H=1080 ;;
        1440)             UPSCALE_TARGET_W=2560;  UPSCALE_TARGET_H=1440 ;;
        2160|4k|4K|4K*)  UPSCALE_TARGET_W=3840;  UPSCALE_TARGET_H=2160 ;;
        *)                UPSCALE_TARGET_W=1920;  UPSCALE_TARGET_H=1080 ;;
      esac
    fi
  fi

  if [[ "${DO_DOWNSIZE}" -eq 1 ]]; then
    printf "  %s (1080): " "$(clr_bold "${DOWNSIZE_TARGET_LABEL}")"
    local downsize_input; read -r downsize_input
    if [[ "${downsize_input}" =~ ^([0-9]+)[xX]([0-9]+)$ ]]; then
      DOWNSIZE_TARGET_W="${BASH_REMATCH[1]}"
      DOWNSIZE_TARGET_H="${BASH_REMATCH[2]}"
    else
      case "${downsize_input:-1080}" in
        480)              DOWNSIZE_TARGET_W=854;   DOWNSIZE_TARGET_H=480  ;;
        720)              DOWNSIZE_TARGET_W=1280;  DOWNSIZE_TARGET_H=720  ;;
        1080)             DOWNSIZE_TARGET_W=1920;  DOWNSIZE_TARGET_H=1080 ;;
        1440)             DOWNSIZE_TARGET_W=2560;  DOWNSIZE_TARGET_H=1440 ;;
        2160|4k|4K|4K*)  DOWNSIZE_TARGET_W=3840;  DOWNSIZE_TARGET_H=2160 ;;
        *)                DOWNSIZE_TARGET_W=1920;  DOWNSIZE_TARGET_H=1080 ;;
      esac
    fi
  fi

  if [[ "${DO_COLOR}" -eq 1 ]]; then
    printf "  %s (1.1): " "$(clr_dim "${COLOR_CONTRAST_LABEL}")"
    read -r COLOR_CONTRAST; COLOR_CONTRAST="${COLOR_CONTRAST:-1.1}"
    printf "  %s (0.0): " "$(clr_dim "${COLOR_BRIGHTNESS_LABEL}")"
    read -r COLOR_BRIGHTNESS; COLOR_BRIGHTNESS="${COLOR_BRIGHTNESS:-0.0}"
    printf "  %s (1.1): " "$(clr_dim "${COLOR_SATURATION_LABEL}")"
    read -r COLOR_SATURATION; COLOR_SATURATION="${COLOR_SATURATION:-1.1}"
    printf "  %s (1.0): " "$(clr_dim "${COLOR_GAMMA_LABEL}")"
    read -r COLOR_GAMMA; COLOR_GAMMA="${COLOR_GAMMA:-1.0}"
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
    # Always use CUDA — Deep3D is only selectable when HAS_CUDA_GPU=1.
    # Confirm the GPU name from the venv's PyTorch for the display label.
    local _d3d_cuda_name=""
    if "${DEEP3D_PYTHON}" -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
      _d3d_cuda_name="$("${DEEP3D_PYTHON}" -c \
        "import torch; print(torch.cuda.get_device_name(0))" 2>/dev/null || echo "CUDA GPU")"
    else
      # PyTorch not yet built with CUDA in venv — fall back to nvidia-smi name
      _d3d_cuda_name="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
        | head -1 | xargs 2>/dev/null || echo "CUDA GPU")"
    fi
    DEEP3D_DEVICE="cuda:0"
    DEEP3D_GPU_NAME="${_d3d_cuda_name}"
    printf "  %s %s: %s\n\n" "$(clr_bold_magenta '⚡')" "${AI_GPU_HINT}" "$(clr_magenta "${_d3d_cuda_name}")"
    printf "  %s (12): " "$(clr_bold "${DEEP3D_STABILITY_LABEL}")"
    local d3d_stab_input; read -r d3d_stab_input
    DEEP3D_STABILITY="${d3d_stab_input:-12}"
    if ! [[ "${DEEP3D_STABILITY}" =~ ^[0-9]+$ ]] || [[ "${DEEP3D_STABILITY}" -lt 1 ]]; then
      DEEP3D_STABILITY=12
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
  local out_dir_default="${folder}/output-${date_str}"
  printf "  %s (%s): " "$(clr_bold "${OUTPUT_FOLDER_PROMPT}")" "$(clr_dim "${out_dir_default}")"
  local out_dir_input; read -r out_dir_input
  local out_dir="${out_dir_input:-${out_dir_default}}"
  echo ""

  # ── Pre-flight summary ────────────────────────────────────────────────────
  local divider
  divider="$(printf '─%.0s' {1..60})"
  echo "  ${divider}"
  printf "  %s  %d %s\n" "$(clr_bold_cyan '▶')" "${total}" "$(clr_bold "${FILES_LABEL} selected")"
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_dim "${out_dir}")"

  printf "  %s: " "$(clr_bold "${ACTIONS_LABEL}")"
  local action_list=()
  if [[ "${do_black_bars}" -eq 1 ]]; then action_list+=("black bars"); fi
  if [[ "${do_fps}" -eq 1 ]];        then action_list+=("FPS→${target_fps}"); fi
  if [[ "${do_h264}" -eq 1 ]];       then action_list+=("H.264"); fi
  if [[ "${do_stab}" -eq 1 ]]; then
    if [[ "${stab_maxangle}" == "0.05" ]]; then
      action_list+=("stabilize/concert (sh=${stab_shakiness} sm=${stab_smoothing} maxangle=${stab_maxangle} maxshift=${stab_maxshift})")
    else
      action_list+=("stabilize (sh=${stab_shakiness} ac=${stab_accuracy} sm=${stab_smoothing} maxangle=${stab_maxangle} maxshift=${stab_maxshift})")
    fi
  fi
  if [[ "${DO_DENOISE}" -eq 1 ]];    then action_list+=("denoise (ls=${DENOISE_LUMA_S} cs=${DENOISE_CHROMA_S} lt=${DENOISE_LUMA_T} ct=${DENOISE_CHROMA_T})"); fi
  if [[ "${DO_SHARPEN}" -eq 1 ]];    then action_list+=("sharpen (m=${SHARPEN_MATRIX} la=${SHARPEN_LUMA_AMOUNT} ca=${SHARPEN_CHROMA_AMOUNT})"); fi
  if [[ "${DO_UPSCALE}" -eq 1 ]];    then action_list+=("upscale→${UPSCALE_TARGET_W}x${UPSCALE_TARGET_H}"); fi
  if [[ "${DO_DOWNSIZE}" -eq 1 ]];   then action_list+=("downsize→${DOWNSIZE_TARGET_W}x${DOWNSIZE_TARGET_H}"); fi
  if [[ "${DO_COLOR}" -eq 1 ]];      then action_list+=("color (c=${COLOR_CONTRAST} b=${COLOR_BRIGHTNESS} s=${COLOR_SATURATION} g=${COLOR_GAMMA})"); fi
  if [[ "${DO_RIFE}" -eq 1 ]];       then action_list+=("RIFE ${RIFE_MULTIPLIER}× (${RIFE_MODEL})"); fi
  if [[ "${DO_VIDEO2X}" -eq 1 ]];   then action_list+=("video2x ${VIDEO2X_SCALE}× (${VIDEO2X_MODEL})"); fi
  if [[ "${DO_DEEP3D}" -eq 1 ]];    then action_list+=("deep3d (stability=${DEEP3D_STABILITY})"); fi
  local IFS_SAVE="${IFS}"; IFS=', '; printf "%s\n" "$(clr_cyan "${action_list[*]}")"; IFS="${IFS_SAVE}"

  if [[ "${use_gpu}" -eq 1 ]]; then
    printf "  %s: %s\n" "$(clr_bold_magenta 'GPU')" "$(clr_magenta "${GPU_LABEL}")"
  fi
  if [[ ("${DO_RIFE}" -eq 1 || "${DO_VIDEO2X}" -eq 1) && -n "${VULKAN_GPU_LABEL}" ]]; then
    printf "  %s: %s\n" "$(clr_bold_magenta 'AI GPU')" "$(clr_magenta "${VULKAN_GPU_LABEL}")"
  fi
  if [[ "${DO_DEEP3D}" -eq 1 && -n "${DEEP3D_GPU_NAME}" ]]; then
    printf "  %s: %s\n" "$(clr_bold_magenta 'AI GPU')" "$(clr_magenta "${DEEP3D_GPU_NAME} (CUDA)")"
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

  # ── Background mode prompt ─────────────────────────────────────────────────
  echo ""
  printf "  %s (n): " "$(clr_bold "${BG_PROMPT}")"
  local bg_ans; read -r bg_ans; bg_ans="${bg_ans:-n}"
  local bg_fchar="${bg_ans:0:1}"
  echo ""

  if [[ "${CONFIRM_YES_CHARS}" == *"${bg_fchar,,}"* ]]; then
    # ── Background launch ──────────────────────────────────────────────────
    LOG_FILE="${out_dir}/process-$(date '+%Y%m%d-%H%M%S').log"
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
    # ── Foreground run ─────────────────────────────────────────────────────
    LOG_FILE="${out_dir}/process-$(date '+%Y%m%d-%H%M%S').log"
    echo ""
    _run_processing
  fi
}

main "$@"
