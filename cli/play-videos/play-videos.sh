#!/usr/bin/env bash
# play-videos.sh — General purpose media player for Ubuntu Server via HDMI (DRM/KMS, no desktop required)
#
# Usage:
#   ./play-videos.sh [OPTIONS] <file|dir|playlist>
#
# Options:
#   -h, --help                    Show this help message
#
#   Media source:
#   --playlist <file>             Treat <file> as a playlist (.m3u/.m3u8/.pls/.txt)
#   --audio-only                  Force audio-only mode (skips DRM video output)
#
#   Playback:
#   --loop [N|inf]                Loop current file N times or infinitely (default: inf)
#   --loop-playlist [N|inf]       Loop entire playlist N times or infinitely (default: inf)
#   --shuffle                     Shuffle playlist order
#   --no-fullscreen               Disable fullscreen (fullscreen is on by default)
#
#   Display:
#   --connector <name>            DRM connector to use (default: auto)
#   --mode <WxH[@R]>              Display mode: preferred | highest | WxH[@R] (default: preferred)
#   --device <path>               DRM device path (default: auto, e.g. /dev/dri/card1)
#   --profile <name>              mpv profile to use (default: sw-fast)
#   --list-connectors             List available DRM connectors and modes, then exit
#
#   Audio:
#   --volume <0-100>              Playback volume (default: 100)
#   --mute                        Mute audio
#   --ao <driver>                 Audio output driver: alsa | pulse | pipewire | jack | auto (default: alsa)
#   --audio-device <device>       Audio device string, e.g. alsa/hdmi:CARD=PCH,DEV=3 (default: auto)
#   --list-audio-devices          List available audio devices, then exit
#
#   Advanced:
#   -- <mpv-args...>              Pass remaining arguments directly to mpv
#
# Examples:
#   ./play-videos.sh video.mp4
#   ./play-videos.sh song.mp3
#   ./play-videos.sh /media/videos/
#   ./play-videos.sh /media/music/
#   ./play-videos.sh --loop --shuffle /media/
#   ./play-videos.sh --loop=3 --volume 80 video.mp4
#   ./play-videos.sh --audio-only --loop --shuffle /media/music/
#   ./play-videos.sh --connector HDMI-A-1 --mode 1920x1080@60 video.mp4
#   ./play-videos.sh --ao alsa --audio-device 'alsa/hdmi:CARD=PCH,DEV=3' video.mp4
#   ./play-videos.sh --ao alsa --audio-device 'alsa/plughw:CARD=rt5650,DEV=0' song.flac
#   ./play-videos.sh --playlist my-playlist.m3u --loop-playlist --shuffle
#   ./play-videos.sh --list-connectors
#   ./play-videos.sh --list-audio-devices
#   ./play-videos.sh video.mp4 -- --brightness=10 --contrast=5

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
AUDIO_OUTPUT="alsa"    # Audio output driver: alsa | pulse | pipewire | jack | auto
AUDIO_DEVICE=""        # ALSA device override (e.g. alsa/hdmi:CARD=PCH,DEV=3). Use --list-audio-devices to find
AUDIO_ONLY="auto"      # auto = detect from file extension | yes | no
EXTRA_ARGS=()          # Any extra mpv args passed through

# ── Media type definitions ─────────────────────────────────────────────────────
VIDEO_EXTS="mp4|mkv|avi|mov|webm|flv|m4v|ts|wmv"
AUDIO_EXTS="mp3|flac|wav|ogg|aac|m4a|opus|wma|ape|mka|alac"

is_audio_file() {
  local ext="${1##*.}"
  [[ "${ext,,}" =~ ^(${AUDIO_EXTS})$ ]]
}

is_video_file() {
  local ext="${1##*.}"
  [[ "${ext,,}" =~ ^(${VIDEO_EXTS})$ ]]
}

# ── Helpers ───────────────────────────────────────────────────────────────────
usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,1\}//'
  exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }

require() {
  command -v "$1" &>/dev/null || die "'$1' is not installed. Install with: sudo apt install $2"
}

check_group() {
  local group="$1" purpose="$2"
  if ! id -nG 2>/dev/null | grep -qw "${group}"; then
    echo "WARNING: current user '$(id -un)' is not in the '${group}' group." >&2
    echo "         ${purpose}" >&2
    echo "         Fix with:" >&2
    echo "           sudo usermod -aG ${group} $(id -un)" >&2
    echo "         Then log out and back in (or run: newgrp ${group})" >&2
  fi
}

check_video_group() { check_group video "DRM device access may fail."; }
check_audio_group() { check_group audio "ALSA device access may fail."; }

list_connectors() {
  require mpv mpv
  check_video_group
  echo "Available DRM connectors:"
  mpv --vo=drm --drm-connector=help /dev/null 2>&1 | grep -E 'connector|^  ' || true
  echo ""
  echo "Available DRM modes (first connector):"
  mpv --vo=drm --drm-mode=help /dev/null 2>&1 | grep -E 'mode|^  ' || true
  exit 0
}

list_audio_devices() {
  require aplay alsa-utils
  check_audio_group
  echo "Available ALSA audio devices:"
  aplay -l || die "No ALSA devices found"
  echo ""
  echo "To use a device with --audio-device, format it as:"
  echo "  HDMI:    alsa/hdmi:CARD=<card-name>,DEV=<device-number>"
  echo "  Speaker: alsa/plughw:CARD=<card-name>,DEV=<device-number>"
  echo "Examples:"
  echo "  --audio-device 'alsa/hdmi:CARD=PCH,DEV=3'"
  echo "  --audio-device 'alsa/plughw:CARD=rt5650,DEV=0'"
  exit 0
}

build_mpv_args() {
  local audio_only="${1:-no}"
  local args=(
    "--volume=${VOLUME}"
    "--mute=${MUTE}"
    "--ao=${AUDIO_OUTPUT}"
    "--really-quiet"
  )

  if [[ "${audio_only}" == "yes" ]]; then
    args+=("--vo=null")
  else
    args+=(
      "--vo=drm"
      "--profile=${PROFILE}"
      "--drm-connector=${CONNECTOR}"
      "--drm-mode=${MODE}"
    )
    [[ "${FULLSCREEN}" == "yes" ]] && args+=("--fs")
    [[ -n "${DRM_DEVICE}" ]]       && args+=("--drm-device=${DRM_DEVICE}")
  fi

  [[ "${LOOP}" != "no" ]]           && args+=("--loop-file=${LOOP}")
  [[ "${LOOP_PLAYLIST}" != "no" ]]  && args+=("--loop-playlist=${LOOP_PLAYLIST}")
  [[ "${SHUFFLE}" == "yes" ]]       && args+=("--shuffle")
  [[ -n "${AUDIO_DEVICE}" ]]        && args+=("--audio-device=${AUDIO_DEVICE}")
  args+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")

  printf '%s\n' "${args[@]}"
}

play_target() {
  local target="$1"
  require mpv mpv
  check_audio_group

  local audio_only="${AUDIO_ONLY}"

  if [[ -d "${target}" ]]; then
    echo "Scanning directory: ${target}"
    local files
    mapfile -t files < <(find "${target}" -maxdepth 1 -type f \
      \( $(printf -- '-iname "*.%s" -o ' $(echo "${VIDEO_EXTS}|${AUDIO_EXTS}" | tr '|' ' ') | sed 's/ -o $//') \) \
      | sort)
    [[ ${#files[@]} -eq 0 ]] && die "No media files found in: ${target}"

    # If audio-only is auto, check if all found files are audio
    if [[ "${audio_only}" == "auto" ]]; then
      local has_video=no
      for f in "${files[@]}"; do is_video_file "${f}" && { has_video=yes; break; }; done
      [[ "${has_video}" == "no" ]] && audio_only="yes" || audio_only="no"
    fi

    [[ "${audio_only}" == "no" ]] && check_video_group
    local type_label; [[ "${audio_only}" == "yes" ]] && type_label="audio" || type_label="media"
    echo "Found ${#files[@]} ${type_label} file(s). Starting playback..."

    local mpv_args; mapfile -t mpv_args < <(build_mpv_args "${audio_only}")
    exec mpv "${mpv_args[@]}" "${files[@]}"

  elif [[ -f "${target}" ]]; then
    local ext="${target##*.}"

    if [[ "${ext,,}" =~ ^(m3u|m3u8|pls|txt)$ ]]; then
      [[ "${audio_only}" == "auto" ]] && audio_only="no"
      [[ "${audio_only}" == "no" ]] && check_video_group
      local mpv_args; mapfile -t mpv_args < <(build_mpv_args "${audio_only}")
      exec mpv "${mpv_args[@]}" --playlist="${target}"
    else
      if [[ "${audio_only}" == "auto" ]]; then
        is_audio_file "${target}" && audio_only="yes" || audio_only="no"
      fi
      [[ "${audio_only}" == "no" ]] && check_video_group
      local mpv_args; mapfile -t mpv_args < <(build_mpv_args "${audio_only}")
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
    -h|--help)            usage ;;
    --list-connectors)    list_connectors ;;
    --list-audio-devices) list_audio_devices ;;
    --audio-only)         AUDIO_ONLY="yes" ;;
    --ao)                 AUDIO_OUTPUT="$2"; shift ;;
    --audio-device)       AUDIO_DEVICE="$2"; shift ;;
    --connector)          CONNECTOR="$2"; shift ;;
    --mode)               MODE="$2"; shift ;;
    --loop)               LOOP="inf" ;;
    --loop=*)             LOOP="${1#--loop=}" ;;
    --loop-playlist)      LOOP_PLAYLIST="inf" ;;
    --loop-playlist=*)    LOOP_PLAYLIST="${1#--loop-playlist=}" ;;
    --shuffle)            SHUFFLE="yes" ;;
    --volume)             VOLUME="$2"; shift ;;
    --mute)               MUTE="yes" ;;
    --no-fullscreen)      FULLSCREEN="no" ;;
    --device)             DRM_DEVICE="$2"; shift ;;
    --profile)            PROFILE="$2"; shift ;;
    --playlist)
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
