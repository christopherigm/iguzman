#!/usr/bin/env bash
# fix-video.sh - Inspect, detect, and fix DRM/KMS video-output issues on Ubuntu Server
#
# play-videos.sh renders with mpv's --vo=drm, straight onto the HDMI console.
# That needs three things at once, and this script checks all three:
#
#   1. A real console VT      - an SSH pty can never drive DRM output
#   2. DRM atomic modesetting - mpv's drm VO requires it
#   3. DRM master             - a running desktop/display-manager owns the GPU
#
# The AMD case this was written for: old GCN/CIK APUs (Temash, Kabini, Kaveri,
# Beema, Mullins) bind to the legacy 'radeon' driver, which has no atomic KMS.
# Forcing 'amdgpu' fixes that - but amdgpu then falls back to its own *legacy*
# display path on DCE-8 hardware, which also has no atomic, so Display Core has
# to be forced on as well:
#
#   GRUB_CMDLINE_LINUX_DEFAULT="... radeon.si_support=0 radeon.cik_support=0
#                                   amdgpu.si_support=1 amdgpu.cik_support=1 amdgpu.dc=1"
#
# All five parameters are a single unit: amdgpu.dc=1 does nothing unless amdgpu
# owns the card, and amdgpu will not claim it while radeon.*_support is enabled.
#
# Usage:
#   ./fix-video.sh [OPTIONS]
#
# Options:
#   -h, --help      Show this help message
#   -n, --dry-run   Show what would be fixed without applying changes
#   -y, --yes       Apply GRUB fixes without prompting (never reboots)
#   -q, --quiet     Suppress informational output (errors still shown)
#   --headless      Also set the boot target to multi-user.target (no desktop),
#                   freeing the GPU so mpv can become DRM master. Opt-in only.
#
# What it checks:
#   - /dev/dri DRM devices exist and the user is in the 'video' group
#   - The session is a real console VT (not SSH, not a terminal emulator)
#   - No display manager / compositor is holding DRM master
#   - The GPU's kernel driver supports atomic modesetting:
#       radeon           -> offers the amdgpu switch          (GRUB, needs reboot)
#       amdgpu + dc off  -> offers amdgpu.dc=1                (GRUB, needs reboot)
#       nvidia-drm       -> reports the modeset=1 requirement (not auto-applied)
#
# Exit codes:
#   0  no issues, or every issue was fixed
#   1  issues remain (see the summary)
#
# Examples:
#   ./fix-video.sh
#   ./fix-video.sh --dry-run
#   sudo ./fix-video.sh --yes
#   sudo ./fix-video.sh --yes --headless      # re-imaging a dedicated media box

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
DRY_RUN="no"
ASSUME_YES="no"
QUIET="no"
GO_HEADLESS="no"

# ── Counters ──────────────────────────────────────────────────────────────────
ISSUES_FOUND=0
ISSUES_FIXED=0
NEEDS_REBOOT="no"

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
info()  { [[ "${QUIET}" == "yes" ]] && return 0; echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { [[ "${QUIET}" == "yes" ]] && return 0; echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
issue() { echo -e "${YELLOW}[ISSUE]${RESET} $*"; (( ISSUES_FOUND++ )) || true; }
fixed() { echo -e "${GREEN}[FIXED]${RESET} $*"; (( ISSUES_FIXED++ )) || true; }
step()  { [[ "${QUIET}" == "yes" ]] && return 0; [[ -z "$*" ]] && { echo ""; return 0; }; echo -e "        $*"; }

SUDO=""; [[ "$(id -u)" -ne 0 ]] && SUDO="sudo"

# Ask a yes/no question. --yes answers itself; a non-interactive shell declines.
confirm() {
  [[ "${ASSUME_YES}" == "yes" ]] && return 0
  [[ -t 0 ]] || { warn "Non-interactive shell - not applying. Re-run with --yes."; return 1; }
  local ans
  printf "        %bApply this change?%b [y/N]: " "${BOLD}" "${RESET}" >&2
  read -r ans
  [[ "$(printf '%s' "${ans}" | tr '[:upper:]' '[:lower:]')" =~ ^y ]]
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)    usage ;;
    -n|--dry-run) DRY_RUN="yes" ;;
    -y|--yes)     ASSUME_YES="yes" ;;
    -q|--quiet)   QUIET="yes" ;;
    --headless)   GO_HEADLESS="yes" ;;
    *) die "Unknown option: $1. Use --help for usage." ;;
  esac
  shift
done

[[ "${DRY_RUN}" == "yes" ]] && info "Dry-run mode: no changes will be applied."

# ── Probes ────────────────────────────────────────────────────────────────────

# The kernel driver bound to a DRM card, e.g. "amdgpu" / "radeon" / "i915".
drm_driver() {
  local card="$1" link="/sys/class/drm/$1/device/driver"
  [[ -L "${link}" ]] || return 1
  basename "$(readlink -f "${link}")"
}

# All real DRM cards, skipping simpledrm's placeholder framebuffer.
drm_cards() {
  local path name
  for path in /sys/class/drm/card[0-9]*; do
    [[ -e "${path}" ]] || continue
    name="$(basename "${path}")"
    [[ "${name}" == *-* ]] && continue          # card0-HDMI-A-1 is a connector, not a card
    drm_driver "${name}" &>/dev/null || continue
    printf '%s\n' "${name}"
  done
}

# Are we on a real virtual console (/dev/tty1..N), as DRM output requires?
on_console_vt() {
  [[ -n "${SSH_CONNECTION:-}" ]] && return 1
  local t; t="$(tty 2>/dev/null || true)"
  [[ "${t}" =~ ^/dev/tty[0-9]+$ ]]
}

dmesg_readable() { dmesg &>/dev/null; }

# amdgpu's Display Core is the only amdgpu display path with atomic KMS.
# dc=1 forced on, dc=0 forced off, dc=-1 auto (off on old DCE-8 parts) - in the
# auto case only the boot log can tell us which way the kernel actually went.
amdgpu_dc_state() {
  local f="/sys/module/amdgpu/parameters/dc" v
  [[ -r "${f}" ]] || { printf 'unknown'; return; }
  v="$(cat "${f}")"
  case "${v}" in
    1|Y|y) printf 'on';  return ;;
    0|N|n) printf 'off'; return ;;
  esac
  if dmesg_readable; then
    dmesg 2>/dev/null | grep -qi 'display core initialized' \
      && printf 'on' || printf 'off'
  else
    printf 'unknown'
  fi
}

nvidia_modeset_on() {
  local f="/sys/module/nvidia_drm/parameters/modeset"
  [[ -r "${f}" ]] && [[ "$(cat "${f}")" =~ ^[Y1]$ ]]
}

display_manager_running() {
  systemctl is-active --quiet display-manager 2>/dev/null && return 0
  pgrep -x Xorg        &>/dev/null && return 0
  pgrep -x gnome-shell &>/dev/null && return 0
  return 1
}

# ── GRUB kernel-parameter editing ─────────────────────────────────────────────
GRUB_FILE="/etc/default/grub"
GRUB_KEY="GRUB_CMDLINE_LINUX_DEFAULT"

grub_cmdline() {
  [[ -r "${GRUB_FILE}" ]] || return 1
  sed -n "s/^[[:space:]]*${GRUB_KEY}=\"\(.*\)\"[[:space:]]*\$/\1/p" "${GRUB_FILE}" | tail -1
}

# Merge <key=value> params into a cmdline, replacing any existing value for the
# same key rather than appending a duplicate the kernel would have to arbitrate.
merge_params() {
  local cur="$1"; shift
  local -a want=("$@") toks=() out=()
  set -f; toks=(${cur}); set +f          # kernel params never contain spaces
  local tok p k drop
  for tok in ${toks[@]+"${toks[@]}"}; do
    drop="no"
    for p in "${want[@]}"; do
      k="${p%%=*}"
      [[ "${tok}" == "${k}="* ]] && { drop="yes"; break; }
    done
    [[ "${drop}" == "no" ]] && out+=("${tok}")
  done
  out+=("${want[@]}")
  printf '%s' "${out[*]}"
}

# True when every requested param is already present verbatim.
params_present() {
  local cur=" $1 "; shift
  local p
  for p in "$@"; do
    [[ "${cur}" == *" ${p} "* ]] || return 1
  done
  return 0
}

apply_grub_params() {
  local reason="$1"; shift
  local -a params=("$@")
  local cur new ts

  [[ -r "${GRUB_FILE}" ]] || { warn "${GRUB_FILE} not readable - cannot apply: ${params[*]}"; return 1; }
  cur="$(grub_cmdline || true)"
  new="$(merge_params "${cur}" "${params[@]}")"

  step "Reason : ${reason}"
  step "Current: ${GRUB_KEY}=\"${cur}\""
  step "New    : ${GRUB_KEY}=\"${new}\""

  if [[ "${DRY_RUN}" == "yes" ]]; then
    warn "  Would edit ${GRUB_FILE} and run update-grub."
    return 1
  fi
  confirm || { warn "Skipped. Apply manually, then: sudo update-grub && sudo reboot"; return 1; }

  ts="$(date +%Y%m%d-%H%M%S)"
  ${SUDO} cp -a "${GRUB_FILE}" "${GRUB_FILE}.bak.${ts}" \
    || { warn "Backup failed - aborting, ${GRUB_FILE} untouched."; return 1; }
  step "Backed up ${GRUB_FILE} -> ${GRUB_FILE}.bak.${ts}"

  if grep -qE "^[[:space:]]*${GRUB_KEY}=" "${GRUB_FILE}"; then
    ${SUDO} sed -i -E "s|^[[:space:]]*${GRUB_KEY}=.*|${GRUB_KEY}=\"${new}\"|" "${GRUB_FILE}"
  else
    printf '%s="%s"\n' "${GRUB_KEY}" "${new}" | ${SUDO} tee -a "${GRUB_FILE}" >/dev/null
  fi

  ${SUDO} update-grub || { warn "update-grub failed. Restore: sudo cp ${GRUB_FILE}.bak.${ts} ${GRUB_FILE}"; return 1; }
  NEEDS_REBOOT="yes"
  return 0
}

# ── Check: DRM devices + group membership ─────────────────────────────────────
check_devices() {
  info "Checking DRM devices..."
  local -a cards=()
  mapfile -t cards < <(drm_cards)

  if [[ ${#cards[@]} -eq 0 ]]; then
    issue "No DRM cards found under /sys/class/drm."
    step "Possible causes:"
    step "  - No GPU / HDMI output on this machine"
    step "  - Kernel graphics module not loaded (check: lspci -k | grep -A3 -i vga)"
    return
  fi

  local c
  for c in "${cards[@]}"; do
    ok "${c}: driver '$(drm_driver "${c}")'"
  done

  if id -nG 2>/dev/null | grep -qw video; then
    ok "User '$(id -un)' is in the 'video' group."
  else
    issue "User '$(id -un)' is not in the 'video' group - DRM access will fail."
    step "Fix: sudo usermod -aG video $(id -un)   # then log out and back in"
  fi
}

# ── Check: are we on a console VT? ────────────────────────────────────────────
check_console() {
  info "Checking for a console VT..."
  if on_console_vt; then
    ok "Running on a real console VT ($(tty))."
    return
  fi

  issue "Not on a console VT$( [[ -n "${SSH_CONNECTION:-}" ]] && printf ' (this is an SSH session)' )."
  step "mpv's --vo=drm draws onto the physical framebuffer and needs a virtual"
  step "console. An SSH pty or a terminal emulator cannot provide one, so mpv"
  step "fails with: 'VT_GETMODE failed: Inappropriate ioctl for device'."
  step ""
  step "This is an environment issue - no config change can fix it. Either:"
  step "  - Log in on the machine's own keyboard (Ctrl+Alt+F1) and run there, or"
  step "  - Hand mpv a VT from SSH:  sudo openvt -s -w -- ./play-videos.sh <file>"
  step "    (playback keys then come from the physical keyboard, not SSH)"
}

# ── Check: is a desktop holding DRM master? ───────────────────────────────────
check_drm_master() {
  info "Checking whether a desktop holds DRM master..."
  local target; target="$(systemctl get-default 2>/dev/null || echo unknown)"

  if ! display_manager_running; then
    ok "No display manager or compositor running (boot target: ${target})."
    return
  fi

  issue "A display server is running - it owns the GPU, so mpv cannot become DRM master."
  step "Boot target: ${target}"

  if [[ "${GO_HEADLESS}" != "yes" ]]; then
    step "Fix (opt-in): re-run with --headless, or do it manually:"
    step "  sudo systemctl set-default multi-user.target && sudo reboot"
    step "Or, just for now:  sudo systemctl stop display-manager"
    return
  fi

  step "--headless given: switching the boot target to multi-user.target."
  if [[ "${DRY_RUN}" == "yes" ]]; then
    warn "  Would run: systemctl set-default multi-user.target"
    return
  fi
  confirm || { warn "Skipped the boot-target change."; return; }
  if ${SUDO} systemctl set-default multi-user.target &>/dev/null; then
    NEEDS_REBOOT="yes"
    fixed "Boot target set to multi-user.target (no desktop after reboot)."
  else
    warn "Could not change the boot target."
  fi
}

# ── Check: does the GPU driver support atomic modesetting? ────────────────────
AMD_SWITCH_PARAMS=(
  radeon.si_support=0
  radeon.cik_support=0
  amdgpu.si_support=1
  amdgpu.cik_support=1
  amdgpu.dc=1
)

check_atomic() {
  info "Checking DRM atomic modesetting support..."
  local -a cards=()
  mapfile -t cards < <(drm_cards)
  [[ ${#cards[@]} -eq 0 ]] && return

  # Inspect every card: mpv picks one at runtime, and a machine can pair an
  # atomic-capable iGPU with a discrete card that is not.
  local card
  for card in "${cards[@]}"; do
    check_card_atomic "${card}"
  done
}

check_card_atomic() {
  local card="$1" driver cur
  driver="$(drm_driver "${card}")"

  case "${driver}" in
    radeon)
      issue "'${card}' uses the legacy 'radeon' driver, which has no atomic KMS."
      step "mpv's drm VO requires atomic, hence: 'no DRM Atomic support'."
      step "Fix: hand this GCN/CIK GPU to 'amdgpu', which does support atomic."
      cur="$(grub_cmdline || true)"
      if params_present "${cur}" "${AMD_SWITCH_PARAMS[@]}"; then
        warn "The GRUB params are already set but 'radeon' is still bound."
        step "Did you run 'sudo update-grub' and reboot? Check: cat /proc/cmdline"
        step "If they are on the kernel command line, amdgpu failed to bind - see:"
        step "  sudo dmesg | grep -iE 'amdgpu|radeon'"
        step "A missing firmware blob is the usual cause: sudo apt install linux-firmware"
        return
      fi
      apply_grub_params "switch radeon -> amdgpu (atomic KMS + Display Core)" \
        "${AMD_SWITCH_PARAMS[@]}" \
        && fixed "GRUB updated. Reboot, then verify: lspci -k | grep -A2 -i vga"
      ;;

    amdgpu)
      local dc; dc="$(amdgpu_dc_state)"
      case "${dc}" in
        on)
          ok "'${card}' uses 'amdgpu' with Display Core on - atomic KMS available."
          ;;
        unknown)
          warn "'${card}' uses 'amdgpu' but Display Core state is unreadable (dc=auto)."
          step "Re-run this script with sudo so it can read the kernel log."
          ;;
        off)
          issue "'${card}' uses 'amdgpu' but Display Core is OFF - so there is no atomic KMS."
          step "On old DCE-8 parts (Temash/Kabini/Kaveri) amdgpu.dc defaults to auto,"
          step "which resolves to off, leaving the legacy non-atomic display path."
          apply_grub_params "force amdgpu Display Core on (atomic KMS)" "amdgpu.dc=1" \
            && fixed "GRUB updated. Reboot, then verify: cat /sys/module/amdgpu/parameters/dc"
          ;;
      esac
      ;;

    nvidia-drm|nvidia)
      if nvidia_modeset_on; then
        ok "'${card}' uses 'nvidia-drm' with modeset=1 - atomic KMS available."
      else
        issue "'${card}' uses NVIDIA without DRM modesetting - no atomic KMS."
        step "Fix (not auto-applied; it rebuilds the initramfs):"
        step "  echo 'options nvidia-drm modeset=1' | sudo tee /etc/modprobe.d/nvidia-drm.conf"
        step "  sudo update-initramfs -u && sudo reboot"
      fi
      ;;

    *)
      ok "'${card}' uses '${driver}' - assumed to support atomic KMS."
      ;;
  esac
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo -e "${BOLD}=== DRM / KMS Video Inspector ===${RESET}"
echo ""

check_devices;    echo ""
check_console;    echo ""
check_drm_master; echo ""
check_atomic;     echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}=== Summary ===${RESET}"
echo "  Issues found : ${ISSUES_FOUND}"
if [[ "${DRY_RUN}" == "yes" ]]; then
  # Not every issue is auto-fixable - an SSH session and a running desktop are
  # environment problems - so never promise a count here.
  echo "  Dry run - nothing was changed. Each fixable issue printed its diff above."
else
  echo "  Issues fixed : ${ISSUES_FIXED}"
fi

if [[ "${NEEDS_REBOOT}" == "yes" ]]; then
  echo ""
  echo -e "  ${YELLOW}A reboot is required for the changes to take effect.${RESET}"
  echo "  After rebooting, confirm all three:"
  echo "    lspci -k | grep -A2 -i vga             # Kernel driver in use: amdgpu"
  echo "    cat /sys/module/amdgpu/parameters/dc   # 1"
  echo "    sudo dmesg | grep -i 'display core'    # Display Core initialized"
fi

echo ""
if [[ "${ISSUES_FOUND}" -eq 0 ]]; then
  echo -e "  ${GREEN}No video issues detected.${RESET}"
elif [[ "${ISSUES_FIXED}" -ge "${ISSUES_FOUND}" ]]; then
  echo -e "  ${GREEN}All issues resolved.${RESET}"
else
  echo -e "  ${YELLOW}Some issues could not be fixed automatically.${RESET}"
  echo "  Manual steps to try:"
  echo "    1. Run on the console:   Ctrl+Alt+F1  (DRM output cannot work over SSH)"
  echo "    2. Free the GPU:         sudo systemctl stop display-manager"
  echo "    3. Group membership:     sudo usermod -aG video \$(id -un)"
  echo "    4. Inspect the driver:   lspci -k | grep -A3 -i vga"
  echo "    5. Read the boot log:    sudo dmesg | grep -iE 'amdgpu|radeon|\[drm\]'"
fi
echo ""

[[ "${ISSUES_FIXED}" -ge "${ISSUES_FOUND}" ]] || exit 1
exit 0
