#!/usr/bin/env bash
# lib/probe.sh - Video metadata probing (duration, dimensions, framerate, HDR type)
# Depends on: FFMPEG_BIN, FFPROBE_BIN (set by ffmpeg-bootstrap.sh)

# Thread flags shared across all ffmpeg calls
THREAD_COUNT="$(nproc 2>/dev/null || echo 4)"
THREAD_FLAGS=(-threads "${THREAD_COUNT}" -filter_threads "${THREAD_COUNT}" -filter_complex_threads "${THREAD_COUNT}")

# ── Filter availability cache ─────────────────────────────────────────────────

_FILTER_CACHE=""

_populate_filter_cache() {
  [[ -n "${_FILTER_CACHE}" ]] && return 0
  _FILTER_CACHE="$("${FFMPEG_BIN}" -hide_banner -filters 2>/dev/null || true)"
}

check_vidstab() {
  _populate_filter_cache
  grep -q 'vidstabdetect' <<< "${_FILTER_CACHE}"
}

check_deshake() {
  _populate_filter_cache
  grep -q 'deshake' <<< "${_FILTER_CACHE}"
}

check_zscale() {
  _populate_filter_cache
  grep -q 'zscale' <<< "${_FILTER_CACHE}"
}

# ── Duration + FPS ────────────────────────────────────────────────────────────

# Outputs: "<duration_sec> <fps_int>"
probe_video() {
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

# ── Dimensions ────────────────────────────────────────────────────────────────

# Outputs: "<width> <height>" of the first video stream.
probe_dimensions() {
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

# ── Stream mapping (keep all audio + subtitles) ───────────────────────────────
#
# Builds the -map / codec args needed to carry every audio track and every
# (compatible) subtitle track into the output, instead of FFmpeg's default of
# one stream per type.
#
# Args:
#   $1  primary    - the input being encoded (index 0): video + audio source
#   $2  sub_src    - the ORIGINAL input that holds the subtitles (== primary when
#                    no intermediate was produced; differs after a pre-transcode)
#   $3  out        - the output path (extension decides subtitle handling)
#
# Sets:
#   STREAM_EXTRA_INPUTS  - extra "-i <sub_src>" when subtitles live in a separate
#                          file from the primary (else empty)
#   STREAM_MAP_ARGS      - the full -map / -c:a / -c:s argument list
#
# Subtitle handling is container-aware: Matroska/WebM copy every subtitle as-is;
# MP4-family containers only accept text subtitles (re-muxed to mov_text) and
# silently drop bitmap subs (PGS/DVD/DVB) which the format cannot hold.
STREAM_EXTRA_INPUTS=()
STREAM_MAP_ARGS=()

build_stream_maps() {
  local primary="$1" sub_src="$2" out="$3"
  STREAM_EXTRA_INPUTS=()
  # Processed video + every audio track from the primary input (index 0).
  STREAM_MAP_ARGS=(-map 0:v:0 -map 0:a? -c:a copy)

  local out_ext="${out##*.}"; out_ext="$(lc "${out_ext}")"

  # Subtitle source index: 0 when it is the primary, otherwise add it as input 1.
  local sub_idx=0
  [[ "${primary}" != "${sub_src}" ]] && sub_idx=1

  local _ffprobe="${FFPROBE_BIN}"
  [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"

  local sub_codecs
  sub_codecs="$("${_ffprobe}" -v quiet -select_streams s \
    -show_entries stream=codec_name -of csv=p=0 "${sub_src}" 2>/dev/null || true)"

  # No subtitles → nothing else to map.
  [[ -z "${sub_codecs//[[:space:]]/}" ]] && return 0

  [[ "${sub_idx}" -eq 1 ]] && STREAM_EXTRA_INPUTS=(-i "${sub_src}")

  case "${out_ext}" in
    mkv|webm)
      STREAM_MAP_ARGS+=(-map "${sub_idx}:s?" -c:s copy)
      ;;
    mp4|m4v|mov|3gp)
      # Only text subtitles can live in MP4 (as mov_text); map them individually.
      local rel=0 codec text_maps=()
      while IFS= read -r codec; do
        [[ -z "${codec}" ]] && continue
        case "$(lc "${codec}")" in
          subrip|srt|ass|ssa|mov_text|webvtt|text|subviewer|subviewer1|eia_608|microdvd)
            text_maps+=(-map "${sub_idx}:s:${rel}")
            ;;
        esac
        rel=$(( rel + 1 ))
      done <<< "${sub_codecs}"
      [[ "${#text_maps[@]}" -gt 0 ]] && STREAM_MAP_ARGS+=("${text_maps[@]}" -c:s mov_text)
      ;;
    *)
      STREAM_MAP_ARGS+=(-map "${sub_idx}:s?" -c:s copy)
      ;;
  esac
}

# ── HDR type detection ────────────────────────────────────────────────────────

# Returns: "hdr10", "hlg", "dolby_vision", "sdr_10bit", or "sdr_8bit"
probe_hdr_type() {
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

    local dv_info
    dv_info="$("${_ffprobe}" -v quiet -select_streams v:0 \
      -show_entries stream_side_data=side_data_type \
      -of default=noprint_wrappers=1:nokey=1 "${input}" 2>/dev/null)"
    if grep -qi "DOVI\|Dolby Vision" <<< "${dv_info}"; then
      echo "dolby_vision"; return
    fi
  else
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

  if [[ "${pix_fmt}" != *"10"* && "${pix_fmt}" != *"12"* ]]; then
    echo "sdr_8bit"; return
  fi

  case "${color_transfer}" in
    smpte2084|bt2020-10|bt2020_10)
      echo "hdr10" ;;
    arib-std-b67|hlg)
      echo "hlg" ;;
    *)
      if [[ "${color_primaries}" == *"bt2020"* ]]; then
        echo "hdr10"
      else
        echo "sdr_10bit"
      fi
      ;;
  esac
}

# ── HDR conversion filter chain ───────────────────────────────────────────────

# Populates the nameref array $2 with one filter string per element.
get_hdr_conversion_filters() {
  local hdr_type="$1"
  local -n _hdr_out="$2"
  _hdr_out=()

  case "${hdr_type}" in
    hdr10|dolby_vision)
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
      _hdr_out=("format=yuv420p")
      ;;
  esac
}
