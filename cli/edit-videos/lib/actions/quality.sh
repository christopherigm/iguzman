#!/usr/bin/env bash
# lib/actions/quality.sh - CPU quality filters: denoise, sharpen, upscale, downsize, color
# Depends on: probe.sh (probe_dimensions), ui.sh

# Each function appends the relevant filter(s) to the vf_chain nameref.

# ── Denoise (hqdn3d) ──────────────────────────────────────────────────────────

apply_denoise_filter() {
  local -n _vf_ref="$1"
  local luma_s="${2:-4}" chroma_s="${3:-4}" luma_t="${4:-3}" chroma_t="${5:-3}"
  _vf_ref+=("hqdn3d=${luma_s}:${chroma_s}:${luma_t}:${chroma_t}")
}

# ── Color / contrast (eq) ─────────────────────────────────────────────────────

apply_color_filter() {
  local -n _vf_ref="$1"
  local contrast="${2:-1.1}" brightness="${3:-0.0}" saturation="${4:-1.1}" gamma="${5:-1.0}"
  _vf_ref+=("eq=contrast=${contrast}:brightness=${brightness}:saturation=${saturation}:gamma=${gamma}")
}

# ── Sharpen (unsharp mask) ────────────────────────────────────────────────────

apply_sharpen_filter() {
  local -n _vf_ref="$1"
  local matrix="${2:-5}" luma_amount="${3:-1.0}" chroma_amount="${4:-0.0}"
  _vf_ref+=("unsharp=${matrix}:${matrix}:${luma_amount}:${matrix}:${matrix}:${chroma_amount}")
}

# ── Downsize (scale+lanczos, AR-preserving) ───────────────────────────────────

apply_downsize_filter() {
  local -n _vf_ref="$1"
  local input="$2"
  local target_w="${3:-1920}" target_h="${4:-1080}"

  local dim_out vid_w vid_h
  dim_out="$(probe_dimensions "${input}")"
  vid_w="${dim_out%% *}"
  vid_h="${dim_out##* }"

  if [[ "${vid_w}" -eq 0 || "${vid_h}" -eq 0 ]]; then
    printf "    %s Could not read video dimensions - skipping downsize.\n" "$(clr_yellow '⚠')"
    return
  fi

  if [[ "${vid_w}" -le "${target_w}" && "${vid_h}" -le "${target_h}" ]]; then
    printf "    %s %s (%sx%s ≤ %sx%s)\n" \
      "$(clr_dim '○')" "${DOWNSIZE_SKIP_MSG}" \
      "${vid_w}" "${vid_h}" "${target_w}" "${target_h}"
    return
  fi

  _vf_ref+=("scale=${target_w}:${target_h}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
}

# ── Upscale (scale+lanczos, AR-preserving) ───────────────────────────────────

apply_upscale_filter() {
  local -n _vf_ref="$1"
  local input="$2"
  local target_w="${3:-1920}" target_h="${4:-1080}"

  local dim_out vid_w vid_h
  dim_out="$(probe_dimensions "${input}")"
  vid_w="${dim_out%% *}"
  vid_h="${dim_out##* }"

  if [[ "${vid_w}" -eq 0 || "${vid_h}" -eq 0 ]]; then
    printf "    %s Could not read video dimensions - skipping upscale.\n" "$(clr_yellow '⚠')"
    return
  fi

  if [[ "${vid_w}" -ge "${target_w}" || "${vid_h}" -ge "${target_h}" ]]; then
    printf "    %s %s (%sx%s ≥ %sx%s)\n" \
      "$(clr_dim '○')" "${UPSCALE_SKIP_MSG}" \
      "${vid_w}" "${vid_h}" "${target_w}" "${target_h}"
    return
  fi

  _vf_ref+=("scale=${target_w}:${target_h}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2")
}
