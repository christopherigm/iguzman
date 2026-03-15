#!/usr/bin/env bash
# install.sh — Install dependencies required by play-videos.sh
#
# Installs:
#   - mpv          (media player, DRM/KMS output)
#   - alsa-utils   (aplay, amixer — ALSA audio device listing and control)
#   - libdrm2      (DRM userspace library for KMS video output)
#
# Adds current user to:
#   - video  (access /dev/dri/* DRM devices for KMS output)
#   - audio  (access ALSA sound devices)
#   - render (access /dev/dri/renderD* — required on some distros)
#
# Supported distros: Debian/Ubuntu (apt), Fedora (dnf), RHEL/CentOS (yum), macOS (brew)
#
# Run: bash cli/play-videos/install.sh

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────

RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'; CYAN='\033[36m'

ok()   { printf "  ${BOLD}${GREEN}✓${RESET} %s\n" "$*"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$*"; }
info() { printf "  ${CYAN}→${RESET} %s\n" "$*"; }
warn() { printf "  ${YELLOW}⚠${RESET}  %s\n" "$*"; }
die()  { printf "${RED}ERROR:${RESET} %s\n" "$*" >&2; exit 1; }
step() { printf "\n  ${BOLD}%s${RESET}\n" "$*"; }
line() { printf "  %s\n" "$(printf '─%.0s' {1..54})"; }

# ── Platform helpers ──────────────────────────────────────────────────────────

is_linux() { [[ "$(uname -s)" == "Linux" ]]; }
is_mac()   { [[ "$(uname -s)" == "Darwin" ]]; }
has_apt()  { command -v apt-get &>/dev/null; }
has_dnf()  { command -v dnf &>/dev/null; }
has_yum()  { command -v yum &>/dev/null; }
has_brew() { command -v brew &>/dev/null; }

require_sudo() {
  if ! sudo -n true 2>/dev/null; then
    info "This script needs sudo to install packages and modify group membership."
    sudo -v || die "sudo access is required."
  fi
}

# ── Package installation ──────────────────────────────────────────────────────

apt_install() {
  info "Running: sudo apt-get install -y $*"
  sudo apt-get install -y "$@"
}

dnf_install() {
  info "Running: sudo dnf install -y $*"
  sudo dnf install -y "$@"
}

yum_install() {
  info "Running: sudo yum install -y $*"
  sudo yum install -y "$@"
}

brew_install() {
  info "Running: brew install $*"
  brew install "$@"
}

install_mpv() {
  if command -v mpv &>/dev/null; then
    ok "mpv already installed: $(mpv --version 2>/dev/null | head -1)"
    return
  fi
  info "Installing mpv..."
  if is_mac && has_brew; then
    brew_install mpv
  elif has_apt; then
    apt_install mpv
  elif has_dnf; then
    dnf_install mpv
  elif has_yum; then
    yum_install mpv
  else
    die "No supported package manager found. Install mpv manually: https://mpv.io/installation/"
  fi
  ok "mpv installed: $(mpv --version 2>/dev/null | head -1)"
}

install_alsa_utils() {
  if command -v aplay &>/dev/null; then
    ok "alsa-utils already installed: $(aplay --version 2>/dev/null | head -1)"
    return
  fi
  info "Installing alsa-utils..."
  if is_mac; then
    warn "alsa-utils is Linux-only. On macOS, mpv uses CoreAudio natively — no action needed."
    return
  fi
  if has_apt; then
    apt_install alsa-utils
  elif has_dnf; then
    dnf_install alsa-utils
  elif has_yum; then
    yum_install alsa-utils
  else
    die "No supported package manager found. Install alsa-utils manually."
  fi
  ok "alsa-utils installed: $(aplay --version 2>/dev/null | head -1)"
}

install_libdrm() {
  if is_mac; then
    warn "libdrm is Linux-only — skipping on macOS."
    return
  fi
  # Check if DRM devices exist (kernel support)
  if ls /dev/dri/ &>/dev/null 2>&1; then
    ok "DRM devices found: $(ls /dev/dri/ | tr '\n' ' ')"
  else
    warn "No /dev/dri/ devices found. Ensure your kernel has DRM/KMS support and a compatible GPU is present."
  fi
  # Ensure libdrm2 userspace library is present
  if has_apt; then
    if dpkg -l libdrm2 &>/dev/null 2>&1; then
      ok "libdrm2 already installed"
    else
      info "Installing libdrm2..."
      apt_install libdrm2
      ok "libdrm2 installed"
    fi
  elif has_dnf; then
    if rpm -q libdrm &>/dev/null 2>&1; then
      ok "libdrm already installed"
    else
      info "Installing libdrm..."
      dnf_install libdrm
      ok "libdrm installed"
    fi
  elif has_yum; then
    if rpm -q libdrm &>/dev/null 2>&1; then
      ok "libdrm already installed"
    else
      info "Installing libdrm..."
      yum_install libdrm
      ok "libdrm installed"
    fi
  fi
}

# ── Group membership ──────────────────────────────────────────────────────────

add_to_group() {
  local group="$1" reason="$2"
  if ! getent group "${group}" &>/dev/null; then
    warn "Group '${group}' does not exist on this system — skipping."
    return
  fi
  if id -nG 2>/dev/null | grep -qw "${group}"; then
    ok "User '${USER}' is already in group '${group}'"
  else
    info "Adding '${USER}' to group '${group}' (${reason})..."
    sudo usermod -aG "${group}" "${USER}"
    ok "Added '${USER}' to group '${group}'"
    GROUPS_CHANGED=1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  printf "\n  ${BOLD}${CYAN}┌──────────────────────────────────────────────────────┐${RESET}\n"
  printf   "  ${BOLD}${CYAN}│${RESET}  ${BOLD}%-52s${RESET}${BOLD}${CYAN}│${RESET}\n" "play-videos.sh — Dependency Installer"
  printf   "  ${BOLD}${CYAN}└──────────────────────────────────────────────────────┘${RESET}\n\n"

  is_linux || { warn "This script is designed for Linux. Some steps may not apply on macOS."; }
  require_sudo

  GROUPS_CHANGED=0

  # ── Packages ───────────────────────────────────────────────────────────────
  step "Installing packages"
  line

  if has_apt; then
    info "Updating apt package index..."
    sudo apt-get update -qq
  fi

  install_mpv
  install_alsa_utils
  install_libdrm

  # ── Groups ─────────────────────────────────────────────────────────────────
  step "Configuring user groups"
  line

  if is_linux; then
    add_to_group video  "access /dev/dri/* DRM/KMS devices for video output"
    add_to_group audio  "access ALSA sound devices"
    add_to_group render "access /dev/dri/renderD* GPU render nodes"
  else
    warn "Group configuration is Linux-only — skipping on macOS."
  fi

  # ── DRM device check ───────────────────────────────────────────────────────
  if is_linux; then
    step "DRM device check"
    line
    if [[ -d /dev/dri ]]; then
      local devices
      devices="$(ls /dev/dri/ 2>/dev/null)"
      if [[ -n "${devices}" ]]; then
        ok "DRM devices available:"
        ls -la /dev/dri/ | tail -n +2 | while read -r line_out; do
          printf "      %s\n" "${line_out}"
        done
      else
        warn "/dev/dri/ exists but contains no devices."
        warn "Check that your GPU driver is loaded: lspci -k | grep -A2 VGA"
      fi
    else
      warn "No /dev/dri/ directory found."
      warn "DRM/KMS video output requires a GPU with kernel DRM support."
      warn "For headless servers, ensure a GPU or virtual framebuffer is available."
    fi
  fi

  # ── ALSA device check ──────────────────────────────────────────────────────
  if is_linux && command -v aplay &>/dev/null; then
    step "ALSA device check"
    line
    local alsa_out
    alsa_out="$(aplay -l 2>/dev/null || true)"
    if [[ -n "${alsa_out}" ]]; then
      ok "ALSA devices found:"
      echo "${alsa_out}" | while read -r line_out; do
        printf "      %s\n" "${line_out}"
      done
    else
      warn "No ALSA devices found. Check that your audio hardware is connected and drivers are loaded."
    fi
  fi

  # ── Summary ────────────────────────────────────────────────────────────────
  printf "\n"
  line
  ok "Installation complete."

  if [[ "${GROUPS_CHANGED}" -eq 1 ]]; then
    printf "\n  ${YELLOW}${BOLD}⚠  Group membership changed.${RESET}\n"
    printf "     You must ${BOLD}log out and back in${RESET} (or reboot) for group\n"
    printf "     changes to take effect. To apply without logging out:\n\n"
    printf "       ${CYAN}newgrp video${RESET}\n\n"
    printf "     Then verify with: ${CYAN}id${RESET}\n"
  fi

  printf "\n  Run play-videos.sh:\n"
  printf "    ${CYAN}bash cli/play-videos/play-videos.sh --list-connectors${RESET}\n"
  printf "    ${CYAN}bash cli/play-videos/play-videos.sh --list-audio-devices${RESET}\n\n"
}

main "$@"
