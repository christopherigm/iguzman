#!/usr/bin/env bash
# lib/actions/tiktok.sh — TikTok/Reel assembly (folder → 1 vertical reel)
#
# Pipeline:
#   Phase 1 — LLM frame scoring via Ollama (Gemma multimodal)
#   Phase 2 — Vertical 9:16 smart-crop + per-clip normalization (1080x1920, 30fps)
#   Phase 3 — Concat demuxer + optional background music mix
#
# Depends on: probe.sh, progress.sh, ui.sh, ffmpeg-bootstrap.sh

# ── State globals ─────────────────────────────────────────────────────────────

DO_TIKTOK=0
TIKTOK_OLLAMA_URL="http://localhost:11434"
TIKTOK_OLLAMA_MODEL="gemma4:latest"
TIKTOK_MIN_SCORE=7
TIKTOK_CLIP_MIN=3
TIKTOK_CLIP_MAX=7
TIKTOK_FRAME_INTERVAL=5
TIKTOK_MUSIC_FILE=""
TIKTOK_MUSIC_VOLUME=0.3
TIKTOK_ORIG_AUDIO_VOLUME=0.7
TIKTOK_DEDUP_THRESHOLD=0.95   # SSIM similarity threshold; 1.0 = identical, lower = more aggressive dedup

# ── Ollama helpers ────────────────────────────────────────────────────────────

check_ollama() {
  command -v curl &>/dev/null || return 1
  local http_code
  http_code="$(curl -sf -o /dev/null -w '%{http_code}' \
    "${TIKTOK_OLLAMA_URL}/api/tags" 2>/dev/null)" || return 1
  [[ "${http_code}" == "200" ]]
}

# Returns 0 if the given model tag is listed by /api/tags.
check_ollama_model() {
  local model="$1"
  local response
  response="$(curl -sf "${TIKTOK_OLLAMA_URL}/api/tags" 2>/dev/null)" || return 1
  # Match model name exactly (strip :tag suffix for comparison)
  local model_name="${model%%:*}"
  echo "${response}" | grep -q "\"${model_name}"
}

# Pull a model from Ollama registry.
pull_ollama_model() {
  local model="$1"
  printf "  %s %s ...\n" "$(clr_dim '→')" "${TIKTOK_OLLAMA_PULLING}"
  curl -sf -X POST "${TIKTOK_OLLAMA_URL}/api/pull" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"${model}\"}" \
    -o /dev/null 2>/dev/null
}

# ── LLM helpers ───────────────────────────────────────────────────────────────

# _score_frame <image_path> <model>
# Prints an integer 1-10 (or 0 on Ollama failure).
_score_frame() {
  local image_path="$1"
  local model="$2"

  [[ ! -f "${image_path}" ]] && { echo "0"; return; }
  command -v base64 &>/dev/null || { echo "0"; return; }

  local b64
  b64="$(base64 -w 0 "${image_path}" 2>/dev/null)" || { echo "0"; return; }

  # Write payload to a temp file to safely handle large base64 strings
  local tmp_payload
  tmp_payload="$(mktemp /tmp/ollama_score_XXXXXX.json)"
  printf '{"model":"%s","prompt":"Rate the aesthetic quality of this image from 1-10. Consider: sharp focus, interesting subject, good lighting, composition. Reply with ONLY a single integer from 1 to 10, nothing else.","images":["%s"],"stream":false}' \
    "${model}" "${b64}" > "${tmp_payload}"

  local response curl_exit
  response="$(curl -sf --max-time 120 -X POST \
    "${TIKTOK_OLLAMA_URL}/api/generate" \
    -H 'Content-Type: application/json' \
    -d "@${tmp_payload}" 2>/dev/null)"
  curl_exit=$?
  rm -f "${tmp_payload}"
  if [[ ${curl_exit} -ne 0 ]]; then echo "0"; return; fi

  # Extract the "response" field value
  local raw_text
  raw_text="$(printf '%s' "${response}" \
    | grep -o '"response":"[^"]*"' \
    | sed 's/"response":"//;s/"$//' \
    | tr -d '[:space:]')"

  # First integer in response text
  local score
  score="$(printf '%s' "${raw_text}" | grep -o '[0-9]\+' | head -1)"
  if [[ -z "${score}" ]]; then
    # Fallback: check top-level numeric field (some model versions)
    score="$(printf '%s' "${response}" | grep -o '"response":[[:space:]]*[0-9]\+' | grep -o '[0-9]\+$')"
  fi

  # Validate range
  if [[ -z "${score}" ]] || \
     [[ "${score}" -lt 1 ]] 2>/dev/null || \
     [[ "${score}" -gt 10 ]] 2>/dev/null; then
    score=0
  fi
  echo "${score}"
}

# _get_subject_coords <image_path> <model>
# Prints "<x> <y>" as 0–1 fractions (defaults to "0.5 0.5" on any failure).
_get_subject_coords() {
  local image_path="$1"
  local model="$2"

  [[ ! -f "${image_path}" ]] && { echo "0.5 0.5"; return; }

  local b64
  b64="$(base64 -w 0 "${image_path}" 2>/dev/null)" || { echo "0.5 0.5"; return; }

  # Write payload to a temp file to safely handle large base64 strings
  local tmp_payload
  tmp_payload="$(mktemp /tmp/ollama_roi_XXXXXX.json)"
  printf '{"model":"%s","prompt":"Where is the main subject in this image? Reply with ONLY two decimal numbers between 0.0 and 1.0: the horizontal center x and vertical center y of the main subject. Example: 0.5 0.5 (for a centered subject). Reply with the two numbers separated by a space and nothing else.","images":["%s"],"stream":false}' \
    "${model}" "${b64}" > "${tmp_payload}"

  local response curl_exit
  response="$(curl -sf --max-time 120 -X POST \
    "${TIKTOK_OLLAMA_URL}/api/generate" \
    -H 'Content-Type: application/json' \
    -d "@${tmp_payload}" 2>/dev/null)"
  curl_exit=$?
  rm -f "${tmp_payload}"
  if [[ ${curl_exit} -ne 0 ]]; then echo "0.5 0.5"; return; fi

  local raw_text
  raw_text="$(printf '%s' "${response}" \
    | grep -o '"response":"[^"]*"' \
    | sed 's/"response":"//;s/"$//' \
    | tr -d '[:space:]')"

  # Extract first two numbers (integer or decimal)
  local x y
  x="$(printf '%s' "${raw_text}" | grep -oE '[0-9]+(\.[0-9]+)?' | sed -n '1p')"
  y="$(printf '%s' "${raw_text}" | grep -oE '[0-9]+(\.[0-9]+)?' | sed -n '2p')"

  [[ -z "${x}" ]] && x="0.5"
  [[ -z "${y}" ]] && y="0.5"

  # Clamp to [0,1] using awk
  x="$(echo "${x}" | awk '{v=$1+0; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"
  y="$(echo "${y}" | awk '{v=$1+0; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"

  echo "${x} ${y}"
}

# ── Image detection helper ───────────────────────────────────────────────────

# _is_image_file <path>
# Returns 0 if the file extension is a supported still image format.
_is_image_file() {
  local ext="${1##*.}"
  ext="${ext,,}"
  case "${ext}" in
    jpg|jpeg|png|webp|heic|heif) return 0 ;;
    *) return 1 ;;
  esac
}

# _images_are_similar <img1> <img2> <threshold>
# Returns 0 if the SSIM between the two images is >= threshold.
# Both inputs are scaled to 256x256 before comparison so resolution differences
# don't matter (burst shots from the same phone vary only in tiny details).
_images_are_similar() {
  local img1="$1"
  local img2="$2"
  local threshold="${3:-0.95}"

  [[ ! -f "${img1}" || ! -f "${img2}" ]] && return 1

  local ssim_out
  ssim_out="$("${FFMPEG_BIN}" -hide_banner -loglevel error \
    -i "${img1}" -i "${img2}" \
    -lavfi "[0:v]scale=256:256:flags=bilinear[a];[1:v]scale=256:256:flags=bilinear[b];[a][b]ssim" \
    -f null - 2>&1)"

  local ssim_val
  ssim_val="$(printf '%s' "${ssim_out}" | grep -oE 'All:[0-9]+\.[0-9]+' | head -1 | cut -d: -f2)"
  [[ -z "${ssim_val}" ]] && return 1

  # Return 0 (similar) if val >= threshold
  awk -v val="${ssim_val}" -v thr="${threshold}" \
    'BEGIN { exit (val + 0 >= thr + 0) ? 0 : 1 }'
}

# ── Geometry helper ─────────────────────────────────────────────────────────────

# _build_tiktok_vf <src_w> <src_h> <subj_x> <subj_y>
# Outputs an ffmpeg -vf string that converts the source to 1080x1920 (9:16).
_build_tiktok_vf() {
  local src_w="$1"
  local src_h="$2"
  local sx="$3"
  local sy="$4"

  local target_w=1080 target_h=1920

  # Compute crop+scale in one awk pass
  local crop_w crop_h crop_x crop_y
  read -r crop_w crop_h crop_x crop_y < <(awk \
    -v sw="${src_w}" -v sh="${src_h}" -v sx="${sx}" -v sy="${sy}" \
    -v tw="${target_w}" -v th="${target_h}" '
  BEGIN {
    # Source aspect ratio
    src_ar = sw / sh
    tgt_ar = tw / th   # 9/16 = 0.5625

    if (src_ar <= tgt_ar) {
      # Already portrait or square: scale to fill width, pad height
      print "PORTRAIT"
      exit
    }

    # Landscape → smart crop to 9:16
    # Crop height = full src_h; crop width = src_h * (9/16)
    cw = int(sh * tw / th)
    ch = sh
    if (cw > sw) {
      cw = sw
      ch = int(sw * th / tw)
    }

    # Center crop window on subject x,y
    cx = int(sx * sw - cw / 2)
    cy = int(sy * sh - ch / 2)

    # Clamp to source bounds
    if (cx < 0) cx = 0
    if (cy < 0) cy = 0
    if (cx + cw > sw) cx = sw - cw
    if (cy + ch > sh) cy = sh - ch

    # Force even numbers (codec requirement)
    cw = int(cw / 2) * 2
    ch = int(ch / 2) * 2
    if (cx + cw > sw) cx = cx - 2
    if (cy + ch > sh) cy = cy - 2
    if (cx < 0) cx = 0
    if (cy < 0) cy = 0

    print int(cw) " " int(ch) " " int(cx) " " int(cy)
  }')

  if [[ "${crop_w}" == "PORTRAIT" ]]; then
    # Scale to fill 1080 wide, pad height with black bars, ensure even dimensions
    echo "scale=${target_w}:-2:flags=lanczos,pad=${target_w}:${target_h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p"
  else
    echo "crop=${crop_w}:${crop_h}:${crop_x}:${crop_y},scale=${target_w}:${target_h}:flags=lanczos,setsar=1,format=yuv420p"
  fi
}

# ── Main pipeline ─────────────────────────────────────────────────────────────
#
# run_tiktok_reel
#
# Reads globals: video_files[], out_dir, FFMPEG_BIN, THREAD_FLAGS[], THREAD_COUNT
#                TIKTOK_OLLAMA_MODEL, TIKTOK_MIN_SCORE, TIKTOK_CLIP_MIN, TIKTOK_CLIP_MAX,
#                TIKTOK_FRAME_INTERVAL, TIKTOK_MUSIC_FILE, TIKTOK_MUSIC_VOLUME,
#                TIKTOK_ORIG_AUDIO_VOLUME, LOG_FILE

run_tiktok_reel() {
  local out_reel="${out_dir}/reel-$(date '+%Y%m%d-%H%M%S').mp4"
  local tmp_dir
  tmp_dir="$(mktemp -d /tmp/tiktok_reel_XXXXXX)"

  # Ensure tmp_dir is cleaned up on any exit from this function
  # shellcheck disable=SC2064
  trap "rm -rf '${tmp_dir}'" RETURN

  local divider; divider="$(printf '─%.0s' {1..60})"

  # ── Verify Ollama is reachable before entering the scoring loop ──────────
  if ! check_ollama; then
    printf "\n  %s Ollama is not reachable at %s\n" \
      "$(clr_bold_red '✗')" "${TIKTOK_OLLAMA_URL}"
    printf "  %s\n\n" "$(clr_dim 'Start Ollama with: ollama serve')"
    return 1
  fi
  printf "\n  %s\n" "$(clr_bold "${TIKTOK_TITLE}...")"
  echo "  ${divider}"

  # ── Phase 1: Frame extraction + LLM scoring ──────────────────────────────
  printf "  %s\n\n" "$(clr_bold "${TIKTOK_PHASE1}:")"

  # scored_files entries: "<score>:<best_frame>:<src_file>:<dur_sec>"
  local -a scored_files=()
  local file_idx=0
  local total_files="${#video_files[@]}"

  local vf_src
  for vf_src in "${video_files[@]}"; do
    (( file_idx++ )) || true
    local base; base="$(basename "${vf_src}")"
    printf "  [%d/%d] %s\n" "${file_idx}" "${total_files}" "$(clr_bold "${base}")"
    _log "[TikTok ${file_idx}/${total_files}] Scoring: ${base}"

    local best_score=0 best_frame="" dur_sec=0

    if _is_image_file "${vf_src}"; then
      # ── Photo: score the image directly — no frame extraction needed ──────
      dur_sec="${TIKTOK_CLIP_MAX}"
      printf "    %s\n" "$(clr_dim 'photo — scoring directly...')"
      local score
      score="$(_score_frame "${vf_src}" "${TIKTOK_OLLAMA_MODEL}")"
      printf "    %s %s → %s/10\n" \
        "$(clr_dim '·')" \
        "$(clr_dim "${base}")" \
        "$(clr_cyan "${score}")"
      best_score="${score}"
      best_frame="${vf_src}"
    else
      # ── Video: probe duration + extract frames ────────────────────────────
      local probe_out
      probe_out="$(probe_video "${vf_src}")"
      dur_sec="${probe_out%% *}"
      if [[ "${dur_sec}" -eq 0 ]]; then
        printf "    %s Could not probe duration — skipping.\n" "$(clr_yellow '⚠')"
        continue
      fi

      # Extract one frame every TIKTOK_FRAME_INTERVAL seconds
      local frames_dir="${tmp_dir}/frames_${file_idx}"
      mkdir -p "${frames_dir}"
      "${FFMPEG_BIN}" -hide_banner -loglevel error \
        -i "${vf_src}" \
        -vf "fps=1/${TIKTOK_FRAME_INTERVAL}" \
        -q:v 2 \
        "${frames_dir}/frame_%04d.jpg" 2>/dev/null || true

      local frame_count=0
      frame_count="$(find "${frames_dir}" -maxdepth 1 -name "*.jpg" 2>/dev/null | wc -l)"
      if [[ "${frame_count}" -eq 0 ]]; then
        printf "    %s No frames extracted — skipping.\n" "$(clr_yellow '⚠')"
        continue
      fi
      printf "    %s %s\n" "$(clr_dim '○')" "$(clr_dim "${frame_count} frames extracted")"

      # Score each frame; track best score and the frame that produced it
      local frame
      while IFS= read -r frame; do
        local score
        score="$(_score_frame "${frame}" "${TIKTOK_OLLAMA_MODEL}")"
        printf "    %s %s → %s/10\n" \
          "$(clr_dim '·')" \
          "$(clr_dim "$(basename "${frame}")")" \
          "$(clr_cyan "${score}")"
        if [[ "${score}" -gt "${best_score}" ]] 2>/dev/null; then
          best_score="${score}"
          best_frame="${frame}"
        fi
      done < <(find "${frames_dir}" -maxdepth 1 -name "*.jpg" 2>/dev/null | sort)
    fi

    printf "    %s %s: %s/10\n" \
      "$(clr_bold_cyan '→')" "${TIKTOK_BEST_SCORE}" "$(clr_bold "${best_score}")"

    if [[ "${best_score}" -ge "${TIKTOK_MIN_SCORE}" ]] 2>/dev/null; then
      scored_files+=("${best_score}:${best_frame}:${vf_src}:${dur_sec}")
      printf "    %s %s\n\n" "$(clr_bold_green '✓')" "${TIKTOK_SELECTED}"
    else
      printf "    %s %s (%d < %d)\n\n" \
        "$(clr_dim '○')" "${TIKTOK_SKIPPED}" "${best_score}" "${TIKTOK_MIN_SCORE}"
    fi
  done

  if [[ "${#scored_files[@]}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '⚠')" "${TIKTOK_NO_CLIPS_SELECTED}"
    return 1
  fi

  # ── Near-duplicate filter ─────────────────────────────────────────────────
  # Sort by score descending so the best shot of a burst always wins,
  # then drop any entry whose representative frame is visually too similar
  # (SSIM >= TIKTOK_DEDUP_THRESHOLD) to an already-accepted frame.
  local -a deduped_files=()
  local -a _accepted_frames=()
  local _raw_entry
  while IFS= read -r _raw_entry; do
    [[ -z "${_raw_entry}" ]] && continue
    local _dup_frame="${_raw_entry#*:}"
    _dup_frame="${_dup_frame%%:*}"
    local _is_dup=0
    local _af
    for _af in "${_accepted_frames[@]+"${_accepted_frames[@]}"}" ; do
      if _images_are_similar "${_dup_frame}" "${_af}" "${TIKTOK_DEDUP_THRESHOLD}"; then
        _is_dup=1
        break
      fi
    done
    if [[ "${_is_dup}" -eq 1 ]]; then
      # src_file is field 3: strip score: then best_frame: then keep up to last :dur
      local _dup_rest="${_raw_entry#*:}"   # best_frame:src_file:dur
      _dup_rest="${_dup_rest#*:}"          # src_file:dur
      local _dup_src="${_dup_rest%:*}"     # src_file
      printf "  %s %s\n" "$(clr_dim '≈')" "$(clr_dim "${TIKTOK_DEDUP_SKIP}: $(basename "${_dup_src}")")"
    else
      deduped_files+=("${_raw_entry}")
      _accepted_frames+=("${_dup_frame}")
    fi
  done < <(printf '%s\n' "${scored_files[@]}" | sort -t: -k1 -rn)

  if [[ "${#deduped_files[@]}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '⚠')" "${TIKTOK_NO_CLIPS_SELECTED}"
    return 1
  fi

  printf "  %s %d/%d %s\n\n" \
    "$(clr_bold_green '✓')" "${#deduped_files[@]}" "${total_files}" "${TIKTOK_CLIPS_SELECTED}"
  echo "  ${divider}"

  # ── Phase 2: Vertical smart-crop + per-clip normalization ────────────────
  printf "  %s\n\n" "$(clr_bold "${TIKTOK_PHASE2}:")"

  local concat_list="${tmp_dir}/concat.txt"
  local clip_idx=0

  local entry
  for entry in "${deduped_files[@]}"; do
    (( clip_idx++ )) || true

    # Unpack the colon-delimited tuple (filenames may contain colons only in edge cases
    # so we split from the left to be safe with the score/frame fields which are safe)
    local best_score="${entry%%:*}"; entry="${entry#*:}"
    local best_frame="${entry%%:*}"; entry="${entry#*:}"
    # src_file is everything except the trailing :<dur>
    local dur_sec_val="${entry##*:}"
    local src_file="${entry%:*}"

    local base; base="$(basename "${src_file}")"
    printf "  [%d/%d] %s\n" "${clip_idx}" "${#scored_files[@]}" "$(clr_bold "${base}")"

    # Get region-of-interest from the best-scoring frame
    local subj_x="0.5" subj_y="0.5"
    if [[ -n "${best_frame}" && -f "${best_frame}" ]]; then
      printf "    %s\n" "$(clr_dim "${TIKTOK_STEP_ROI}...")"
      local coords
      coords="$(_get_subject_coords "${best_frame}" "${TIKTOK_OLLAMA_MODEL}")"
      subj_x="${coords%% *}"
      subj_y="${coords##* }"
      printf "    %s ROI: x=%.2f y=%.2f\n" "$(clr_dim '○')" "${subj_x}" "${subj_y}"
    fi

    # Probe source dimensions
    local dim_out vid_w vid_h
    dim_out="$(probe_dimensions "${src_file}")"
    vid_w="${dim_out%% *}"
    vid_h="${dim_out##* }"
    [[ -z "${vid_w}" || "${vid_w}" -eq 0 ]] 2>/dev/null && vid_w=1920
    [[ -z "${vid_h}" || "${vid_h}" -eq 0 ]] 2>/dev/null && vid_h=1080

    # Build 9:16 filter chain
    local vf_tiktok
    vf_tiktok="$(_build_tiktok_vf "${vid_w}" "${vid_h}" "${subj_x}" "${subj_y}")"

    # Dynamic clip duration: linearly map score → [TIKTOK_CLIP_MIN, TIKTOK_CLIP_MAX]
    local clip_dur
    clip_dur="$(awk -v score="${best_score}" -v min_score="${TIKTOK_MIN_SCORE}" \
      -v min_dur="${TIKTOK_CLIP_MIN}" -v max_dur="${TIKTOK_CLIP_MAX}" \
      'BEGIN {
        range = 10 - min_score
        if (range <= 0) range = 1
        t = (score - min_score) / range
        d = min_dur + t * (max_dur - min_dur)
        d = int(d + 0.5)
        if (d < min_dur) d = min_dur
        if (d > max_dur) d = max_dur
        print d
      }')"
    printf "    %s clip duration: %ss (score %d/10)\n" \
      "$(clr_dim '○')" "$(clr_cyan "${clip_dur}")" "${best_score}"

    # Highlight offset: center of the video (clamped so clip fits)
    local start_sec
    start_sec="$(awk -v dur="${dur_sec_val}" -v cd="${clip_dur}" \
      'BEGIN { s = dur/2 - cd/2; if(s<0) s=0; printf "%d", s }')"

    printf "    %s\n" "$(clr_dim "${TIKTOK_STEP_NORMALIZE}...")"

    local clip_out="${tmp_dir}/clip_$(printf '%04d' "${clip_idx}").mp4"

    local ffmpeg_ok=0
    if _is_image_file "${src_file}"; then
      # Photo → loop as still image with silent audio
      if "${FFMPEG_BIN}" -hide_banner -loglevel error \
          "${THREAD_FLAGS[@]}" \
          -loop 1 \
          -i "${src_file}" \
          -f lavfi -i "anullsrc=r=44100:cl=stereo" \
          -t "${clip_dur}" \
          -vf "${vf_tiktok}" \
          -r 30 \
          -c:v libx264 -preset fast -crf 20 \
          -c:a aac -ac 2 -ar 44100 \
          -pix_fmt yuv420p \
          -movflags +faststart \
          -y "${clip_out}" 2>/dev/null; then
        ffmpeg_ok=1
      fi
    else
      # Video → seek to highlight window
      if "${FFMPEG_BIN}" -hide_banner -loglevel error \
          "${THREAD_FLAGS[@]}" \
          -ss "${start_sec}" \
          -i "${src_file}" \
          -t "${clip_dur}" \
          -vf "${vf_tiktok}" \
          -r 30 \
          -c:v libx264 -preset fast -crf 20 \
          -c:a aac -ac 2 -ar 44100 \
          -pix_fmt yuv420p \
          -movflags +faststart \
          -y "${clip_out}" 2>/dev/null; then
        ffmpeg_ok=1
      fi
    fi
    if [[ "${ffmpeg_ok}" -eq 1 ]]; then
      printf "file '%s'\n" "${clip_out}" >> "${concat_list}"
      printf "    %s %s\n\n" "$(clr_bold_green '✓')" "${TIKTOK_CLIP_DONE}"
      _log "[TikTok clip ${clip_idx}] OK: ${base}"
    else
      printf "    %s %s\n\n" "$(clr_yellow '⚠')" "${TIKTOK_CLIP_FAIL}"
      _log "[TikTok clip ${clip_idx}] FAILED: ${base}"
    fi
  done

  if [[ ! -f "${concat_list}" ]] || [[ ! -s "${concat_list}" ]]; then
    printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${TIKTOK_NO_CLIPS_ENCODED}"
    return 1
  fi

  echo "  ${divider}"

  # ── Phase 3: Concat + audio mix ──────────────────────────────────────────
  printf "  %s\n\n" "$(clr_bold "${TIKTOK_PHASE3}:")"
  printf "    %s\n" "$(clr_dim "${TIKTOK_STEP_CONCAT}...")"

  local concat_raw="${tmp_dir}/concat_raw.mp4"
  if ! "${FFMPEG_BIN}" -hide_banner -loglevel error \
      "${THREAD_FLAGS[@]}" \
      -f concat -safe 0 \
      -i "${concat_list}" \
      -c copy \
      -y "${concat_raw}" 2>/dev/null; then
    printf "    %s %s\n\n" "$(clr_bold_red '✗')" "${TIKTOK_CONCAT_FAIL}"
    return 1
  fi

  # Music overlay (optional)
  if [[ -n "${TIKTOK_MUSIC_FILE}" && -f "${TIKTOK_MUSIC_FILE}" ]]; then
    printf "    %s\n" "$(clr_dim "${TIKTOK_STEP_AUDIO}...")"
    if "${FFMPEG_BIN}" -hide_banner -loglevel error \
        "${THREAD_FLAGS[@]}" \
        -i "${concat_raw}" \
        -stream_loop -1 -i "${TIKTOK_MUSIC_FILE}" \
        -filter_complex \
          "[0:a]volume=${TIKTOK_ORIG_AUDIO_VOLUME}[orig];[1:a]volume=${TIKTOK_MUSIC_VOLUME}[music];[orig][music]amix=inputs=2:duration=first:dropout_transition=3[aout]" \
        -map 0:v \
        -map "[aout]" \
        -c:v copy \
        -c:a aac -ac 2 -ar 44100 -b:a 192k \
        -shortest \
        -movflags +faststart \
        -y "${out_reel}" 2>/dev/null; then
      printf "    %s %s\n" "$(clr_bold_green '✓')" "$(clr_dim "${TIKTOK_STEP_AUDIO} done")"
    else
      printf "    %s Audio mix failed — using original audio only.\n" "$(clr_yellow '⚠')"
      cp "${concat_raw}" "${out_reel}"
    fi
  else
    # Re-encode audio to AAC for broad compatibility, keep video stream as-is
    if ! "${FFMPEG_BIN}" -hide_banner -loglevel error \
        "${THREAD_FLAGS[@]}" \
        -i "${concat_raw}" \
        -c:v copy \
        -c:a aac -ac 2 -ar 44100 -b:a 192k \
        -movflags +faststart \
        -y "${out_reel}" 2>/dev/null; then
      # Ultimate fallback: straight copy
      cp "${concat_raw}" "${out_reel}"
    fi
  fi

  echo ""
  echo "  ${divider}"
  printf "  %s %s\n" "$(clr_bold_green '✓')" "${TIKTOK_DONE}"
  printf "  %s: %s\n" "$(clr_bold "${OUTPUT_FOLDER}")" "$(clr_cyan "${out_reel}")"
  echo "  ${divider}"
  echo ""

  _log "[TikTok] Reel written: ${out_reel}"
  return 0
}
