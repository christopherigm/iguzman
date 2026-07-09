#!/usr/bin/env bash
# fix-audio.sh - Inspect, detect, and fix common ALSA audio issues on Ubuntu Server
#
# Usage:
#   ./fix-audio.sh [OPTIONS]
#
# Options:
#   -h, --help           Show this help message
#   -n, --dry-run        Show what would be fixed without applying changes
#   -f, --force          Set every control to --volume and unmute it, even when
#                        it is not muted and not at 0% (default: only fix broken ones)
#   -v, --volume <0-100> Target volume to set (default: 100)
#   -c, --card <N|name>  Target a specific card index or name (default: all cards)
#   -p, --persist        Persist fixes across reboots via alsactl store
#   -q, --quiet          Suppress informational output (errors still shown)
#
# What it checks:
#   - Required tools are installed (amixer, aplay)
#   - At least one playback device exists
#   - Master, PCM, Speaker, Headphone and Front controls are unmuted and have volume > 0
#   - IEC958 (the S/PDIF + HDMI switch) is unmuted. It carries no volume level,
#     so it is only ever unmuted, never set to a percentage.
#
# Note: a pure HDMI card exposes no 'Master' at all - only IEC958 switches - so
# on an HDMI sink there is no hardware volume to raise. Attenuate in the player
# instead (play-videos.sh --volume N, which is mpv's software volume).
#
# Examples:
#   ./fix-audio.sh
#   ./fix-audio.sh --dry-run
#   ./fix-audio.sh --volume 80 --persist
#   ./fix-audio.sh --card 0 --persist
#   ./fix-audio.sh --force --quiet           # what play-videos.sh runs before playback
#   ./fix-audio.sh --force --card PCH

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
DRY_RUN="no"
FORCE="no"         # yes = set every control, not just muted / 0% ones
TARGET_VOLUME=100
TARGET_CARD=""     # empty = all cards
PERSIST="no"
QUIET="no"

# ── Counters ──────────────────────────────────────────────────────────────────
ISSUES_FOUND=0
ISSUES_FIXED=0
CHANGES_APPLIED=0   # every successful amixer write, including --force ones that fixed nothing

# ── Colors ────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,1\}//'
  exit 0
}

die()   { echo -e "${RED}ERROR:${RESET} $*" >&2; exit 1; }
info()  { [[ "${QUIET}" == "yes" ]] && return; echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { [[ "${QUIET}" == "yes" ]] && return; echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
issue() { echo -e "${YELLOW}[ISSUE]${RESET} $*"; (( ISSUES_FOUND++ )) || true; }
fixed() { echo -e "${GREEN}[FIXED]${RESET} $*"; (( ISSUES_FIXED++ )) || true; }

require() {
  command -v "$1" &>/dev/null || die "'$1' not found. Install with: sudo apt install $2"
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)         usage ;;
    -n|--dry-run)      DRY_RUN="yes" ;;
    -f|--force)        FORCE="yes" ;;
    -p|--persist)      PERSIST="yes" ;;
    -q|--quiet)        QUIET="yes" ;;
    -v|--volume)       TARGET_VOLUME="$2"; shift ;;
    -c|--card)         TARGET_CARD="$2"; shift ;;
    *) die "Unknown option: $1. Use --help for usage." ;;
  esac
  shift
done

[[ "${TARGET_VOLUME}" =~ ^[0-9]+$ ]] && [[ "${TARGET_VOLUME}" -le 100 ]] \
  || die "--volume must be an integer between 0 and 100"

# ── Pre-flight ────────────────────────────────────────────────────────────────
require amixer alsa-utils
require aplay  alsa-utils

[[ "${DRY_RUN}" == "yes" ]] && info "Dry-run mode: no changes will be applied."

# ── Check: playback devices exist ─────────────────────────────────────────────
check_playback_devices() {
  info "Checking for playback devices..."
  local devices
  devices=$(aplay -l 2>&1) || die "aplay failed. Is ALSA installed? (sudo apt install alsa-utils)"

  if ! echo "${devices}" | grep -q 'card'; then
    issue "No ALSA playback devices found."
    warn "Possible causes:"
    warn "  - No audio hardware detected"
    warn "  - Kernel audio modules not loaded (try: sudo modprobe snd_hda_intel)"
    warn "  - User not in 'audio' group (fix: sudo usermod -aG audio \$(id -un))"
    return
  fi

  ok "Playback devices found:"
  [[ "${QUIET}" == "yes" ]] || echo "${devices}" | grep -E '^card' | sed 's/^/        /'
}

# ── Fix a single mixer control ────────────────────────────────────────────────
# Usage: fix_control <card_index> <control_name>
fix_control() {
  local card="$1" control="$2"

  # Check whether this control exists on this card
  local info
  info=$(amixer -c "${card}" get "${control}" 2>/dev/null) || return 0  # not present = skip

  local label="card ${card} '${control}'"

  # Switch-only controls (IEC958 on HDMI/S-PDIF) report no percentage. They can
  # be muted but carry no level, so they are unmuted and never given a volume.
  local has_volume="no"
  if echo "${info}" | grep -qE 'Playback [0-9]+ \[[0-9]+%\]'; then
    has_volume="yes"
  fi

  local problems=()
  if echo "${info}" | grep -qE 'Playback.*\[off\]'; then
    problems+=("muted")
  fi
  if [[ "${has_volume}" == "yes" ]] && echo "${info}" | grep -qE 'Playback [0-9]+ \[0%\]'; then
    problems+=("volume at 0%")
  fi

  # Without --force, a healthy control is left exactly as the user set it.
  if [[ ${#problems[@]} -eq 0 && "${FORCE}" == "no" ]]; then
    if [[ "${has_volume}" == "yes" ]]; then
      # `|| true`: grep exits 1 when there is no percentage to match, and with
      # `set -o pipefail` that would abort the whole script.
      local vol
      vol=$(echo "${info}" | grep -oE '\[[0-9]+%\]' | head -1 | tr -d '[]%' || true)
      ok "${label}: OK (volume ${vol:-?}%)"
    else
      ok "${label}: OK (unmuted)"
    fi
    return 0
  fi

  [[ ${#problems[@]} -gt 0 ]] && issue "${label}: ${problems[*]}"

  # A switch-only control takes 'unmute' alone; passing it a percentage errors.
  local -a args=()
  [[ "${has_volume}" == "yes" ]] && args+=("${TARGET_VOLUME}%")
  args+=(unmute)

  local what
  [[ "${has_volume}" == "yes" ]] && what="set to ${TARGET_VOLUME}% and unmuted" || what="unmuted"

  if [[ "${DRY_RUN}" == "yes" ]]; then
    warn "  Would run: amixer -c ${card} set '${control}' ${args[*]}"
    return
  fi

  if amixer -c "${card}" set "${control}" "${args[@]}" &>/dev/null; then
    (( CHANGES_APPLIED++ )) || true
    if [[ ${#problems[@]} -gt 0 ]]; then
      fixed "${label}: ${what}"
    else
      ok "${label}: ${what} (--force)"     # was already healthy; not counted as an issue
    fi
  else
    warn "${label}: failed to fix (may be read-only or unsupported)"
  fi
}

# ── Inspect and fix a single card ─────────────────────────────────────────────
inspect_card() {
  local card="$1"
  info "Inspecting card ${card}..."

  # Controls to check in priority order. IEC958 is last: it is the HDMI/S-PDIF
  # switch, and on a pure HDMI card it is the only control that exists at all.
  local controls=("Master" "PCM" "Speaker" "Headphone" "Front" "IEC958")

  for control in "${controls[@]}"; do
    fix_control "${card}" "${control}"
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────
# The banner and the summary are informational, so --quiet drops them too. That
# lets play-videos.sh run this before every playback without spamming the screen.
if [[ "${QUIET}" != "yes" ]]; then
  echo -e "${BOLD}=== ALSA Audio Inspector ===${RESET}"
  echo ""
fi

check_playback_devices
[[ "${QUIET}" == "yes" ]] || echo ""

# Determine which cards to inspect
if [[ -n "${TARGET_CARD}" ]]; then
  cards=("${TARGET_CARD}")
else
  mapfile -t cards < <(aplay -l 2>/dev/null | grep '^card' | awk '{print $2}' | tr -d ':' | sort -un)
fi

if [[ ${#cards[@]} -eq 0 ]]; then
  die "No cards to inspect. Check that ALSA is installed and audio hardware is present."
fi

for card in "${cards[@]}"; do
  inspect_card "${card}"
  [[ "${QUIET}" == "yes" ]] || echo ""
done

# ── Persist ───────────────────────────────────────────────────────────────────
# Keyed on CHANGES_APPLIED, not ISSUES_FIXED: --force writes controls that were
# never broken, and those still deserve to survive a reboot when --persist is on.
if [[ "${PERSIST}" == "yes" && "${DRY_RUN}" == "no" && "${CHANGES_APPLIED}" -gt 0 ]]; then
  info "Persisting ALSA state via alsactl store..."
  if alsactl store 2>/dev/null; then
    ok "ALSA state saved. Settings will survive reboots."
  else
    warn "alsactl store failed (try with sudo). Settings may not persist after reboot."
  fi
elif [[ "${ISSUES_FIXED}" -gt 0 && "${PERSIST}" == "no" && "${QUIET}" != "yes" ]]; then
  warn "Changes applied but not persisted. Run with --persist or: sudo alsactl store"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
# --quiet callers (play-videos.sh) want the mixer set, not a report.
[[ "${QUIET}" == "yes" ]] && exit 0
echo -e "${BOLD}=== Summary ===${RESET}"
echo "  Issues found : ${ISSUES_FOUND}"
if [[ "${DRY_RUN}" == "yes" ]]; then
  echo "  Would fix    : ${ISSUES_FOUND}"
else
  echo "  Issues fixed : ${ISSUES_FIXED}"
fi

if [[ "${ISSUES_FOUND}" -eq 0 ]]; then
  echo -e "  ${GREEN}No audio issues detected.${RESET}"
elif [[ "${ISSUES_FIXED}" -ge "${ISSUES_FOUND}" ]]; then
  echo -e "  ${GREEN}All issues resolved.${RESET}"
else
  echo -e "  ${YELLOW}Some issues could not be fixed automatically.${RESET}"
  echo "  Manual steps to try:"
  echo "    1. Check group membership:  sudo usermod -aG audio \$(id -un)"
  echo "    2. Reload ALSA:             sudo alsa force-reload"
  echo "    3. Load HDA module:         sudo modprobe snd_hda_intel"
  echo "    4. List all controls:       amixer -c 0 scontents"
fi
echo ""