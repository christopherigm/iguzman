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

# ── Preflight sanity check ────────────────────────────────────────────────────
#
# A fast, bounded validation run BEFORE any real processing so a broken/corrupt
# file can't stall a later step (e.g. cropdetect decoding the whole file). Two
# cheap tests:
#   1. ffprobe must see at least one video stream.
#   2. A short, video-only decode of the opening seconds must not error out.
#
# IMPORTANT: a *timeout* here is treated as INCONCLUSIVE, not as failure. A
# large, slow-to-decode-or-read but perfectly valid file (e.g. a 30 GB VC-1
# Blu-ray remux on a cold cache) can exceed the wall-clock cap on the opening
# probe; discarding it would be wrong. Only an actual decoder error (ffmpeg
# exits non-zero for a reason other than the timeout kill) means corruption.
#
# Returns 0 when the file looks processable (including the inconclusive case).
# On real failure it returns non-zero and echoes a reason token on stdout:
#   "no_stream"    - no readable video stream (structurally not a video)
#   "decode_fail"  - the decoder errored on the opening (corrupt bitstream)
#
# Tunables (env): PREFLIGHT_SAMPLE_SEC (decode window, default 3s)
#                 PREFLIGHT_TIMEOUT    (wall-clock cap; on hit -> inconclusive)
preflight_check() {
  local input="$1"
  local sample="${PREFLIGHT_SAMPLE_SEC:-3}"
  local timeout_s="${PREFLIGHT_TIMEOUT:-30}"

  local _ffprobe="${FFPROBE_BIN}"
  [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"

  # 1. Is there a video stream at all?
  local vstreams
  vstreams="$("${_ffprobe}" -v quiet -select_streams v \
    -show_entries stream=index -of csv=p=0 "${input}" 2>/dev/null || true)"
  if [[ -z "${vstreams//[[:space:]]/}" ]]; then
    echo "no_stream"
    return 1
  fi

  # 2. Decode just the opening of the video stream (audio skipped - lighter and
  #    not what the later hang-prone step needs). `-nostdin` keeps this
  #    foreground ffmpeg from consuming the interactive tool's stdin. `-t` is an
  #    output option so the decode reliably stops after ${sample}s.
  local _timeout_bin=""
  command -v timeout &>/dev/null && _timeout_bin="timeout"

  local _rc=0
  if [[ -n "${_timeout_bin}" ]]; then
    "${_timeout_bin}" "${timeout_s}" "${FFMPEG_BIN}" -nostdin "${THREAD_FLAGS[@]}" \
      -v error -i "${input}" -map 0:v:0 -an -t "${sample}" \
      -f null - &>/dev/null || _rc=$?
  else
    "${FFMPEG_BIN}" -nostdin "${THREAD_FLAGS[@]}" \
      -v error -i "${input}" -map 0:v:0 -an -t "${sample}" \
      -f null - &>/dev/null || _rc=$?
  fi

  # rc 124 = timeout killed it -> slow but not proven bad -> let it through.
  # Any other non-zero = the decoder actually failed -> corrupt.
  if [[ "${_rc}" -ne 0 && "${_rc}" -ne 124 ]]; then
    echo "decode_fail"
    return 1
  fi

  return 0
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
    # Force base-10: zero-padded fields like "08"/"09" are otherwise parsed as
    # (invalid) octal by bash arithmetic.
    dur_sec=$(( 10#$h * 3600 + 10#$m * 60 + 10#$s ))
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

# ── Audio / subtitle stream inspection ────────────────────────────────────────
#
# Lists the audio (a) or subtitle (s) streams of a file, one per line, as:
#     <relidx>|<codec>|<channel_layout>|<language>|<title>
# where <relidx> is the stream's index *within its own type* (0-based), i.e. the
# value usable in an ffmpeg `-map 0:a:<relidx>` / `-map 0:s:<relidx>` selector.
#
# ffprobe's `flat` output numbers the selected streams 0,1,2… in type order and
# quotes string values, so titles containing commas/spaces parse cleanly.
_probe_streams_of_type() {
  local sel="$1" input="$2"
  local _ffprobe="${FFPROBE_BIN}"
  [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"

  "${_ffprobe}" -v quiet -select_streams "${sel}" \
    -show_entries stream=codec_name,channels,channel_layout:stream_tags=language,title \
    -of flat "${input}" 2>/dev/null | awk '
    {
      eq = index($0, "=")
      if (eq == 0) next
      key = substr($0, 1, eq - 1)
      val = substr($0, eq + 1)
      gsub(/^"|"$/, "", val)                 # strip surrounding quotes
      n = split(key, p, ".")                 # streams.stream.<idx>.<field>[.<tag>]
      idx = p[3]
      field = p[4]
      if (field == "tags") field = p[5]
      if (idx == "") next
      data[idx SUBSEP field] = val
      seen[idx] = 1
      if (idx + 0 > maxidx) maxidx = idx + 0
    }
    END {
      for (i = 0; i <= maxidx; i++) {
        if (!(i in seen)) continue
        printf "%s|%s|%s|%s|%s\n", i, \
          data[i SUBSEP "codec_name"], data[i SUBSEP "channel_layout"], \
          data[i SUBSEP "language"], data[i SUBSEP "title"]
      }
    }'
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
# MP4-family containers only accept text subtitles (re-muxed to mov_text).
# Bitmap subs (PGS/DVD/DVB) cannot be held by MP4 at all, so when OCR is enabled
# lib/ocr.sh converts the supported ones to .srt beforehand and this function
# muxes those as mov_text; the rest are still dropped.
#
# Per-file stream curation: when the user opted to pick streams individually
# (edit-videos.sh), the current file's choice is passed in via two globals,
# each holding a space-separated list of *relative* indices, or a sentinel:
#   CUR_STREAM_SEL_AUDIO / CUR_STREAM_SEL_SUBS
#     "*"      keep every stream of this type (default)
#     "-"      keep none
#     "0 2 …"  keep only these relative indices
STREAM_EXTRA_INPUTS=()
STREAM_MAP_ARGS=()
AUDIO_CODEC_ARGS=()

# Whether $1 (a relative index) is present in the space-separated list $2.
_stream_idx_selected() {
  local needle="$1" list="$2" x
  for x in ${list}; do [[ "${x}" == "${needle}" ]] && return 0; done
  return 1
}

# ── Smart TV audio codec args ─────────────────────────────────────────────────
#
# Samsung AVPlay refuses DTS/TrueHD/PCM/FLAC (PLAYER_ERROR_NOT_SUPPORTED_AUDIO_
# CODEC), so the Smart TV profile transcodes those to AC3 (up to 5.1, universally
# TV-decodable) while copying tracks that are already AAC/AC3/E-AC3. Codec is
# decided per *output* audio position, so the ordering must match the -map order
# the caller emitted (all audio in stream order for "*", else the selected list).
#
# Args: $1 primary input (video+audio source)   $2 audio selection ("*" or list)
# Sets: AUDIO_CODEC_ARGS
_smarttv_audio_codec_args() {
  local primary="$1" sel="$2"
  AUDIO_CODEC_ARGS=()

  local _ffprobe="${FFPROBE_BIN}"
  [[ ! -x "${_ffprobe}" ]] && _ffprobe="ffprobe"

  # codec_name,channels per audio stream, in stream order (rel index 0,1,…).
  local _lines
  _lines="$("${_ffprobe}" -v quiet -select_streams a \
    -show_entries stream=codec_name,channels -of csv=p=0 "${primary}" 2>/dev/null || true)"

  local -a _codec=() _chan=()
  local _c _ch
  while IFS=',' read -r _c _ch; do
    [[ -z "${_c}" ]] && continue
    _codec+=("${_c}"); _chan+=("${_ch}")
  done <<< "${_lines}"

  # Output order of source-relative indices.
  local -a _order=()
  if [[ "${sel}" == "*" ]]; then
    local _i
    for (( _i=0; _i<${#_codec[@]}; _i++ )); do _order+=("${_i}"); done
  else
    local _x
    for _x in ${sel}; do _order+=("${_x}"); done
  fi

  local _pos=0 _ri _cc _nch
  for _ri in "${_order[@]}"; do
    _cc="$(lc "${_codec[$_ri]:-}")"
    _nch="${_chan[$_ri]:-2}"
    [[ "${_nch}" =~ ^[0-9]+$ ]] || _nch=2
    case "${_cc}" in
      aac|ac3|eac3)
        AUDIO_CODEC_ARGS+=(-c:a:${_pos} copy)
        ;;
      *)
        AUDIO_CODEC_ARGS+=(-c:a:${_pos} ac3)
        if [[ "${_nch}" -gt 6 ]]; then
          # AC3 tops out at 5.1 - downmix 7.1+ sources.
          AUDIO_CODEC_ARGS+=(-ac:a:${_pos} 6 -b:a:${_pos} 448k)
        elif [[ "${_nch}" -gt 2 ]]; then
          AUDIO_CODEC_ARGS+=(-b:a:${_pos} 448k)
        else
          AUDIO_CODEC_ARGS+=(-b:a:${_pos} 192k)
        fi
        ;;
    esac
    _pos=$(( _pos + 1 ))
  done

  # Nothing resolved (probe failed) → blanket AC3 transcode as a safe fallback.
  # The explicit `return 0` matters: without it the function's status would be
  # that of the failing `[[ ]]` test above, which under `set -e` aborts any
  # caller that is not inside an `if` condition.
  [[ "${#AUDIO_CODEC_ARGS[@]}" -eq 0 ]] && AUDIO_CODEC_ARGS=(-c:a ac3)
  return 0
}

build_stream_maps() {
  local primary="$1" sub_src="$2" out="$3"
  STREAM_EXTRA_INPUTS=()

  local sel_a="${CUR_STREAM_SEL_AUDIO:-*}"
  local sel_s="${CUR_STREAM_SEL_SUBS:-*}"

  # Processed video, then audio per selection. The Smart TV profile transcodes
  # TV-incompatible audio to AC3 (per-stream); every other path copies audio.
  STREAM_MAP_ARGS=(-map 0:v:0)
  if [[ "${sel_a}" != "-" ]]; then
    if [[ "${sel_a}" == "*" ]]; then
      STREAM_MAP_ARGS+=(-map 0:a?)
    else
      local _ai
      for _ai in ${sel_a}; do STREAM_MAP_ARGS+=(-map "0:a:${_ai}"); done
    fi
    if [[ "${DO_SMARTTV:-0}" -eq 1 ]]; then
      _smarttv_audio_codec_args "${primary}" "${sel_a}"
      STREAM_MAP_ARGS+=("${AUDIO_CODEC_ARGS[@]}")
    else
      STREAM_MAP_ARGS+=(-c:a copy)
    fi
  fi
  # sel_a == "-" → no audio mapped.

  # No subtitles requested at all.
  [[ "${sel_s}" == "-" ]] && return 0

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
      if [[ "${sel_s}" == "*" ]]; then
        STREAM_MAP_ARGS+=(-map "${sub_idx}:s?" -c:s copy)
      else
        local _si sub_maps=()
        for _si in ${sel_s}; do sub_maps+=(-map "${sub_idx}:s:${_si}"); done
        [[ "${#sub_maps[@]}" -gt 0 ]] && STREAM_MAP_ARGS+=("${sub_maps[@]}" -c:s copy)
      fi
      ;;
    mp4|m4v|mov|3gp)
      # Only text subtitles can live in MP4 (as mov_text); map them individually.
      # Bitmap tracks are handled further down: ocr_prepare_subs (lib/ocr.sh) has
      # already turned them into .srt files, which come in as extra inputs.
      local rel=0 codec sub_maps=() meta_args=() out_pos=0
      while IFS= read -r codec; do
        [[ -z "${codec}" ]] && continue
        if [[ "${sel_s}" == "*" ]] || _stream_idx_selected "${rel}" "${sel_s}"; then
          case "$(lc "${codec}")" in
            subrip|srt|ass|ssa|mov_text|webvtt|text|subviewer|subviewer1|eia_608|microdvd)
              sub_maps+=(-map "${sub_idx}:s:${rel}")
              out_pos=$(( out_pos + 1 ))
              ;;
          esac
        fi
        rel=$(( rel + 1 ))
      done <<< "${sub_codecs}"

      # OCR'd bitmap subtitles: one extra "-i <srt>" input each, appended after
      # the primary (0) and, when present, the separate subtitle source (1).
      local ocr_n="${#OCR_SRT_FILES[@]}"
      if [[ "${ocr_n}" -gt 0 ]]; then
        local k in_base=$(( 1 + sub_idx ))
        for (( k=0; k<ocr_n; k++ )); do
          STREAM_EXTRA_INPUTS+=(-i "${OCR_SRT_FILES[$k]}")
          sub_maps+=(-map "$(( in_base + k )):0")
          meta_args+=("-metadata:s:s:${out_pos}" "language=${OCR_SRT_LANGS[$k]}")
          out_pos=$(( out_pos + 1 ))
        done
      fi

      if [[ "${#sub_maps[@]}" -gt 0 ]]; then
        STREAM_MAP_ARGS+=("${sub_maps[@]}" -c:s mov_text)
        [[ "${#meta_args[@]}" -gt 0 ]] && STREAM_MAP_ARGS+=("${meta_args[@]}")
      fi
      ;;
    *)
      if [[ "${sel_s}" == "*" ]]; then
        STREAM_MAP_ARGS+=(-map "${sub_idx}:s?" -c:s copy)
      else
        local _si2 sub_maps2=()
        for _si2 in ${sel_s}; do sub_maps2+=(-map "${sub_idx}:s:${_si2}"); done
        [[ "${#sub_maps2[@]}" -gt 0 ]] && STREAM_MAP_ARGS+=("${sub_maps2[@]}" -c:s copy)
      fi
      ;;
  esac
  return 0
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
