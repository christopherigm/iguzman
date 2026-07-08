#!/usr/bin/env bash
# play-videos.sh - General purpose media player for Ubuntu Server via HDMI (DRM/KMS, no desktop required)
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
#   Enhancement (GPU real-time processing; needs a GPU; best on mpv >= 0.36 gpu-next):
#   --enhance                     4K upscale + deinterlace + judder-smoothing via GPU
#                                   (uses vo=gpu-next when available, else falls back to vo=gpu)
#                                   (checks/installs the GPU's VAAPI drivers on first use)
#   --sdr-to-hdr                  [experimental] Inverse tone-map SDR -> HDR10 (implies --enhance)
#   --hdr-peak <nits|auto>        Target HDR peak brightness for --sdr-to-hdr (default: auto)
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
#   ./play-videos.sh --enhance --mode 3840x2160@60 movie.mkv
#   ./play-videos.sh --enhance --sdr-to-hdr --mode 3840x2160@60 bluray.mkv
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
VOLUME=100             # Volume 0-100
MUTE="no"              # Mute audio
FULLSCREEN="yes"       # Force fullscreen
PROFILE="sw-fast"      # sw-fast recommended for DRM VO (no hw acceleration)
DRM_DEVICE=""          # Override DRM device (e.g. /dev/dri/card1). Empty = auto
AUDIO_OUTPUT="alsa"    # Audio output driver: alsa | pulse | pipewire | jack | auto
AUDIO_DEVICE=""        # ALSA device override (e.g. alsa/hdmi:CARD=PCH,DEV=3). Use --list-audio-devices to find
AUDIO_ONLY="auto"      # auto = detect from file extension | yes | no
ENHANCE="no"           # GPU real-time upscale + deinterlace (vo=gpu-next). Needs a GPU + mpv >= 0.38
SDR_TO_HDR="no"        # [experimental] inverse tone-map SDR -> HDR10 (implies ENHANCE)
HDR_PEAK="auto"        # Target HDR peak nits for --sdr-to-hdr (auto = let libplacebo decide)
ENHANCE_VO=""          # Resolved enhance video output: gpu-next (mpv >= 0.36) or gpu fallback
EXTRA_ARGS=()          # Any extra mpv args passed through

# ── Media type definitions ─────────────────────────────────────────────────────
VIDEO_EXTS="mp4|mkv|avi|mov|webm|flv|m4v|ts|wmv"
AUDIO_EXTS="mp3|flac|wav|ogg|aac|m4a|opus|wma|ape|mka|alac"

is_audio_file() {
  local ext="${1##*.}"
  [[ "$(lc "${ext}")" =~ ^(${AUDIO_EXTS})$ ]]
}

is_video_file() {
  local ext="${1##*.}"
  [[ "$(lc "${ext}")" =~ ^(${VIDEO_EXTS})$ ]]
}

# ── Helpers ───────────────────────────────────────────────────────────────────

# Portable case helper (macOS bash 3 does not support ${var,,})
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,1\}//'
  exit 0
}

die() { echo "ERROR: $*" >&2; exit 1; }

# Offer to apt-install one or more packages. Shared prompt + sudo + update logic.
# Args: <human-purpose> <pkg...>   Returns 0 on success, 1 if declined/unavailable.
apt_install_pkgs() {
  local purpose="$1"; shift
  local pkgs=("$@")
  if ! command -v apt-get &>/dev/null; then
    echo "  No apt-get here - install ${purpose} manually: ${pkgs[*]}" >&2
    return 1
  fi
  local ans="y"
  if [[ -t 0 ]]; then
    printf "  Install %s now with apt (%s)? [Y/n]: " "${purpose}" "${pkgs[*]}" >&2
    read -r ans; ans="${ans:-y}"
  else
    echo "  Non-interactive shell - installing ${purpose} automatically..." >&2
  fi
  [[ "$(lc "${ans}")" =~ ^y ]] || { echo "  Skipped ${purpose}." >&2; return 1; }
  local sudo=""; [[ "$(id -u)" -ne 0 ]] && sudo="sudo"
  echo "  Installing ${pkgs[*]}..." >&2
  ${sudo} apt-get update -qq || true
  ${sudo} apt-get install -y "${pkgs[@]}"
}

# Ensure a command exists; if missing, offer to apt-install its package.
require() {
  local cmd="$1" pkg="$2"
  command -v "${cmd}" &>/dev/null && return 0
  echo "'${cmd}' is not installed." >&2
  apt_install_pkgs "'${cmd}'" "${pkg}" \
    || die "'${cmd}' is required. Install with: sudo apt install ${pkg}"
  command -v "${cmd}" &>/dev/null \
    || die "'${cmd}' still not found after installing '${pkg}'."
}

# For --enhance: make sure the GPU decode stack is present so mpv's hwdec can
# offload to the GPU instead of silently falling back to (much slower) software.
#   Intel / AMD -> VAAPI, verified with vainfo
#   NVIDIA      -> proprietary driver (heavy, release-specific): guide, don't force
ensure_gpu_drivers() {
  local gpu=""
  command -v lspci &>/dev/null && gpu="$(lspci 2>/dev/null | grep -Ei 'vga|3d|display' || true)"

  # Check NVIDIA before AMD, and match ATI only as a whole word - otherwise the
  # "ati" in "Corporation" false-positives every non-AMD card as AMD.
  local vendor="unknown" driver_pkgs=()
  if   echo "${gpu}" | grep -qi  'intel';               then vendor="Intel";  driver_pkgs=(intel-media-va-driver)
  elif echo "${gpu}" | grep -qi  'nvidia';              then vendor="NVIDIA"
  elif echo "${gpu}" | grep -qiE '\b(amd|ati|radeon)\b'; then vendor="AMD";   driver_pkgs=(mesa-va-drivers)
  fi
  echo "  GPU vendor: ${vendor}" >&2

  # NVIDIA: the proprietary driver is large and tied to a kernel/driver release,
  # so we surface the exact steps rather than auto-installing the wrong version.
  if [[ "${vendor}" == "NVIDIA" ]]; then
    if command -v nvidia-smi &>/dev/null; then
      echo "  NVIDIA driver present. For VAAPI decode you may also want: sudo apt install nvidia-vaapi-driver" >&2
    else
      echo "  WARNING: NVIDIA proprietary driver not detected - gpu-next/hwdec need it:" >&2
      echo "             sudo ubuntu-drivers autoinstall" >&2
      echo "             echo 'options nvidia-drm modeset=1' | sudo tee /etc/modprobe.d/nvidia-drm.conf" >&2
      echo "             sudo update-initramfs -u   # then reboot" >&2
      echo "           For VAAPI decode also: sudo apt install nvidia-vaapi-driver" >&2
    fi
    return 0
  fi

  # Intel / AMD (or unknown): verify VAAPI via vainfo, installing the driver if needed.
  if ! command -v vainfo &>/dev/null; then
    local pkgs=(vainfo)
    [[ "${#driver_pkgs[@]}" -gt 0 ]] && pkgs+=("${driver_pkgs[@]}")
    apt_install_pkgs "VAAPI tools/${vendor} driver" "${pkgs[@]}" \
      || { echo "  Continuing without verified VAAPI - hwdec may fall back to software (more CPU)." >&2; return 0; }
  fi

  command -v vainfo &>/dev/null || return 0
  if vainfo &>/dev/null; then
    echo "  VAAPI OK: $(vainfo 2>/dev/null | grep -m1 -i 'driver version' | sed 's/^[[:space:]]*//')" >&2
  else
    echo "  WARNING: vainfo could not initialise VAAPI." >&2
    [[ "${#driver_pkgs[@]}" -gt 0 ]] && { apt_install_pkgs "${vendor} VAAPI driver" "${driver_pkgs[@]}" || true; }
    vainfo &>/dev/null \
      && echo "  VAAPI OK now." >&2 \
      || echo "  hwdec may fall back to software; playback still works but uses more CPU." >&2
  fi
}

# Pick the video output for --enhance. libplacebo's gpu-next (mpv >= 0.36) is
# preferred, but Ubuntu 22.04 et al ship mpv 0.34 which has no gpu-next - fall
# back to the classic gpu VO so --enhance still upscales/deinterlaces/interpolates
# there. Only SDR->HDR inverse tone-mapping is unavailable on the fallback.
select_enhance_vo() {
  local vos; vos="$(mpv --vo=help 2>/dev/null || true)"
  if echo "${vos}" | grep -qE '^[[:space:]]*gpu-next[[:space:]]'; then
    ENHANCE_VO="gpu-next"
  elif echo "${vos}" | grep -qE '^[[:space:]]*gpu[[:space:]]'; then
    ENHANCE_VO="gpu"
    local ver; ver="$(mpv --version 2>/dev/null | head -1 | awk '{print $2}')"
    echo "  NOTE: this mpv (${ver:-unknown}) has no 'gpu-next' VO; falling back to 'gpu'." >&2
    echo "        Core upscale/deinterlace/interpolation still apply. For gpu-next" >&2
    echo "        quality (and SDR->HDR), upgrade mpv to >= 0.36 (libplacebo)." >&2
    if [[ "${SDR_TO_HDR}" == "yes" ]]; then
      echo "  WARNING: --sdr-to-hdr needs gpu-next inverse tone-mapping (unavailable on 'gpu')." >&2
      echo "           Continuing without inverse tone-mapping; output stays SDR." >&2
    fi
  else
    die "mpv has neither a 'gpu-next' nor 'gpu' video output; cannot --enhance."
  fi
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
    # --quiet (not --really-quiet): suppress the verbose banner but still let
    # fatal errors through, so a failed VO/decode isn't silently swallowed.
    "--quiet"
  )

  if [[ "${audio_only}" == "yes" ]]; then
    args+=("--vo=null")
  elif [[ "${ENHANCE}" == "yes" ]]; then
    # GPU path: libplacebo (gpu-next) straight onto the DRM/KMS console. Gives
    # real-time high-quality upscaling, deinterlacing and (optionally) SDR->HDR.
    # hwdec offloads decode to the Intel VAAPI block so the GPU's shader budget
    # is free for scaling. This replaces the software --vo=drm / sw-fast path.
    args+=(
      "--vo=${ENHANCE_VO:-gpu-next}"
      "--gpu-context=drm"
      "--hwdec=auto-safe"
      "--drm-connector=${CONNECTOR}"
      "--drm-mode=${MODE}"
      # Upscaling: sharp EWA-Lanczos for luma, cheaper spline for chroma.
      "--scale=ewa_lanczossharp"
      "--cscale=spline36"
      "--dscale=mitchell"
      "--correct-downscaling=yes"
      "--sigmoid-upscaling=yes"
      # Deinterlace DVD/broadcast; smooth 24p->display cadence cheaply.
      "--deinterlace=yes"
      "--video-sync=display-resample"
      "--interpolation=yes"
      "--tscale=oversample"
    )
    # Inverse tone-mapping: remap Rec.709 SDR into an HDR10 (PQ / BT.2020)
    # container. The drm context emits HDR metadata to the TV (kernel >= 5.4).
    # This is libplacebo-only, so it only applies on the gpu-next VO; on the
    # older 'gpu' fallback the --inverse-tone-mapping/--tone-mapping-mode options
    # don't even exist, so we skip the whole block (warned in select_enhance_vo).
    if [[ "${SDR_TO_HDR}" == "yes" && "${ENHANCE_VO}" == "gpu-next" ]]; then
      args+=(
        "--target-prim=bt.2020"
        "--target-trc=pq"
        "--tone-mapping=bt.2390"
        "--tone-mapping-mode=rgb"
        "--inverse-tone-mapping=yes"
      )
      [[ "${HDR_PEAK}" != "auto" ]] && args+=("--target-peak=${HDR_PEAK}")
    fi
    [[ "${FULLSCREEN}" == "yes" ]] && args+=("--fs")
    [[ -n "${DRM_DEVICE}" ]]       && args+=("--drm-device=${DRM_DEVICE}")
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

  if [[ "${ENHANCE}" == "yes" ]]; then
    select_enhance_vo
    echo "Enhance ON: GPU upscaling via vo=${ENHANCE_VO} (hwdec=vaapi, deinterlace, interpolation)."
    ensure_gpu_drivers
    if [[ "${SDR_TO_HDR}" == "yes" ]]; then
      echo "  [experimental] SDR->HDR inverse tone-mapping enabled - needs an HDR-capable TV + kernel DRM HDR."
      echo "  If the picture looks dull/washed out, the panel likely isn't switching to HDR; drop --sdr-to-hdr."
    fi
    echo "  If playback stutters at 4K on this iGPU, append: -- --scale=spline36 --no-interpolation"
  fi

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

    if [[ "$(lc "${ext}")" =~ ^(m3u|m3u8|pls|txt)$ ]]; then
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
    --enhance)            ENHANCE="yes" ;;
    --sdr-to-hdr)         SDR_TO_HDR="yes"; ENHANCE="yes" ;;
    --hdr-peak)           HDR_PEAK="$2"; shift ;;
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
