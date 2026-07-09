#!/usr/bin/env bash
# lib/ocr.sh - OCR bitmap subtitles (DVD/VobSub) to text so MP4 can carry them
#
# MP4's only subtitle codec is mov_text, which is text-only: image subtitle
# tracks (dvd_subtitle) are silently dropped when the Smart TV profile remuxes
# to MP4.  This module recovers them by OCR'ing each bitmap track into a
# temporary .srt, which build_stream_maps (lib/probe.sh) then muxes as mov_text.
#
# Depends on: FFMPEG_BIN (ffmpeg-bootstrap.sh), _probe_streams_of_type and
#             _stream_idx_selected (probe.sh), wait_ocr_progress (progress.sh),
#             lc() and the i18n strings (edit-videos.sh / i18n.sh).
#
# Engine: the local FFmpeg rasterizes the subtitle stream (sub2video), and the
# tesseract CLI reads the resulting bitmaps.  ocr_subs.py glues the two together
# and emits SubRip.  No VobSub2SRT / mkvtoolnix build is required.

# Repo root (this file lives in lib/).
_OCR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
OCR_SCRIPT="${_OCR_DIR}/ocr_subs.py"

OCR_TESSERACT_BIN=""
OCR_PYTHON_BIN=""

# Per-file OCR results, consumed by build_stream_maps.
OCR_SRT_FILES=()
OCR_SRT_LANGS=()
OCR_WORKDIR=""

# ── Codec / language helpers ──────────────────────────────────────────────────

# Bitmap subtitle codecs this module can OCR. PGS (hdmv_pgs_subtitle), DVB and
# XSUB decode to bitmaps too and would fit the same pipeline, but they are not
# enabled until each has been verified against a real sample.
_ocr_is_image_codec() {
  case "$(lc "${1:-}")" in
    dvd_subtitle) return 0 ;;
    *)            return 1 ;;
  esac
}

# Maps a stream's ISO-639 language tag to a tesseract language code.
# ffprobe reports ISO-639-2/B, which mostly matches tesseract's naming; the
# cases below are the ones where it does not.
_ocr_tess_lang() {
  local iso; iso="$(lc "${1:-}")"
  case "${iso}" in
    ""|und)   echo "eng"     ;;
    en)       echo "eng"     ;;
    es)       echo "spa"     ;;
    de)       echo "deu"     ;;
    fr)       echo "fra"     ;;
    pt)       echo "por"     ;;
    it)       echo "ita"     ;;
    nl)       echo "nld"     ;;
    ru)       echo "rus"     ;;
    ja)       echo "jpn"     ;;
    ko)       echo "kor"     ;;
    pl)       echo "pol"     ;;
    tr)       echo "tur"     ;;
    ar)       echo "ara"     ;;
    he)       echo "heb"     ;;
    ger|deu)  echo "deu"     ;;
    fre|fra)  echo "fra"     ;;
    dut|nld)  echo "nld"     ;;
    cze|ces)  echo "ces"     ;;
    gre|ell)  echo "ell"     ;;
    rum|ron)  echo "ron"     ;;
    slo|slk)  echo "slk"     ;;
    per|fas)  echo "fas"     ;;
    ice|isl)  echo "isl"     ;;
    may|msa)  echo "msa"     ;;
    bur|mya)  echo "mya"     ;;
    alb|sqi)  echo "sqi"     ;;
    arm|hye)  echo "hye"     ;;
    baq|eus)  echo "eus"     ;;
    geo|kat)  echo "kat"     ;;
    wel|cym)  echo "cym"     ;;
    mac|mkd)  echo "mkd"     ;;
    tib|bod)  echo "bod"     ;;
    zh|chi|zho) echo "chi_sim" ;;
    *)        echo "${iso}"  ;;
  esac
}

# Both take a `_probe_streams_of_type s` listing ("relidx|codec|layout|lang|title").

ocr_has_image_subs() {
  local ri codec rest
  while IFS='|' read -r ri codec rest; do
    [[ -z "${ri}" ]] && continue
    _ocr_is_image_codec "${codec}" && return 0
  done <<< "${1:-}"
  return 1
}

# Prints the tesseract language of every image-subtitle stream, one per line.
ocr_image_sub_langs() {
  local ri codec layout lang title
  while IFS='|' read -r ri codec layout lang title; do
    [[ -z "${ri}" ]] && continue
    _ocr_is_image_codec "${codec}" || continue
    _ocr_tess_lang "${lang}"
  done <<< "${1:-}"
}

# ── Availability + bootstrap ──────────────────────────────────────────────────

# Sets OCR_TESSERACT_BIN / OCR_PYTHON_BIN. Returns 1 when OCR cannot run.
check_ocr() {
  OCR_TESSERACT_BIN=""
  OCR_PYTHON_BIN=""

  [[ -f "${OCR_SCRIPT}" ]] || return 1
  command -v tesseract &>/dev/null || return 1
  OCR_TESSERACT_BIN="$(command -v tesseract)"

  # ocr_subs.py needs Pillow; prefer the repo venv, fall back to system python3.
  local c
  for c in "${_OCR_DIR}/venv/bin/python" "python3"; do
    if [[ -x "${c}" ]] || command -v "${c}" &>/dev/null; then
      if "${c}" -c 'import PIL' &>/dev/null; then
        OCR_PYTHON_BIN="${c}"
        break
      fi
    fi
  done
  [[ -n "${OCR_PYTHON_BIN}" ]]
}

# Echoes whichever of the space-separated langs in $1 tesseract cannot load.
ocr_missing_langs() {
  local want="${1:-}" have miss="" l
  have="$("${OCR_TESSERACT_BIN:-tesseract}" --list-langs 2>/dev/null | tail -n +2 || true)"
  for l in ${want}; do
    grep -qx "${l}" <<< "${have}" || miss+=" ${l}"
  done
  printf '%s' "${miss# }"
}

_ocr_manual_hint() {
  local langs="${1:-eng}" pkgs="tesseract-ocr" l
  for l in ${langs}; do pkgs+=" tesseract-ocr-${l//_/-}"; done
  printf "  %s\n" "$(clr_dim "${OCR_MANUAL_HINT}")"
  printf "  %s\n" "$(clr_cyan "sudo apt-get install -y ${pkgs} python3-pil")"
}

# Installs tesseract + the language data for the space-separated langs in $1.
# Returns 0 only when check_ocr subsequently succeeds.
bootstrap_ocr() {
  local langs="${1:-eng}"

  if ! command -v apt-get &>/dev/null; then
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${OCR_NO_APT}")"
    _ocr_manual_hint "${langs}"
    return 1
  fi

  local pkgs=(tesseract-ocr) l
  for l in ${langs}; do pkgs+=("tesseract-ocr-${l//_/-}"); done

  # Pillow is only pulled in when neither interpreter already provides it.
  if ! "${_OCR_DIR}/venv/bin/python" -c 'import PIL' &>/dev/null \
     && ! python3 -c 'import PIL' &>/dev/null; then
    pkgs+=(python3-pil)
  fi

  printf "  %s\n" "$(clr_dim "${OCR_INSTALL_RUNNING}")"
  printf "  %s\n" "$(clr_cyan "sudo apt-get install -y ${pkgs[*]}")"

  if ! sudo apt-get update -qq || ! sudo apt-get install -y "${pkgs[@]}"; then
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${OCR_INSTALL_FAIL}")"
    _ocr_manual_hint "${langs}"
    return 1
  fi

  if ! check_ocr; then
    printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${OCR_INSTALL_FAIL}")"
    _ocr_manual_hint "${langs}"
    return 1
  fi

  local miss; miss="$(ocr_missing_langs "${langs}")"
  [[ -n "${miss}" ]] && \
    printf "  %s %s: %s\n" "$(clr_bold_yellow '⚠')" "$(clr_yellow "${OCR_LANG_MISSING}")" "$(clr_dim "${miss}")"
  return 0
}

# ── Per-file OCR ──────────────────────────────────────────────────────────────

ocr_cleanup() {
  [[ -n "${OCR_WORKDIR}" ]] && rm -rf "${OCR_WORKDIR}"
  OCR_WORKDIR=""
  OCR_SRT_FILES=()
  OCR_SRT_LANGS=()
  return 0
}

# OCRs one subtitle stream into ${4}. Returns non-zero when nothing was read.
_ocr_run_stream() {
  local input="$1" rel="$2" tess_lang="$3" out="$4"
  local log err
  log="$(mktemp)"; err="$(mktemp)"

  printf "    %s\n" "${OCR_STEP} (${tess_lang}, #${rel})..."

  "${OCR_PYTHON_BIN}" "${OCR_SCRIPT}" \
    --ffmpeg "${FFMPEG_BIN}" --tesseract "${OCR_TESSERACT_BIN}" \
    --input "${input}" --stream "${rel}" --lang "${tess_lang}" \
    --output "${out}" >"${log}" 2>"${err}" &
  local pid=$!

  local ec=0
  wait_ocr_progress "${pid}" "${log}" || ec=$?

  if [[ "${ec}" -ne 0 ]]; then
    local msg; msg="$(tail -2 "${err}" 2>/dev/null | grep -v '^$' | head -2 || true)"
    [[ -n "${msg}" ]] && printf "    %s\n" "$(clr_dim "${msg}")"
  fi

  rm -f "${log}" "${err}"
  [[ "${ec}" -eq 0 && -s "${out}" ]]
}

# Populates OCR_SRT_FILES / OCR_SRT_LANGS for `$1` (the original input file).
# A no-op unless DO_OCR_SUBS=1. Honours the per-file subtitle curation in
# CUR_STREAM_SEL_SUBS. A stream that fails to OCR is warned about and skipped,
# never fatal.
ocr_prepare_subs() {
  local input="$1"
  ocr_cleanup

  [[ "${DO_OCR_SUBS:-0}" -eq 1 ]] || return 0

  local sel_s="${CUR_STREAM_SEL_SUBS:-*}"
  [[ "${sel_s}" == "-" ]] && return 0

  local lines; lines="$(_probe_streams_of_type s "${input}")"
  [[ -z "${lines//[[:space:]]/}" ]] && return 0

  local ri codec layout lang title
  while IFS='|' read -r ri codec layout lang title; do
    [[ -z "${ri}" ]] && continue
    _ocr_is_image_codec "${codec}" || continue
    if [[ "${sel_s}" != "*" ]] && ! _stream_idx_selected "${ri}" "${sel_s}"; then
      continue
    fi

    [[ -z "${OCR_WORKDIR}" ]] && OCR_WORKDIR="$(mktemp -d /tmp/edit_videos_ocr_XXXXXX)"

    local src_lang="${lang:-und}"
    local tess_lang; tess_lang="$(_ocr_tess_lang "${src_lang}")"
    local srt="${OCR_WORKDIR}/sub_${ri}.srt"

    if _ocr_run_stream "${input}" "${ri}" "${tess_lang}" "${srt}"; then
      OCR_SRT_FILES+=("${srt}")
      OCR_SRT_LANGS+=("${src_lang}")
    else
      printf "    %s %s (#%s)\n" "$(clr_yellow '⚠')" "$(clr_dim "${OCR_STREAM_FAIL}")" "${ri}"
    fi
  done <<< "${lines}"

  return 0
}
