#!/usr/bin/env bash
# lib/ffmpeg-bootstrap.sh — Download and cache a GPU-capable BtbN static FFmpeg build

FFMPEG_BIN="ffmpeg"
FFPROBE_BIN="ffprobe"
FFMPEG_LOCAL_DIR="${HOME}/.local/share/edit-videos/ffmpeg"

_arch_tag() {
  local machine; machine="$(uname -m)"
  case "${machine}" in
    x86_64)        echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7*|armv6*) echo "armhf" ;;
    i?86)          echo "i686"  ;;
    *)             echo ""      ;;
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

# Downloads and installs BtbN FFmpeg into FFMPEG_LOCAL_DIR.
# Updates FFMPEG_BIN and FFPROBE_BIN on success.
bootstrap_ffmpeg() {
  local arch; arch="$(_arch_tag)"
  if [[ -z "${arch}" ]]; then
    printf "  %s Unknown CPU architecture — cannot auto-download FFmpeg.\n" "$(clr_bold_red '✗')"
    exit 1
  fi

  local btbn_asset; btbn_asset="$(_btbn_asset)"
  if [[ -z "${btbn_asset}" ]]; then
    printf "  %s No prebuilt FFmpeg available for arch %s.\n" "$(clr_bold_red '✗')" "${arch}"
    exit 1
  fi

  local tmp_dir; tmp_dir="$(mktemp -d)"
  trap 'rm -rf "${tmp_dir}"; trap - RETURN' RETURN
  local archive="${tmp_dir}/ffmpeg.tar.xz"
  local url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${btbn_asset}"

  printf "  %s\n" "$(clr_dim "Downloading static FFmpeg (BtbN/FFmpeg-Builds) for ${arch}...")"

  if ! _download_file "${url}" "${archive}"; then
    printf "  %s Download failed.\n" "$(clr_bold_red '✗')"; exit 1
  fi

  mkdir -p "${FFMPEG_LOCAL_DIR}"
  tar -xf "${archive}" -C "${tmp_dir}"
  local extracted_dir; extracted_dir="$(find "${tmp_dir}" -maxdepth 1 -mindepth 1 -type d | head -1)"

  local src_bin_dir="${extracted_dir}"
  if [[ -f "${extracted_dir}/bin/ffmpeg" ]]; then
    src_bin_dir="${extracted_dir}/bin"
  fi

  cp "${src_bin_dir}/ffmpeg"  "${FFMPEG_LOCAL_DIR}/ffmpeg"
  cp "${src_bin_dir}/ffprobe" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true
  chmod +x "${FFMPEG_LOCAL_DIR}/ffmpeg" "${FFMPEG_LOCAL_DIR}/ffprobe" 2>/dev/null || true

  FFMPEG_BIN="${FFMPEG_LOCAL_DIR}/ffmpeg"
  FFPROBE_BIN="${FFMPEG_LOCAL_DIR}/ffprobe"
  _FILTER_CACHE=""
  printf "  %s FFmpeg installed to %s\n\n" "$(clr_bold_green '✓')" "$(clr_dim "${FFMPEG_LOCAL_DIR}")"
}
