#!/usr/bin/env bash
# play-videos.sh - General purpose media player for Ubuntu Server via HDMI (DRM/KMS, no desktop required)
#
# Usage:
#   ./play-videos.sh [OPTIONS] <file|dir|playlist>
#   ./play-videos.sh                 # no arguments: open the interactive menu
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
#   ./play-videos.sh                          # interactive menu (no flags)
#
# Playback controls (keys, while a video/audio is playing):
#   Space / p         Pause / resume
#   Left / Right      Seek backward / forward 5s
#   Up / Down         Volume up / down
#   9 / 0             Volume down / up (mpv default)
#   m                 Mute / unmute
#   f                 Toggle fullscreen
#   < / >             Previous / next in playlist
#   [ / ]             Slower / faster playback speed
#   j                 Cycle subtitle tracks
#   #                 Cycle audio tracks
#   q / Esc           Quit

# Note: -e is intentionally omitted. The interactive menu is a long-lived loop
# where individual handlers (device probes, mpv runs) may exit non-zero without
# meaning the whole session should die; explicit die/require still exit hard.
set -uo pipefail

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
RUN_MODE="oneshot"     # oneshot (flags -> exec mpv) | menu (loop -> run mpv, return)
LAST_TARGET=""         # Menu: last path played, offered as the default next time
LANG_CHOICE="en"       # Menu language: en | es

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

# Print connectors/modes (no exit) so both the --list-connectors flag and the
# interactive menu can share the same output.
show_connectors() {
  require mpv mpv
  check_video_group
  echo "Available DRM connectors:"
  mpv --vo=drm --drm-connector=help /dev/null 2>&1 | grep -E 'connector|^  ' || true
  echo ""
  echo "Available DRM modes (first connector):"
  mpv --vo=drm --drm-mode=help /dev/null 2>&1 | grep -E 'mode|^  ' || true
}

show_audio_devices() {
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
}

list_connectors()    { show_connectors;    exit 0; }
list_audio_devices() { show_audio_devices; exit 0; }

# mpv has no command-line flag for individual key bindings, so we materialise a
# tiny input.conf and point mpv at it with --input-conf. This remaps Up/Down
# from their default 60s seek to volume up/down (add volume clamps to 0..100).
# Written to a stable path (not mktemp) because oneshot mode `exec`s mpv, so an
# EXIT trap would never fire to clean a temp file up.
INPUT_CONF="${TMPDIR:-/tmp}/play-videos-input.conf"
ensure_input_conf() {
  cat > "${INPUT_CONF}" 2>/dev/null <<'EOF' || return 1
UP   add volume 5
DOWN add volume -5
EOF
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
  ensure_input_conf                 && args+=("--input-conf=${INPUT_CONF}")
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
    run_mpv "${mpv_args[@]}" "${files[@]}"

  elif [[ -f "${target}" ]]; then
    local ext="${target##*.}"

    if [[ "$(lc "${ext}")" =~ ^(m3u|m3u8|pls|txt)$ ]]; then
      [[ "${audio_only}" == "auto" ]] && audio_only="no"
      [[ "${audio_only}" == "no" ]] && check_video_group
      local mpv_args; mapfile -t mpv_args < <(build_mpv_args "${audio_only}")
      run_mpv "${mpv_args[@]}" --playlist="${target}"
    else
      if [[ "${audio_only}" == "auto" ]]; then
        is_audio_file "${target}" && audio_only="yes" || audio_only="no"
      fi
      [[ "${audio_only}" == "no" ]] && check_video_group
      local mpv_args; mapfile -t mpv_args < <(build_mpv_args "${audio_only}")
      run_mpv "${mpv_args[@]}" "${target}"
    fi
  else
    die "Target not found: ${target}"
  fi
}

# Run mpv. In one-shot (flag) mode we exec so mpv replaces this process. In menu
# mode we must return to the loop afterwards, so we run it as a child instead.
run_mpv() {
  if [[ "${RUN_MODE}" == "menu" ]]; then
    mpv "$@"
  else
    exec mpv "$@"
  fi
}

# ══ Interactive menu (shown when the script is run with no arguments) ══════════
# The look-and-feel mirrors cli/setup-wifi/setup-wifi.sh: an arrow-key select
# list, a boxed header, and a bilingual (en/es) string table.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── ANSI colors ───────────────────────────────────────────────────────────────
RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

say_ok()   { printf "  %s %s\n" "$(clr_bold_green '✓')" "$*"; }
say_warn() { printf "  %s %s\n" "$(clr_bold_yellow '!')" "$*"; }
say_info() { printf "  %s\n"     "$(clr_dim "$*")"; }

# ── i18n ──────────────────────────────────────────────────────────────────────
setup_strings() {
  if [[ "$1" == "es" ]]; then
    WELCOME="Reproductor multimedia — HDMI (DRM/KMS)"
    SUBTITLE="Reproduce audio y vídeo por HDMI sin escritorio."
    NAV_HINT="Flechas para navegar · Enter para elegir · Ctrl+C para salir"
    MENU_TITLE="¿Qué deseas hacer?"
    BYE="👋"
    CANCELLED="Cancelado."
    PRESS_ENTER="Pulsa Enter para volver al menú…"
    STARTING="Iniciando reproducción…"
    INVALID_NUMBER="Número no válido."
    BACK="← Volver"
    SET_TO="Ajustado a: %s"
    VAL_ON="activado"; VAL_OFF="desactivado"; VAL_AUTO="auto"
    VAL_INF="infinito"; VAL_YES="sí"; VAL_NO="no"
    M_PLAY="Reproducir medios (audio o vídeo)"
    M_AUDIO_DEVICE="Dispositivo de audio"
    M_CONNECTOR="Conector de vídeo"
    M_MODE="Modo de pantalla"
    M_LOOP="Repetir"
    M_VOLUME="Volumen"
    M_ENHANCE="Mejorar (GPU)"
    M_AO="Salida de audio"
    M_SHUFFLE="Aleatorio"
    M_MUTE="Silencio"
    M_AUDIO_ONLY="Solo audio"
    M_LIST_CONNECTORS="Listar conectores"
    M_LIST_AUDIO="Listar dispositivos de audio"
    M_FIX="Reparar problemas de audio/vídeo"
    M_HELP="Ayuda: teclas de reproducción"
    M_EXIT="Salir"
    HELP_TITLE="Controles de reproducción (durante la reproducción)"
    HK_PAUSE="Pausar / reanudar"
    HK_SEEK="Retroceder / avanzar 5 s"
    HK_VOLUME="Subir / bajar volumen"
    HK_VOLUME2="Bajar / subir volumen (predeterminado de mpv)"
    HK_MUTE="Silenciar / activar sonido"
    HK_FULLSCREEN="Alternar pantalla completa"
    HK_PLAYLIST="Anterior / siguiente en la lista"
    HK_SPEED="Reproducir más lento / más rápido"
    HK_SUBS="Cambiar de subtítulos"
    HK_AUDIO_TRACK="Cambiar de pista de audio"
    HK_QUIT="Salir"
    PROMPT_PATH="Archivo, carpeta o playlist"
    PATH_NOT_FOUND="No se encontró: %s"
    SELECT_AUDIO_DEVICE="Selecciona un dispositivo de audio"
    DEV_AUTO="Automático (predeterminado)"
    DEV_MANUAL="Escribir el dispositivo manualmente…"
    NO_AUDIO_DEVICES="No se encontraron dispositivos de audio."
    PROMPT_AUDIO_MANUAL="Dispositivo (p. ej. alsa/hdmi:CARD=PCH,DEV=3)"
    SELECT_CONNECTOR="Selecciona un conector de vídeo"
    CONN_AUTO="Automático (primer conector activo)"
    CONN_MANUAL="Escribir el conector manualmente…"
    NO_CONNECTORS="No se pudieron detectar conectores DRM."
    PROMPT_CONNECTOR_MANUAL="Conector (p. ej. HDMI-A-1, DP-1)"
    SELECT_MODE="Selecciona el modo de pantalla"
    MODE_PREFERRED="preferido (predeterminado)"
    MODE_HIGHEST="el más alto disponible"
    MODE_CUSTOM="Personalizado (AnchoxAlto[@Hz])…"
    PROMPT_MODE="Modo (p. ej. 1920x1080@60)"
    SELECT_LOOP="Repetición"
    LOOP_OFF="Desactivada"
    LOOP_INF="Infinita"
    LOOP_CUSTOM="Número de repeticiones…"
    PROMPT_LOOP_N="¿Cuántas repeticiones?"
    PROMPT_VOLUME="Volumen (0-100)"
    SELECT_ENHANCE="Mejora por GPU"
    ENHANCE_OFF="Desactivada"
    ENHANCE_ON="Activada (escalado 4K + desentrelazado)"
    ENHANCE_HDR="Activada + SDR→HDR [experimental]"
    SELECT_AO="Controlador de salida de audio"
    FIX_RUNNING="Revisando el sistema de audio y vídeo…"
    FIX_DRM_OK="Dispositivos DRM presentes: %s"
    FIX_DRM_NONE="No se encontraron dispositivos DRM en /dev/dri (¿GPU/HDMI?)."
    FIX_NO_FIXER="No se encontró fix-audio.sh junto a este script."
  else
    WELCOME="Media player — HDMI (DRM/KMS)"
    SUBTITLE="Play audio and video over HDMI, no desktop required."
    NAV_HINT="Arrow keys to navigate · Enter to select · Ctrl+C to quit"
    MENU_TITLE="What would you like to do?"
    BYE="👋"
    CANCELLED="Cancelled."
    PRESS_ENTER="Press Enter to return to the menu…"
    STARTING="Starting playback…"
    INVALID_NUMBER="Not a valid number."
    BACK="← Back"
    SET_TO="Set to: %s"
    VAL_ON="on"; VAL_OFF="off"; VAL_AUTO="auto"
    VAL_INF="infinite"; VAL_YES="yes"; VAL_NO="no"
    M_PLAY="Play media (audio or video)"
    M_AUDIO_DEVICE="Audio device"
    M_CONNECTOR="Video connector"
    M_MODE="Display mode"
    M_LOOP="Loop"
    M_VOLUME="Volume"
    M_ENHANCE="Enhance (GPU)"
    M_AO="Audio output"
    M_SHUFFLE="Shuffle"
    M_MUTE="Mute"
    M_AUDIO_ONLY="Audio-only"
    M_LIST_CONNECTORS="List connectors"
    M_LIST_AUDIO="List audio devices"
    M_FIX="Fix audio / video issues"
    M_HELP="Help: playback keys"
    M_EXIT="Exit"
    HELP_TITLE="Playback controls (while playing)"
    HK_PAUSE="Pause / resume"
    HK_SEEK="Seek backward / forward 5s"
    HK_VOLUME="Volume up / down"
    HK_VOLUME2="Volume down / up (mpv default)"
    HK_MUTE="Mute / unmute"
    HK_FULLSCREEN="Toggle fullscreen"
    HK_PLAYLIST="Previous / next in playlist"
    HK_SPEED="Slower / faster playback"
    HK_SUBS="Cycle subtitle tracks"
    HK_AUDIO_TRACK="Cycle audio tracks"
    HK_QUIT="Quit"
    PROMPT_PATH="File, folder or playlist"
    PATH_NOT_FOUND="Not found: %s"
    SELECT_AUDIO_DEVICE="Select an audio device"
    DEV_AUTO="Automatic (default)"
    DEV_MANUAL="Type the device manually…"
    NO_AUDIO_DEVICES="No audio devices found."
    PROMPT_AUDIO_MANUAL="Device (e.g. alsa/hdmi:CARD=PCH,DEV=3)"
    SELECT_CONNECTOR="Select a video connector"
    CONN_AUTO="Automatic (first active connector)"
    CONN_MANUAL="Type the connector manually…"
    NO_CONNECTORS="Could not detect any DRM connectors."
    PROMPT_CONNECTOR_MANUAL="Connector (e.g. HDMI-A-1, DP-1)"
    SELECT_MODE="Select the display mode"
    MODE_PREFERRED="preferred (default)"
    MODE_HIGHEST="highest available"
    MODE_CUSTOM="Custom (WxH[@Hz])…"
    PROMPT_MODE="Mode (e.g. 1920x1080@60)"
    SELECT_LOOP="Loop"
    LOOP_OFF="Off"
    LOOP_INF="Infinite"
    LOOP_CUSTOM="A number of times…"
    PROMPT_LOOP_N="How many times?"
    PROMPT_VOLUME="Volume (0-100)"
    SELECT_ENHANCE="GPU enhancement"
    ENHANCE_OFF="Off"
    ENHANCE_ON="On (4K upscale + deinterlace)"
    ENHANCE_HDR="On + SDR→HDR [experimental]"
    SELECT_AO="Audio output driver"
    FIX_RUNNING="Checking the audio and video stack…"
    FIX_DRM_OK="DRM devices present: %s"
    FIX_DRM_NONE="No DRM devices found in /dev/dri (GPU/HDMI missing?)."
    FIX_NO_FIXER="fix-audio.sh not found next to this script."
  fi
}

# ── UI helpers ────────────────────────────────────────────────────────────────
print_header() {
  local line; line="$(printf '─%.0s' {1..58})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")"   "$(clr_bold_cyan '│')"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")"  "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }
screen()    { clear; print_header; }

# Single-select list. Input: MENU_ITEMS[] ; Output: MENU_SELECTED (index).
interactive_select() {
  local num="${#MENU_ITEMS[@]}" cursor=0
  render_select() {
    local j lbl ptr label_str
    for j in "${!MENU_ITEMS[@]}"; do
      lbl="$(pad_right "${MENU_ITEMS[$j]}" 54)"
      if [[ $j -eq $cursor ]]; then
        ptr="$(clr_cyan '▶')"; label_str="$(clr_bold_cyan "${lbl}")"
      else
        ptr=" "; label_str="${lbl}"
      fi
      printf "  %s  %s\n" "${ptr}" "${label_str}"
    done
  }
  render_select
  printf '\033[?25l'
  while true; do
    local key seq
    IFS= read -r -s -n1 key 2>/dev/null || key=""
    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -r -s -n2 -t 1 seq 2>/dev/null || seq=""
      if [[ "${seq}" == '[A' ]]; then
        cursor=$(( (cursor - 1 + num) % num )); printf "\033[%dA" "${num}"; render_select
      elif [[ "${seq}" == '[B' ]]; then
        cursor=$(( (cursor + 1) % num )); printf "\033[%dA" "${num}"; render_select
      fi
      continue
    fi
    [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]] && break
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi
  done
  printf '\033[?25h'; echo ""
  MENU_SELECTED="${cursor}"
}

prompt_visible() {
  local label="$1" default="${2:-}" val
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  IFS= read -r val </dev/tty || true
  [[ -z "${val}" && -n "${default}" ]] && val="${default}"
  printf '%s' "${val}"
}

prompt_enter() {
  printf "  %s " "$(clr_dim "${PRESS_ENTER}")" >/dev/tty
  IFS= read -r _ </dev/tty || true
}

# ── Value formatters (shown inline in the main-menu labels) ────────────────────
fmt_onoff()  { [[ "$1" == "yes" ]] && printf '%s' "${VAL_ON}" || printf '%s' "${VAL_OFF}"; }
fmt_loop()   { case "${LOOP}" in no) printf '%s' "${VAL_OFF}";; inf) printf '%s' "${VAL_INF}";; *) printf '%s' "${LOOP}";; esac; }
fmt_enhance() {
  if   [[ "${SDR_TO_HDR}" == "yes" ]]; then printf '%s' "${VAL_ON} + HDR"
  elif [[ "${ENHANCE}"    == "yes" ]]; then printf '%s' "${VAL_ON}"
  else printf '%s' "${VAL_OFF}"; fi
}
fmt_audio_device() { [[ -z "${AUDIO_DEVICE}" ]] && printf '%s' "${VAL_AUTO}" || printf '%s' "${AUDIO_DEVICE#alsa/}"; }
fmt_audio_only()   { case "${AUDIO_ONLY}" in yes) printf '%s' "${VAL_YES}";; no) printf '%s' "${VAL_NO}";; *) printf '%s' "${VAL_AUTO}";; esac; }
kv() { printf '%s: %s' "$1" "$2"; }

# ── Menu handlers ─────────────────────────────────────────────────────────────
menu_play() {
  screen
  local target; target="$(prompt_visible "${PROMPT_PATH}" "${LAST_TARGET}")"
  if [[ -z "${target}" ]]; then say_info "${CANCELLED}"; return; fi
  if [[ ! -e "${target}" ]]; then
    say_warn "$(printf "${PATH_NOT_FOUND}" "${target}")"; prompt_enter; return
  fi
  LAST_TARGET="${target}"
  echo ""; say_info "${STARTING}"; echo ""
  # A subshell contains any die/exit inside play_target so the menu survives.
  ( play_target "${target}" ) || true
  echo ""; prompt_enter
}

menu_audio_device() {
  screen
  require aplay alsa-utils || { prompt_enter; return; }
  local -a labels=() values=() line
  labels+=("${DEV_AUTO}"); values+=("")
  while IFS= read -r line; do
    [[ "${line}" =~ ^card\ ([0-9]+):\ ([^\ ]+)\ \[([^]]*)\],\ device\ ([0-9]+):\ (.*)$ ]] || continue
    local cname="${BASH_REMATCH[2]}" cfull="${BASH_REMATCH[3]}" dnum="${BASH_REMATCH[4]}" ddesc="${BASH_REMATCH[5]}"
    ddesc="${ddesc%% \[*}"
    local kind="plughw"
    [[ "${ddesc} ${cfull}" =~ [Hh][Dd][Mm][Ii] ]] && kind="hdmi"
    labels+=("${cname} · dev ${dnum} · ${ddesc}")
    values+=("alsa/${kind}:CARD=${cname},DEV=${dnum}")
  done < <(aplay -l 2>/dev/null | grep '^card' || true)
  labels+=("${DEV_MANUAL}"); values+=("__manual__")
  labels+=("${BACK}");       values+=("__back__")

  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_AUDIO_DEVICE}")"
  MENU_ITEMS=("${labels[@]}"); interactive_select
  case "${values[$MENU_SELECTED]}" in
    __back__)   : ;;
    __manual__) AUDIO_DEVICE="$(prompt_visible "${PROMPT_AUDIO_MANUAL}" "${AUDIO_DEVICE}")" ;;
    "")         AUDIO_DEVICE="" ;;
    *)          AUDIO_DEVICE="${values[$MENU_SELECTED]}" ;;
  esac
}

menu_connector() {
  screen
  require mpv mpv || { prompt_enter; return; }
  local -a conns=()
  mapfile -t conns < <(mpv --vo=drm --drm-connector=help /dev/null 2>&1 \
    | grep -oE '(eDP|LVDS|DSI|HDMI-A|HDMI-B|HDMI|DP|DVI-I|DVI-D|VGA|Composite|Virtual)-[0-9]+' \
    | sort -u)
  local -a labels=("${CONN_AUTO}") values=("auto")
  local c
  for c in "${conns[@]}"; do labels+=("${c}"); values+=("${c}"); done
  labels+=("${CONN_MANUAL}"); values+=("__manual__")
  labels+=("${BACK}");        values+=("__back__")

  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_CONNECTOR}")"
  [[ ${#conns[@]} -eq 0 ]] && say_warn "${NO_CONNECTORS}" && echo ""
  MENU_ITEMS=("${labels[@]}"); interactive_select
  case "${values[$MENU_SELECTED]}" in
    __back__)   : ;;
    __manual__) CONNECTOR="$(prompt_visible "${PROMPT_CONNECTOR_MANUAL}" "${CONNECTOR}")" ;;
    *)          CONNECTOR="${values[$MENU_SELECTED]}" ;;
  esac
}

menu_mode() {
  screen
  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_MODE}")"
  MENU_ITEMS=("${MODE_PREFERRED}" "${MODE_HIGHEST}" "${MODE_CUSTOM}" "${BACK}")
  interactive_select
  case "${MENU_SELECTED}" in
    0) MODE="preferred" ;;
    1) MODE="highest" ;;
    2) local m; m="$(prompt_visible "${PROMPT_MODE}" "${MODE}")"; [[ -n "${m}" ]] && MODE="${m}" ;;
    3) : ;;
  esac
}

menu_loop() {
  screen
  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_LOOP}")"
  MENU_ITEMS=("${LOOP_OFF}" "${LOOP_INF}" "${LOOP_CUSTOM}" "${BACK}")
  interactive_select
  case "${MENU_SELECTED}" in
    0) LOOP="no" ;;
    1) LOOP="inf" ;;
    2) local n; n="$(prompt_visible "${PROMPT_LOOP_N}" "")"
       if [[ "${n}" =~ ^[0-9]+$ ]]; then LOOP="${n}"; else say_warn "${INVALID_NUMBER}"; prompt_enter; fi ;;
    3) : ;;
  esac
}

menu_volume() {
  screen
  local v; v="$(prompt_visible "${PROMPT_VOLUME}" "${VOLUME}")"
  if [[ "${v}" =~ ^[0-9]+$ ]] && [[ "${v}" -le 100 ]]; then
    VOLUME="${v}"
  else
    say_warn "${INVALID_NUMBER}"; prompt_enter
  fi
}

menu_enhance() {
  screen
  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_ENHANCE}")"
  MENU_ITEMS=("${ENHANCE_OFF}" "${ENHANCE_ON}" "${ENHANCE_HDR}" "${BACK}")
  interactive_select
  case "${MENU_SELECTED}" in
    0) ENHANCE="no";  SDR_TO_HDR="no" ;;
    1) ENHANCE="yes"; SDR_TO_HDR="no" ;;
    2) ENHANCE="yes"; SDR_TO_HDR="yes" ;;
    3) : ;;
  esac
}

menu_ao() {
  screen
  printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_AO}")"
  MENU_ITEMS=("alsa" "pulse" "pipewire" "jack" "auto" "${BACK}")
  interactive_select
  [[ "${MENU_SELECTED}" -lt 5 ]] && AUDIO_OUTPUT="${MENU_ITEMS[$MENU_SELECTED]}"
}

menu_toggle_shuffle()    { [[ "${SHUFFLE}" == "yes" ]] && SHUFFLE="no" || SHUFFLE="yes"; }
menu_toggle_mute()       { [[ "${MUTE}"    == "yes" ]] && MUTE="no"    || MUTE="yes"; }
menu_toggle_audio_only() {
  case "${AUDIO_ONLY}" in auto) AUDIO_ONLY="yes";; yes) AUDIO_ONLY="no";; *) AUDIO_ONLY="auto";; esac
}

menu_list_connectors() { screen; show_connectors    || true; echo ""; prompt_enter; }
menu_list_audio()      { screen; show_audio_devices || true; echo ""; prompt_enter; }

menu_fix() {
  screen
  say_info "${FIX_RUNNING}"; echo ""
  check_video_group
  local cards; cards="$(ls /dev/dri/card* 2>/dev/null | tr '\n' ' ')"
  if [[ -n "${cards}" ]]; then
    say_ok "$(printf "${FIX_DRM_OK}" "${cards}")"
  else
    say_warn "${FIX_DRM_NONE}"
  fi
  local fixer="${SCRIPT_DIR}/fix-audio.sh"
  echo ""
  if [[ -f "${fixer}" ]]; then
    bash "${fixer}" || true
  else
    say_warn "${FIX_NO_FIXER}"
  fi
  echo ""; prompt_enter
}

menu_help() {
  screen
  printf "  %s\n\n" "$(clr_bold_cyan "${HELP_TITLE}")"
  # Keys are printed literally (not padded with printf %-Ns) because the arrow
  # glyphs are multi-byte, and %-Ns pads by byte count, which would misalign.
  help_row() { printf "  %s\t%s\n" "$(clr_bold_cyan "$1")" "$2"; }
  help_row "Space / p"    "${HK_PAUSE}"
  help_row "← / →"        "${HK_SEEK}"
  help_row "↑ / ↓"        "${HK_VOLUME}"
  help_row "9 / 0"        "${HK_VOLUME2}"
  help_row "m"            "${HK_MUTE}"
  help_row "f"            "${HK_FULLSCREEN}"
  help_row "< / >"        "${HK_PLAYLIST}"
  help_row "[ / ]"        "${HK_SPEED}"
  help_row "j"            "${HK_SUBS}"
  help_row "#"            "${HK_AUDIO_TRACK}"
  help_row "q / Esc"      "${HK_QUIT}"
  echo ""; prompt_enter
}

# ── Main menu loop ────────────────────────────────────────────────────────────
build_main_menu() {
  MENU_ITEMS=(); ACTIONS=()
  add() { MENU_ITEMS+=("$1"); ACTIONS+=("$2"); }
  add "${M_PLAY}"                                                     play
  add "$(kv "${M_AUDIO_DEVICE}" "$(fmt_audio_device)")"              audio_device
  add "$(kv "${M_CONNECTOR}"    "${CONNECTOR}")"                     connector
  add "$(kv "${M_MODE}"         "${MODE}")"                          mode
  add "$(kv "${M_LOOP}"         "$(fmt_loop)")"                      loop
  add "$(kv "${M_VOLUME}"       "${VOLUME}")"                        volume
  add "$(kv "${M_ENHANCE}"      "$(fmt_enhance)")"                   enhance
  add "$(kv "${M_AO}"           "${AUDIO_OUTPUT}")"                  ao
  add "$(kv "${M_SHUFFLE}"      "$(fmt_onoff "${SHUFFLE}")")"        shuffle
  add "$(kv "${M_MUTE}"         "$(fmt_onoff "${MUTE}")")"           mute
  add "$(kv "${M_AUDIO_ONLY}"   "$(fmt_audio_only)")"               audio_only
  add "${M_LIST_CONNECTORS}"                                        list_connectors
  add "${M_LIST_AUDIO}"                                             list_audio
  add "${M_FIX}"                                                    fix
  add "${M_HELP}"                                                   help
  add "${M_EXIT}"                                                   exit
}

run_menu() {
  printf "  %s" "Select language / Selecciona idioma [en/es] (en): "
  local raw; read -r raw || true
  [[ "$(lc "${raw}")" == es* ]] && LANG_CHOICE="es"
  setup_strings "${LANG_CHOICE}"

  while true; do
    screen
    build_main_menu
    printf "  %s\n" "$(clr_bold_cyan "${MENU_TITLE}")"
    printf "  %s\n\n" "$(clr_dim "${NAV_HINT}")"
    interactive_select
    echo ""
    case "${ACTIONS[$MENU_SELECTED]}" in
      play)            menu_play ;;
      audio_device)    menu_audio_device ;;
      connector)       menu_connector ;;
      mode)            menu_mode ;;
      loop)            menu_loop ;;
      volume)          menu_volume ;;
      enhance)         menu_enhance ;;
      ao)              menu_ao ;;
      shuffle)         menu_toggle_shuffle ;;
      mute)            menu_toggle_mute ;;
      audio_only)      menu_toggle_audio_only ;;
      list_connectors) menu_list_connectors ;;
      list_audio)      menu_list_audio ;;
      fix)             menu_fix ;;
      help)            menu_help ;;
      exit)            screen; printf "  %s\n\n" "$(clr_dim "${BYE}")"; exit 0 ;;
    esac
  done
}

# ── Argument parsing ──────────────────────────────────────────────────────────
TARGET=""
ORIG_ARGC=$#

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

# No arguments at all -> interactive menu. Any flag or target -> classic one-shot.
if [[ "${ORIG_ARGC}" -eq 0 ]]; then
  RUN_MODE="menu"
  run_menu
  exit 0
fi

[[ -z "${TARGET}" ]] && { echo "No target specified."; usage; }

RUN_MODE="oneshot"
play_target "${TARGET}"
