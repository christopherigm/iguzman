#!/usr/bin/env bash
# lib/actions/tiktok.sh - TikTok/Reel assembly (folder → 1 vertical reel)
#
# Pipeline:
#   Phase 1 - LLM frame scoring via Ollama (Gemma multimodal)
#   Phase 2 - Vertical 9:16 smart-crop + per-clip normalization (1080x1920, 30fps)
#   Phase 3 - Concat demuxer + optional background music mix
#
# Depends on: probe.sh, progress.sh, ui.sh, ffmpeg-bootstrap.sh

# ── State globals ─────────────────────────────────────────────────────────────

DO_TIKTOK=0
TIKTOK_OLLAMA_URL="http://localhost:11434"
TIKTOK_OLLAMA_MODEL="gemma4:latest"
TIKTOK_MIN_SCORE=5
TIKTOK_TOP_K_PERCENT=50   # keep top N% of scored clips; 0 = disabled (threshold-only)
TIKTOK_CLIP_MIN=3
TIKTOK_CLIP_MAX=7
TIKTOK_FRAME_INTERVAL=5
TIKTOK_MUSIC_FILE=""
TIKTOK_MUSIC_VOLUME=0.3
TIKTOK_ORIG_AUDIO_VOLUME=0.7
TIKTOK_DEDUP_THRESHOLD=0.95   # SSIM similarity threshold; 1.0 = identical, lower = more aggressive dedup
TIKTOK_SUBJECT_TYPE=""         # e.g. "person", "face", "cat"; empty = generic hero detection
TIKTOK_ROI_FRAMES=3            # frames to average for subject-coord SMA (1 = no smoothing, ≥2 = average window)

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
  printf '{"model":"%s","prompt":"Rate this frame for a short-form vertical video reel.\nRubric:\n1-3: Poor \u2014 blurry, bad exposure, cluttered, or no clear subject.\n4-6: Mediocre \u2014 technically clear but visually uninteresting. Most frames fall here.\n7-8: Good \u2014 sharp, intentional composition, good lighting, clear subject.\n9-10: Exceptional \u2014 cinematic quality, strong emotional impact, high-contrast visual hook.\nDeduct 3 points if the subject is cut off or the frame is severely cluttered.\nAssume 90%% of frames score 6 or lower. Be a harsh critic.\nRespond with: [one-sentence reason] | [integer 1-10]","images":["%s"],"stream":false}' \
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

  # Prefer score after pipe separator (chain-of-thought format: "reason | score")
  local score
  score="$(printf '%s' "${raw_text}" | grep -oE '\|[0-9]+' | grep -o '[0-9]\+' | tail -1)"
  # Fallback: last integer in response (score is at the end in CoT format)
  if [[ -z "${score}" ]]; then
    score="$(printf '%s' "${raw_text}" | grep -o '[0-9]\+' | tail -1)"
  fi
  if [[ -z "${score}" ]]; then
    # Last resort: check top-level numeric field (some model versions)
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
# Prints "<x> <y>" as 0-1 fractions (defaults to "0.5 0.5" on any failure).
_get_subject_coords() {
  local image_path="$1"
  local model="$2"

  [[ ! -f "${image_path}" ]] && { echo "0.5 0.5"; return; }

  local b64
  b64="$(base64 -w 0 "${image_path}" 2>/dev/null)" || { echo "0.5 0.5"; return; }

  # Build subject-type priming hint; strip chars unsafe in JSON/shell
  local _subject_safe=""
  [[ -n "${TIKTOK_SUBJECT_TYPE}" ]] && \
    _subject_safe="$(printf '%s' "${TIKTOK_SUBJECT_TYPE}" | tr -cd 'A-Za-z0-9 ' | head -c 50)"
  local _subject_hint=""
  [[ -n "${_subject_safe}" ]] && \
    _subject_hint=" Focus specifically on the ${_subject_safe}; if there are multiple, choose the one closest to the foreground."

  # Assemble prompt (100×100 integer grid eliminates float ambiguity; CoT yields accurate scores)
  local _prompt
  _prompt="Act as a professional cinematographer. Imagine a 100x100 grid over this image where [0,0] is top-left and [100,100] is bottom-right.${_subject_hint} Identify the Hero of the shot (primary person, face, or moving object) and determine the exact center point of that subject. Do not output 50,50 unless the subject is truly centered. Respond in this format: [one-sentence reasoning] | X,Y"

  # Write payload to a temp file to safely handle large base64 strings
  local tmp_payload
  tmp_payload="$(mktemp /tmp/ollama_roi_XXXXXX.json)"
  printf '{"model":"%s","prompt":"%s","images":["%s"],"stream":false}' \
    "${model}" "${_prompt}" "${b64}" > "${tmp_payload}"

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

  # Extract X,Y from after pipe separator (chain-of-thought: "reason | X,Y")
  local x y coord_str
  coord_str="$(printf '%s' "${raw_text}" | grep -oE '\|[0-9]+,[0-9]+' | tail -1 | tr -d '|')"
  if [[ -n "${coord_str}" ]]; then
    x="${coord_str%%,*}"
    y="${coord_str##*,}"
  else
    # Fallback: last two integers in response (score usually appears at end in CoT format)
    x="$(printf '%s' "${raw_text}" | grep -oE '[0-9]+' | tail -2 | head -1)"
    y="$(printf '%s' "${raw_text}" | grep -oE '[0-9]+' | tail -1)"
  fi

  [[ -z "${x}" ]] && x="50"
  [[ -z "${y}" ]] && y="50"

  # Normalize from 0-100 grid to 0.0-1.0 fraction, clamped
  x="$(awk -v v="${x}" 'BEGIN { v=v/100.0; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"
  y="$(awk -v v="${y}" 'BEGIN { v=v/100.0; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"

  echo "${x} ${y}"
}

# ── Image detection helper ───────────────────────────────────────────────────

# _is_image_file <path>
# Returns 0 if the file extension is a supported still image format.
_is_image_file() {
  local ext="${1##*.}"
  ext="$(lc "${ext}")"
  case "${ext}" in
    jpg|jpeg|png|webp|heic|heif) return 0 ;;
    *) return 1 ;;
  esac
}

# _image_dhash <image_path>
# Computes a 64-bit difference hash (dHash) of an image.
# Outputs a 64-char binary string ("0110...") or "" on failure.
# Algorithm: scale to 9×8 grayscale, compare each pixel to its right neighbour.
_image_dhash() {
  local img="$1"
  [[ ! -f "${img}" ]] && { echo ""; return; }

  "${FFMPEG_BIN}" -hide_banner -loglevel error \
    -i "${img}" \
    -vf "scale=9:8:flags=area,format=gray" \
    -frames:v 1 -f rawvideo pipe:1 2>/dev/null \
  | od -A n -t u1 -v \
  | awk '
    BEGIN { n = 0 }
    { for (i = 1; i <= NF; i++) vals[++n] = $i + 0 }
    END {
      if (n < 72) { print ""; exit }
      h = ""
      for (r = 0; r < 8; r++)
        for (c = 0; c < 8; c++) {
          idx = r * 9 + c + 1
          h = h (vals[idx] < vals[idx+1] ? "1" : "0")
        }
      print h
    }'
}

# _sharpness_score <image_path>
# Returns a focus/sharpness value (0-100, higher = sharper).
# Method: compare original vs heavily-blurred copy with SSIM.
# Sharp images lose more detail when blurred → lower SSIM → higher score.
_sharpness_score() {
  local img="$1"
  [[ ! -f "${img}" ]] && { echo "0"; return; }

  local ssim_out ssim_val
  ssim_out="$("${FFMPEG_BIN}" -hide_banner -loglevel error \
    -i "${img}" \
    -lavfi "[0:v]scale=256:256:flags=bilinear,split[orig][dup];[dup]gblur=sigma=4[blurred];[orig][blurred]ssim" \
    -f null - 2>&1)"

  ssim_val="$(printf '%s' "${ssim_out}" | grep -oE 'All:[0-9]+\.[0-9]+' | head -1 | cut -d: -f2)"
  [[ -z "${ssim_val}" ]] && { echo "0"; return; }

  # Invert: lower SSIM vs blurred = more detail lost = sharper image
  awk -v v="${ssim_val}" 'BEGIN { printf "%.4f\n", (1.0 - v) * 100 }'
}

# _images_are_similar <img1> <img2> <threshold>
# Returns 0 (similar) if dHash Hamming distance ≤ 12 (catches burst shots /
# same-scene variants faster than SSIM), or if SSIM ≥ threshold for borderline
# dHash distances (13-20).  Distances > 20 skip SSIM entirely.
_images_are_similar() {
  local img1="$1"
  local img2="$2"
  local threshold="${3:-0.95}"

  [[ ! -f "${img1}" || ! -f "${img2}" ]] && return 1

  # ── Fast path: dHash ────────────────────────────────────────────────────
  local h1 h2
  h1="$(_image_dhash "${img1}")"
  h2="$(_image_dhash "${img2}")"
  if [[ -n "${h1}" && -n "${h2}" && "${#h1}" -eq 64 && "${#h2}" -eq 64 ]]; then
    local dist
    dist="$(awk -v a="${h1}" -v b="${h2}" 'BEGIN {
      n = split(a, x, ""); split(b, y, "")
      d = 0; for (i = 1; i <= n; i++) if (x[i] != y[i]) d++
      print d
    }')"
    # Hamming ≤ 12 → near-duplicate (covers burst shots / same scene)
    [[ "${dist}" -le 12 ]] 2>/dev/null && return 0
    # Hamming > 20 → clearly different scene; skip expensive SSIM
    [[ "${dist}" -gt 20 ]] 2>/dev/null && return 1
  fi

  # ── Confirm borderline dHash with SSIM ─────────────────────────────────
  local ssim_out ssim_val
  ssim_out="$("${FFMPEG_BIN}" -hide_banner -loglevel error \
    -i "${img1}" -i "${img2}" \
    -lavfi "[0:v]scale=256:256:flags=bilinear[a];[1:v]scale=256:256:flags=bilinear[b];[a][b]ssim" \
    -f null - 2>&1)"

  ssim_val="$(printf '%s' "${ssim_out}" | grep -oE 'All:[0-9]+\.[0-9]+' | head -1 | cut -d: -f2)"
  [[ -z "${ssim_val}" ]] && return 1

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

  # all_scored_files entries: "<score>:<best_frame>:<src_file>:<dur_sec>"
  local -a all_scored_files=()
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
      # ── Photo: score the image directly - no frame extraction needed ──────
      dur_sec="${TIKTOK_CLIP_MAX}"
      printf "    %s\n" "$(clr_dim 'photo - scoring directly...')"
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
        printf "    %s Could not probe duration - skipping.\n" "$(clr_yellow '⚠')"
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
        printf "    %s No frames extracted - skipping.\n" "$(clr_yellow '⚠')"
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
      all_scored_files+=("${best_score}:${best_frame}:${vf_src}:${dur_sec}")
      printf "    %s %s\n\n" "$(clr_bold_green '✓')" "${TIKTOK_SELECTED}"
    else
      printf "    %s %s\n\n" "$(clr_dim '○')" "${TIKTOK_SKIPPED}"
    fi
  done

  if [[ "${#all_scored_files[@]}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '⚠')" "${TIKTOK_NO_CLIPS_SELECTED}"
    return 1
  fi

  # ── Top-K percent selection ──────────────────────────────────────────────
  # Sort candidates by score descending; keep the top TIKTOK_TOP_K_PERCENT %
  # (0 = keep all), then apply TIKTOK_MIN_SCORE as an absolute floor.
  local -a scored_files=()
  local _total_cands="${#all_scored_files[@]}"
  local _keep_count
  _keep_count="$(awk -v n="${_total_cands}" -v pct="${TIKTOK_TOP_K_PERCENT}" \
    'BEGIN { k = (pct > 0) ? int(n * pct / 100 + 0.5) : n; if (k < 1) k = 1; print k }')"
  if [[ "${TIKTOK_TOP_K_PERCENT}" -gt 0 ]]; then
    printf "  %s Top %d%% → keeping %d of %d candidates\n\n" \
      "$(clr_dim '○')" "${TIKTOK_TOP_K_PERCENT}" "${_keep_count}" "${_total_cands}"
  fi
  local _rank=0 _tk_entry
  while IFS= read -r _tk_entry; do
    [[ -z "${_tk_entry}" ]] && continue
    local _tk_score="${_tk_entry%%:*}"
    [[ "${_tk_score}" -lt "${TIKTOK_MIN_SCORE}" ]] 2>/dev/null && break
    (( _rank++ )) || true
    [[ "${_rank}" -le "${_keep_count}" ]] && scored_files+=("${_tk_entry}")
  done < <(printf '%s\n' "${all_scored_files[@]}" | sort -t: -k1 -rn)

  if [[ "${#scored_files[@]}" -eq 0 ]]; then
    printf "  %s %s\n\n" "$(clr_bold_yellow '⚠')" "${TIKTOK_NO_CLIPS_SELECTED}"
    return 1
  fi

  # ── Near-duplicate filter ─────────────────────────────────────────────────
  # Sort by score descending so the best-scored shot enters each group first.
  # For each entry, run dHash+SSIM against accepted frames to detect burst
  # duplicates.  When a near-duplicate is found, compare sharpness scores and
  # keep the sharper image even if its LLM score was lower.
  local -a deduped_files=()
  local -a _accepted_frames=()
  local _raw_entry
  while IFS= read -r _raw_entry; do
    [[ -z "${_raw_entry}" ]] && continue
    local _dup_frame="${_raw_entry#*:}"
    _dup_frame="${_dup_frame%%:*}"
    local _is_dup=0
    local _matched_idx=-1
    local _af_idx
    for (( _af_idx=0; _af_idx<${#_accepted_frames[@]}; _af_idx++ )); do
      if _images_are_similar "${_dup_frame}" "${_accepted_frames[${_af_idx}]}" "${TIKTOK_DEDUP_THRESHOLD}"; then
        _is_dup=1
        _matched_idx="${_af_idx}"
        break
      fi
    done
    if [[ "${_is_dup}" -eq 1 && "${_matched_idx}" -ge 0 ]]; then
      # Near-duplicate found - compare sharpness and keep the crisper image
      local _prev_frame="${_accepted_frames[${_matched_idx}]}"
      local _cand_sharp _prev_sharp
      _cand_sharp="$(_sharpness_score "${_dup_frame}")"
      _prev_sharp="$(_sharpness_score "${_prev_frame}")"
      local _dup_rest="${_raw_entry#*:}"; _dup_rest="${_dup_rest#*:}"
      local _dup_src="${_dup_rest%:*}"
      if [[ "${_cand_sharp}" != "0" && "${_prev_sharp}" != "0" ]] && \
           awk -v c="${_cand_sharp}" -v p="${_prev_sharp}" \
             'BEGIN { exit (c > p * 1.1) ? 0 : 1 }'; then
        # Candidate is ≥10% sharper → replace the accepted entry
        deduped_files[${_matched_idx}]="${_raw_entry}"
        _accepted_frames[${_matched_idx}]="${_dup_frame}"
        printf "  %s %s\n" "$(clr_dim '↑')" "$(clr_dim "${TIKTOK_DEDUP_REPLACED}: $(basename "${_dup_src}")")"
      else
        printf "  %s %s\n" "$(clr_dim '≈')" "$(clr_dim "${TIKTOK_DEDUP_SKIP}: $(basename "${_dup_src}")")"
      fi
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

    # Get region-of-interest via SMA across TIKTOK_ROI_FRAMES neighboring frames
    local subj_x="0.5" subj_y="0.5"
    if [[ -n "${best_frame}" && -f "${best_frame}" ]]; then
      printf "    %s\n" "$(clr_dim "${TIKTOK_STEP_ROI}...")"
      if _is_image_file "${src_file}" || [[ "${TIKTOK_ROI_FRAMES}" -le 1 ]]; then
        # Still image or smoothing disabled - single query
        local coords
        coords="$(_get_subject_coords "${best_frame}" "${TIKTOK_OLLAMA_MODEL}")"
        subj_x="${coords%% *}"
        subj_y="${coords##* }"
      else
        # Video - build a window of TIKTOK_ROI_FRAMES frames centered on best_frame for SMA
        local _roi_dir; _roi_dir="$(dirname "${best_frame}")"
        local _best_base; _best_base="$(basename "${best_frame}")"
        local -a _all_roi=()
        while IFS= read -r _rf; do _all_roi+=("${_rf}"); done \
          < <(find "${_roi_dir}" -maxdepth 1 -name "*.jpg" 2>/dev/null | sort)

        # Locate best_frame index in sorted list
        local _best_idx=0 _rfi
        for (( _rfi=0; _rfi<${#_all_roi[@]}; _rfi++ )); do
          [[ "$(basename "${_all_roi[${_rfi}]}")" == "${_best_base}" ]] && \
            { _best_idx="${_rfi}"; break; }
        done

        # Compute window bounds centered on best_frame
        local _half=$(( TIKTOK_ROI_FRAMES / 2 ))
        local _ws=$(( _best_idx - _half ))
        [[ "${_ws}" -lt 0 ]] && _ws=0
        local _we=$(( _ws + TIKTOK_ROI_FRAMES - 1 ))
        local _total_roi="${#_all_roi[@]}"
        [[ "${_we}" -ge "${_total_roi}" ]] && _we=$(( _total_roi - 1 ))

        local _acc_x="0.0" _acc_y="0.0" _roi_n=0
        local _roi_f _rc
        for (( _rfi=_ws; _rfi<=_we; _rfi++ )); do
          _roi_f="${_all_roi[${_rfi}]}"
          [[ ! -f "${_roi_f}" ]] && continue
          _rc="$(_get_subject_coords "${_roi_f}" "${TIKTOK_OLLAMA_MODEL}")"
          printf "    %s frame %d: x=%s y=%s\n" \
            "$(clr_dim '·')" "$(( _rfi + 1 ))" "${_rc%% *}" "${_rc##* }"
          _acc_x="$(awk -v a="${_acc_x}" -v b="${_rc%% *}" 'BEGIN{printf "%.4f",a+b}')"
          _acc_y="$(awk -v a="${_acc_y}" -v b="${_rc##* }" 'BEGIN{printf "%.4f",a+b}')"
          (( _roi_n++ )) || true
        done

        if [[ "${_roi_n}" -gt 0 ]]; then
          subj_x="$(awk -v s="${_acc_x}" -v n="${_roi_n}" \
            'BEGIN{v=s/n; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"
          subj_y="$(awk -v s="${_acc_y}" -v n="${_roi_n}" \
            'BEGIN{v=s/n; if(v<0)v=0; if(v>1)v=1; printf "%.4f",v}')"
        fi
      fi
      printf "    %s ROI (SMA n=%d): x=%.2f y=%.2f\n" \
        "$(clr_dim '○')" "${TIKTOK_ROI_FRAMES}" "${subj_x}" "${subj_y}"
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
      # Photo → loop as still image with slow zoom-in animation + silent audio
      local _frames=$(( clip_dur * 30 ))
      local _zinc
      _zinc="$(awk -v f="${_frames}" 'BEGIN { printf "%.6f", 0.03 / f }')"
      local _vf_zoom="${vf_tiktok},zoompan=z='min(zoom+${_zinc},1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${_frames}:s=1080x1920:fps=30"
      if "${FFMPEG_BIN}" -hide_banner -loglevel error \
          "${THREAD_FLAGS[@]}" \
          -loop 1 \
          -i "${src_file}" \
          -f lavfi -i "anullsrc=r=44100:cl=stereo" \
          -t "${clip_dur}" \
          -vf "${_vf_zoom}" \
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
      printf "    %s Audio mix failed - using original audio only.\n" "$(clr_yellow '⚠')"
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
