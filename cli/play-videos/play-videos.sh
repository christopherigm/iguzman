#!/usr/bin/env bash
# play-videos.sh — Play videos on Ubuntu Server via HDMI using mpv (DRM/KMS, no desktop required)
#
# Usage:
#   ./play-videos.sh [OPTIONS] <file|dir|playlist>
#
# Examples:
#   ./play-videos.sh video.mp4
#   ./play-videos.sh /media/videos/
#   ./play-videos.sh --loop --shuffle /media/videos/
#   ./play-videos.sh --connector HDMI-A-1 --mode 1920x1080@60 video.mp4
#   ./play-videos.sh --list-connectors
#   ./play-videos.sh --playlist my-playlist.m3u

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
CONNECTOR="auto"       # DRM connector (auto = first available). Use --list-connectors to see options
MODE="preferred"       # Display mode: preferred | highest | WxH[@R] (e.g. 1920x1080@60)
LOOP="no"              # Loop: no | inf | <N>
LOOP_PLAYLIST="no"     # Loop entire playlist: no | inf | <N>
SHUFFLE="no"           # Shuffle playlist
VOLUME=100             # Volume 0–100
MUTE="no"              # Mute audio
FULLSCREEN="yes"       # Force fullscreen
PROFILE="sw-fast"      # sw-fast recommended for DRM VO (no hw acceleration)
DRM_DEVICE=""          # Override DRM device (e.g. /dev/dri/card1). Empty = auto
EXTRA_ARGS=()          # Any extra mpv args passed through

# ── Helpers ───────────────────────────────────────────────────────────────────
usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,1\}//'
  exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "'$1' is not installed. Install with: sudo apt install $2"
}

list_connectors() {
  require mpv mpv
  echo "Available DRM connectors:"
  mpv --vo=drm --drm-connector=help /dev/null 2>&1 | grep -E 'connector|^  ' || true
  echo ""
  echo "Available DRM modes (first connector):"
  mpv --vo=drm --drm-mode=help /dev/null 2>&1 | grep -E 'mode|^  ' || true
  exit 0
}

build_mpv_args() {
  local args=(
    "--vo=drm"
    "--profile=${PROFILE}"
    "--drm-connector=${CONNECTOR}"
    "--drm-mode=${MODE}"
    "--volume=${VOLUME}"
    "--mute=${MUTE}"
    "--no-terminal"          # suppress terminal output (clean for server use)
    "--really-quiet"         # suppress non-error log noise
  )

  [[ "${FULLSCREEN}" == "yes" ]] && args+=("--fs")
  [[ "${LOOP}" != "no" ]]        && args+=("--loop-file=${LOOP}")
  [[ "${LOOP_PLAYLIST}" != "no" ]] && args+=("--loop-playlist=${LOOP_PLAYLIST}")
  [[ "${SHUFFLE}" == "yes" ]]    && args+=("--shuffle")
  [[ -n "${DRM_DEVICE}" ]]       && args+=("--drm-device=${DRM_DEVICE}")
  args+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")

  printf '%s\n' "${args[@]}"
}

play_target() {
  local target="$1"
  require mpv mpv

  local mpv_args
  mapfile -t mpv_args < <(build_mpv_args)

  if [[ -d "${target}" ]]; then
    # Directory: build a playlist from all video files found
    echo "Scanning directory: ${target}"
    local files
    mapfile -t files < <(find "${target}" -maxdepth 1 -type f \
      \( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.avi" \
         -o -iname "*.mov" -o -iname "*.webm" -o -iname "*.flv" \
         -o -iname "*.m4v" -o -iname "*.ts"  -o -iname "*.wmv" \) \
      | sort)
    [[ ${#files[@]} -eq 0 ]] && die "No video files found in: ${target}"
    echo "Found ${#files[@]} video(s). Starting playback..."
    exec mpv "${mpv_args[@]}" "${files[@]}"

  elif [[ -f "${target}" ]]; then
    local ext="${target##*.}"
    if [[ "${ext,,}" =~ ^(m3u|m3u8|pls|txt)$ ]]; then
      # Treat as playlist file
      exec mpv "${mpv_args[@]}" --playlist="${target}"
    else
      exec mpv "${mpv_args[@]}" "${target}"
    fi
  else
    die "Target not found: ${target}"
  fi
}

# ── Argument parsing ──────────────────────────────────────────────────────────
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)          usage ;;
    --list-connectors)  list_connectors ;;
    --connector)        CONNECTOR="$2"; shift ;;
    --mode)             MODE="$2"; shift ;;
    --loop)             LOOP="inf" ;;
    --loop=*)           LOOP="${1#--loop=}" ;;
    --loop-playlist)    LOOP_PLAYLIST="inf" ;;
    --loop-playlist=*)  LOOP_PLAYLIST="${1#--loop-playlist=}" ;;
    --shuffle)          SHUFFLE="yes" ;;
    --volume)           VOLUME="$2"; shift ;;
    --mute)             MUTE="yes" ;;
    --no-fullscreen)    FULLSCREEN="no" ;;
    --device)           DRM_DEVICE="$2"; shift ;;
    --profile)          PROFILE="$2"; shift ;;
    --playlist)
      # Treat next arg as a playlist file path
      TARGET="$2"; shift
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    -*)
      EXTRA_ARGS+=("$1")
      ;;
    *)
      [[ -z "${TARGET}" ]] && TARGET="$1" || EXTRA_ARGS+=("$1")
      ;;
  esac
  shift
done

[[ -z "${TARGET}" ]] && { echo "No target specified."; usage; }

play_target "${TARGET}"
