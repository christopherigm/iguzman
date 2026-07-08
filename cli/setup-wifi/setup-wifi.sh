#!/usr/bin/env bash
# setup-wifi.sh
#
# Interactive Wi-Fi setup for Ubuntu servers that have a Wi-Fi card.
#
# What it does:
#   • Re-runs itself with sudo (needs root for rfkill / ip link / netplan).
#   • Auto-detects the networking backend:
#       - NetworkManager (nmcli) when its service is active, or
#       - netplan + wpa_supplicant (Ubuntu Server's default stack) otherwise.
#   • "Fixes" a Wi-Fi card that is present but not usable: unblocks rfkill,
#     turns the radio on, and brings the interface up. Diagnoses a card that
#     is missing a driver / firmware.
#   • Scans for networks, connects (with a persistent, auto-reconnecting
#     profile), and verifies the connection got an IP.
#   • If already connected when re-run, offers to switch to another network
#     or disconnect.
#
# Run: bash cli/setup-wifi/setup-wifi.sh   (or: pnpm setup-wifi)

set -uo pipefail

# ── Re-exec as root ─────────────────────────────────────────────────────────────
# Everything below needs root (rfkill, ip link, netplan apply, /etc/netplan).
# Re-run under sudo before doing anything so the user only types the password once.
if [[ "${EUID}" -ne 0 ]]; then
  echo ""
  echo "  This script needs root privileges. Re-running with sudo…"
  echo "  Este script necesita privilegios de root. Reejecutando con sudo…"
  echo ""
  exec sudo -E bash "$0" "$@"
fi

# ── ANSI Colors ─────────────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
YELLOW='\033[33m'

clr_red()         { printf "${RED}%s${RESET}" "$*"; }
clr_green()       { printf "${GREEN}%s${RESET}" "$*"; }
clr_cyan()        { printf "${CYAN}%s${RESET}" "$*"; }
clr_yellow()      { printf "${YELLOW}%s${RESET}" "$*"; }
clr_bold()        { printf "${BOLD}%s${RESET}" "$*"; }
clr_dim()         { printf "${DIM}%s${RESET}" "$*"; }
clr_bold_cyan()   { printf "${BOLD}${CYAN}%s${RESET}" "$*"; }
clr_bold_green()  { printf "${BOLD}${GREEN}%s${RESET}" "$*"; }
clr_bold_yellow() { printf "${BOLD}${YELLOW}%s${RESET}" "$*"; }
clr_bold_red()    { printf "${BOLD}${RED}%s${RESET}" "$*"; }

# ── Config ──────────────────────────────────────────────────────────────────────
# netplan file this script owns. Kept separate from the user's wired config so we
# can safely rewrite/remove only the Wi-Fi settings.
NETPLAN_FILE="/etc/netplan/90-setup-wifi.yaml"

# ── i18n ────────────────────────────────────────────────────────────────────────
setup_strings() {
  local lang="$1"
  if [[ "${lang}" == "es" ]]; then
    WELCOME="Configurar Wi-Fi — servidores Ubuntu"
    SUBTITLE="Habilita, repara y conecta la tarjeta Wi-Fi del servidor."
    BACKEND_DETECTED="Backend de red detectado"
    BACKEND_NM="NetworkManager (nmcli)"
    BACKEND_NETPLAN="netplan + wpa_supplicant"
    TOOL_MISSING="La herramienta «%s» no está instalada."
    TOOL_INSTALL_PROMPT="¿Instalarla ahora con apt? [s/n]"
    TOOL_INSTALLING="Instalando %s…"
    TOOL_INSTALL_FAILED="No se pudo instalar «%s». Instálala manualmente y vuelve a ejecutar."
    TOOL_INSTALLED="«%s» instalada correctamente."
    TOOL_NEEDED="«%s» es necesaria para continuar."
    NO_WIFI_FOUND="No se detectó ninguna interfaz Wi-Fi."
    NO_WIFI_DIAG="Dispositivos de red detectados por el hardware:"
    NO_WIFI_NONE_HW="No se encontró ningún adaptador Wi-Fi en el bus PCI/USB."
    NO_WIFI_HINT="Puede faltar el controlador o el firmware. Revisa: dmesg | grep -i firmware  ·  sudo apt install linux-firmware  ·  y reconecta el adaptador USB si aplica."
    IFACE_SELECT="Selecciona la interfaz Wi-Fi"
    IFACE_USING="Usando la interfaz"
    FIXING="Preparando la tarjeta Wi-Fi…"
    FIX_HARD_BLOCK="La radio está bloqueada por hardware (interruptor físico o BIOS). No se puede desbloquear por software."
    FIX_SOFT_UNBLOCK="Radio desbloqueada (rfkill)."
    FIX_RADIO_ON="Radio Wi-Fi encendida."
    FIX_IFACE_UP="Interfaz activada."
    FIX_DONE="Tarjeta Wi-Fi lista."
    STATUS_TITLE="Estado actual"
    STATUS_BACKEND="Backend"
    STATUS_IFACE="Interfaz"
    STATUS_SSID="Red (SSID)"
    STATUS_IP="Dirección IP"
    STATUS_SIGNAL="Señal"
    STATUS_NOT_CONNECTED="(sin conexión)"
    MENU_TITLE="¿Qué deseas hacer?"
    MENU_CONNECT="Conectar a una red Wi-Fi"
    MENU_SWITCH="Conectar a otra red Wi-Fi"
    MENU_DISCONNECT="Desconectar la red actual"
    MENU_STATUS="Ver estado"
    MENU_EXIT="Salir"
    NAV_HINT="Flechas para navegar · Enter para elegir"
    SCANNING="Buscando redes Wi-Fi…"
    SCAN_NONE="No se encontraron redes. Puedes escribir el SSID manualmente."
    SELECT_NETWORK="Selecciona una red"
    NET_MANUAL="Escribir el SSID manualmente…"
    NET_RESCAN="Volver a buscar"
    SSID_PROMPT="Nombre de la red (SSID)"
    SSID_REQUIRED="El SSID es obligatorio."
    PASS_PROMPT="Contraseña"
    PASS_HINT="(deja en blanco si la red es abierta)"
    CONNECTING_TO="Conectando a"
    APPLYING="Aplicando configuración de red…"
    VERIFYING="Verificando la conexión…"
    CONNECT_OK="Conectado a «%s»."
    CONNECT_OK_IP="Dirección IP: %s"
    CONNECT_NO_IP="Asociado a «%s» pero aún sin IP. Puede tardar unos segundos o la contraseña puede ser incorrecta."
    CONNECT_FAIL="No se pudo conectar a «%s». Verifica la contraseña y la cobertura."
    DISCONNECT_CONFIRM="¿Desconectar de «%s»? [s/n]"
    DISCONNECTING="Desconectando…"
    DISCONNECT_OK="Desconectado."
    DISCONNECT_FAIL="No se pudo desconectar."
    DISCONNECT_NETPLAN_WARN="La red no fue configurada por este script; se bajó la interfaz, pero puede reconectarse al reiniciar."
    CANCELLED="Cancelado."
    BYE="👋"
    YES_CHARS="sy"
  else
    WELCOME="Wi-Fi setup — Ubuntu servers"
    SUBTITLE="Enable, fix and connect the server's Wi-Fi card."
    BACKEND_DETECTED="Detected networking backend"
    BACKEND_NM="NetworkManager (nmcli)"
    BACKEND_NETPLAN="netplan + wpa_supplicant"
    TOOL_MISSING="The tool “%s” is not installed."
    TOOL_INSTALL_PROMPT="Install it now with apt? [y/n]"
    TOOL_INSTALLING="Installing %s…"
    TOOL_INSTALL_FAILED="Could not install “%s”. Install it manually and re-run."
    TOOL_INSTALLED="“%s” installed successfully."
    TOOL_NEEDED="“%s” is required to continue."
    NO_WIFI_FOUND="No Wi-Fi interface detected."
    NO_WIFI_DIAG="Network devices seen by the hardware:"
    NO_WIFI_NONE_HW="No Wi-Fi adapter found on the PCI/USB bus."
    NO_WIFI_HINT="A driver or firmware may be missing. Check: dmesg | grep -i firmware  ·  sudo apt install linux-firmware  ·  and re-plug the USB adapter if applicable."
    IFACE_SELECT="Select the Wi-Fi interface"
    IFACE_USING="Using interface"
    FIXING="Preparing the Wi-Fi card…"
    FIX_HARD_BLOCK="The radio is hardware-blocked (physical switch or BIOS). It cannot be unblocked from software."
    FIX_SOFT_UNBLOCK="Radio unblocked (rfkill)."
    FIX_RADIO_ON="Wi-Fi radio turned on."
    FIX_IFACE_UP="Interface brought up."
    FIX_DONE="Wi-Fi card ready."
    STATUS_TITLE="Current status"
    STATUS_BACKEND="Backend"
    STATUS_IFACE="Interface"
    STATUS_SSID="Network (SSID)"
    STATUS_IP="IP address"
    STATUS_SIGNAL="Signal"
    STATUS_NOT_CONNECTED="(not connected)"
    MENU_TITLE="What would you like to do?"
    MENU_CONNECT="Connect to a Wi-Fi network"
    MENU_SWITCH="Connect to another Wi-Fi network"
    MENU_DISCONNECT="Disconnect the current network"
    MENU_STATUS="Show status"
    MENU_EXIT="Exit"
    NAV_HINT="Arrow keys to navigate · Enter to select"
    SCANNING="Scanning for Wi-Fi networks…"
    SCAN_NONE="No networks found. You can type the SSID manually."
    SELECT_NETWORK="Select a network"
    NET_MANUAL="Type the SSID manually…"
    NET_RESCAN="Scan again"
    SSID_PROMPT="Network name (SSID)"
    SSID_REQUIRED="SSID is required."
    PASS_PROMPT="Password"
    PASS_HINT="(leave blank if the network is open)"
    CONNECTING_TO="Connecting to"
    APPLYING="Applying network configuration…"
    VERIFYING="Verifying the connection…"
    CONNECT_OK="Connected to “%s”."
    CONNECT_OK_IP="IP address: %s"
    CONNECT_NO_IP="Associated with “%s” but no IP yet. It may take a few seconds, or the password may be wrong."
    CONNECT_FAIL="Could not connect to “%s”. Check the password and signal."
    DISCONNECT_CONFIRM="Disconnect from “%s”? [y/n]"
    DISCONNECTING="Disconnecting…"
    DISCONNECT_OK="Disconnected."
    DISCONNECT_FAIL="Could not disconnect."
    DISCONNECT_NETPLAN_WARN="This network was not configured by this script; the interface was brought down but it may reconnect on reboot."
    CANCELLED="Cancelled."
    BYE="👋"
    YES_CHARS="y"
  fi
}

# ── UI helpers ──────────────────────────────────────────────────────────────────
print_header() {
  local line
  line="$(printf '─%.0s' {1..58})"
  echo ""
  echo "  $(clr_bold_cyan "┌${line}┐")"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_bold "${WELCOME}")" "$(clr_bold_cyan '│')"
  printf "  %s  %-56s%s\n" "$(clr_bold_cyan '│')" "$(clr_dim "${SUBTITLE}")" "$(clr_bold_cyan '│')"
  echo "  $(clr_bold_cyan "└${line}┘")"
  echo ""
}

pad_right() { printf "%-${2}s" "${1}"; }
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Single-select list. Input: MENU_ITEMS[] ; Output: MENU_SELECTED (index).
interactive_select() {
  local num="${#MENU_ITEMS[@]}"
  local cursor=0

  render_select() {
    local j
    for j in "${!MENU_ITEMS[@]}"; do
      local lbl; lbl="$(pad_right "${MENU_ITEMS[$j]}" 54)"
      local ptr label_str
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
    if [[ "${key}" == $'\r' || "${key}" == $'\n' || "${key}" == '' ]]; then break; fi
    if [[ "${key}" == $'\x03' || "${key}" == $'\x04' ]]; then printf '\033[?25h'; echo ""; exit 0; fi
  done
  printf '\033[?25h'; echo ""
  MENU_SELECTED="${cursor}"
}

prompt_visible() {
  local label="$1" default="${2:-}"
  if [[ -n "${default}" ]]; then
    printf "  %s (%s): " "$(clr_bold "${label}")" "$(clr_dim "${default}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r val </dev/tty || true
  if [[ -z "${val}" && -n "${default}" ]]; then val="${default}"; fi
  printf '%s' "${val}"
}

prompt_secret() {
  local label="$1" hint="${2:-}"
  if [[ -n "${hint}" ]]; then
    printf "  %s %s: " "$(clr_bold "${label}")" "$(clr_dim "${hint}")" >/dev/tty
  else
    printf "  %s: " "$(clr_bold "${label}")" >/dev/tty
  fi
  local val
  IFS= read -r -s val </dev/tty || true
  echo "" >/dev/tty
  printf '%s' "${val}"
}

confirm() {
  local prompt="$1"
  local ans
  printf "  %s " "$(clr_bold "${prompt}")" >/dev/tty
  IFS= read -r ans </dev/tty || true
  ans="$(lc "${ans}")"
  [[ -n "${ans}" && "${YES_CHARS}" == *"${ans:0:1}"* ]]
}

# ── Tool install ────────────────────────────────────────────────────────────────
# ensure_tool <binary> [apt-package]  — returns 0 if the binary is available.
ensure_tool() {
  local bin="$1" pkg="${2:-$1}"
  command -v "${bin}" &>/dev/null && return 0

  printf "  %s " "$(clr_bold_yellow '!')"; printf "${TOOL_MISSING}\n" "${bin}"
  if ! confirm "${TOOL_INSTALL_PROMPT}"; then
    printf "  "; printf "$(clr_dim "${TOOL_NEEDED}")\n" "${bin}"
    return 1
  fi
  if command -v apt-get &>/dev/null; then
    printf "  "; printf "$(clr_dim "${TOOL_INSTALLING}")\n" "${pkg}"
    apt-get update -y &>/dev/null || true
    apt-get install -y "${pkg}" &>/dev/null || true
  fi
  if ! command -v "${bin}" &>/dev/null; then
    printf "  %s " "$(clr_bold_red '✗')"; printf "${TOOL_INSTALL_FAILED}\n" "${bin}"
    return 1
  fi
  printf "  %s " "$(clr_bold_green '✓')"; printf "${TOOL_INSTALLED}\n" "${bin}"
}

# ── Backend detection ───────────────────────────────────────────────────────────
detect_backend() {
  if command -v nmcli &>/dev/null && systemctl is-active --quiet NetworkManager 2>/dev/null; then
    BACKEND="nmcli"
  else
    BACKEND="netplan"
  fi
}

backend_label() {
  [[ "${BACKEND}" == "nmcli" ]] && printf '%s' "${BACKEND_NM}" || printf '%s' "${BACKEND_NETPLAN}"
}

# ── Wi-Fi interface detection ───────────────────────────────────────────────────
# Fills WIFI_IFACES[] with every wireless interface the kernel exposes.
detect_wifi_ifaces() {
  WIFI_IFACES=()
  local d name
  for d in /sys/class/net/*; do
    [[ -e "${d}" ]] || continue
    name="$(basename "${d}")"
    if [[ -d "${d}/wireless" || -e "${d}/phy80211" ]]; then
      WIFI_IFACES+=("${name}")
    fi
  done
}

# Prints hardware-level diagnostics when no wireless interface exists.
diagnose_no_wifi() {
  printf "  %s %s\n\n" "$(clr_bold_red '✗')" "${NO_WIFI_FOUND}"
  printf "  %s\n" "$(clr_bold "${NO_WIFI_DIAG}")"
  local found=""
  if command -v lspci &>/dev/null; then
    found="$(lspci 2>/dev/null | grep -iE 'network|wireless|wi-fi|wlan|802\.11' || true)"
  fi
  local usb=""
  if command -v lsusb &>/dev/null; then
    usb="$(lsusb 2>/dev/null | grep -iE 'wireless|wlan|wi-fi|802\.11|network' || true)"
  fi
  if [[ -n "${found}" || -n "${usb}" ]]; then
    [[ -n "${found}" ]] && printf '%s\n' "${found}" | sed 's/^/     /'
    [[ -n "${usb}" ]] && printf '%s\n' "${usb}" | sed 's/^/     /'
  else
    printf "     %s\n" "$(clr_dim "${NO_WIFI_NONE_HW}")"
  fi
  echo ""
  printf "  %s\n\n" "$(clr_yellow "${NO_WIFI_HINT}")"
}

# ── Fix phase ───────────────────────────────────────────────────────────────────
# Unblock rfkill, turn the radio on, and bring the interface up.
fix_wifi() {
  printf "  %s\n" "$(clr_dim "${FIXING}")"

  # rfkill: unblock a soft block; warn (can't fix) on a hard block.
  if ensure_tool rfkill rfkill; then
    if rfkill list 2>/dev/null | grep -qi "Hard blocked: yes"; then
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${FIX_HARD_BLOCK}"
    fi
    if rfkill list 2>/dev/null | grep -qi "Soft blocked: yes"; then
      rfkill unblock wifi 2>/dev/null || rfkill unblock all 2>/dev/null || true
      printf "  %s %s\n" "$(clr_bold_green '✓')" "${FIX_SOFT_UNBLOCK}"
    fi
  fi

  # NetworkManager owns the radio switch in nmcli mode.
  if [[ "${BACKEND}" == "nmcli" ]]; then
    nmcli radio wifi on 2>/dev/null || true
    printf "  %s %s\n" "$(clr_bold_green '✓')" "${FIX_RADIO_ON}"
  fi

  # Bring the link up so scanning works.
  ip link set "${IFACE}" up 2>/dev/null || true
  printf "  %s %s\n" "$(clr_bold_green '✓')" "${FIX_IFACE_UP}"
  printf "  %s %s\n" "$(clr_bold_green '✓')" "${FIX_DONE}"
}

# ── Status ──────────────────────────────────────────────────────────────────────
# Current associated SSID for IFACE, or empty string if not connected.
current_ssid() {
  local ssid=""
  if [[ "${BACKEND}" == "nmcli" ]]; then
    ssid="$(nmcli -t -f GENERAL.CONNECTION device show "${IFACE}" 2>/dev/null | cut -d: -f2- || true)"
    [[ "${ssid}" == "--" ]] && ssid=""
  fi
  # Fall back to iw (also the primary source in netplan mode).
  if [[ -z "${ssid}" ]] && command -v iw &>/dev/null; then
    ssid="$(iw dev "${IFACE}" link 2>/dev/null | sed -n 's/^[[:space:]]*SSID: //p' | head -1 || true)"
  fi
  printf '%s' "${ssid}"
}

current_ip() {
  ip -4 -o addr show dev "${IFACE}" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true
}

current_signal() {
  command -v iw &>/dev/null || { printf ''; return; }
  iw dev "${IFACE}" link 2>/dev/null | sed -n 's/^[[:space:]]*signal: //p' | head -1 || true
}

show_status() {
  local ssid ip sig
  ssid="$(current_ssid)"; ip="$(current_ip)"; sig="$(current_signal)"
  echo ""
  printf "  %s\n" "$(clr_bold_cyan "${STATUS_TITLE}")"
  printf "    %-16s %s\n" "${STATUS_BACKEND}:" "$(backend_label)"
  printf "    %-16s %s\n" "${STATUS_IFACE}:"   "${IFACE}"
  if [[ -n "${ssid}" ]]; then
    printf "    %-16s %s\n" "${STATUS_SSID}:" "$(clr_green "${ssid}")"
  else
    printf "    %-16s %s\n" "${STATUS_SSID}:" "$(clr_dim "${STATUS_NOT_CONNECTED}")"
  fi
  [[ -n "${ip}" ]]  && printf "    %-16s %s\n" "${STATUS_IP}:"     "${ip}"
  [[ -n "${sig}" ]] && printf "    %-16s %s\n" "${STATUS_SIGNAL}:" "${sig}"
  echo ""
}

# ── Scan ────────────────────────────────────────────────────────────────────────
# Fills SSID_LIST[] with unique, non-hidden SSIDs in range.
scan_networks() {
  SSID_LIST=()
  printf "  %s\n" "$(clr_dim "${SCANNING}")"
  local raw=""
  if [[ "${BACKEND}" == "nmcli" ]]; then
    nmcli device wifi rescan ifname "${IFACE}" &>/dev/null || true
    raw="$(nmcli -t -f SSID device wifi list ifname "${IFACE}" 2>/dev/null | sed 's/\\:/:/g' || true)"
  else
    raw="$(iw dev "${IFACE}" scan 2>/dev/null | sed -n 's/^[[:space:]]*SSID: //p' || true)"
  fi
  # Drop blanks (hidden networks) and duplicates, preserving order.
  local line
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    local exists=0 s
    for s in "${SSID_LIST[@]:-}"; do [[ "${s}" == "${line}" ]] && exists=1 && break; done
    [[ "${exists}" -eq 0 ]] && SSID_LIST+=("${line}")
  done <<< "${raw}"
}

# ── Connect ─────────────────────────────────────────────────────────────────────
connect_nmcli() {
  local ssid="$1" pass="$2"
  if [[ -n "${pass}" ]]; then
    nmcli device wifi connect "${ssid}" password "${pass}" ifname "${IFACE}" &>/dev/null
  else
    nmcli device wifi connect "${ssid}" ifname "${IFACE}" &>/dev/null
  fi
}

connect_netplan() {
  local ssid="$1" pass="$2"
  ensure_tool wpa_supplicant wpasupplicant || return 1
  # Escape backslashes and double quotes for the YAML double-quoted scalars.
  local ssid_esc pass_esc
  ssid_esc="${ssid//\\/\\\\}"; ssid_esc="${ssid_esc//\"/\\\"}"
  pass_esc="${pass//\\/\\\\}"; pass_esc="${pass_esc//\"/\\\"}"

  umask 077
  {
    echo "# Managed by cli/setup-wifi/setup-wifi.sh — do not edit by hand."
    echo "network:"
    echo "  version: 2"
    echo "  renderer: networkd"
    echo "  wifis:"
    echo "    ${IFACE}:"
    echo "      dhcp4: true"
    echo "      access-points:"
    if [[ -n "${pass}" ]]; then
      echo "        \"${ssid_esc}\":"
      echo "          password: \"${pass_esc}\""
    else
      echo "        \"${ssid_esc}\": {}"
    fi
  } > "${NETPLAN_FILE}"
  chmod 600 "${NETPLAN_FILE}"

  printf "  %s\n" "$(clr_dim "${APPLYING}")"
  netplan apply &>/dev/null || return 1
}

# Poll for up to ~15s for an associated SSID + IP, then report.
verify_connection() {
  local want="$1" i ssid ip
  printf "  %s\n" "$(clr_dim "${VERIFYING}")"
  for i in $(seq 1 15); do
    ssid="$(current_ssid)"; ip="$(current_ip)"
    if [[ -n "${ssid}" && -n "${ip}" ]]; then
      printf "  %s " "$(clr_bold_green '✓')"; printf "${CONNECT_OK}\n" "${ssid}"
      printf "     "; printf "$(clr_dim "${CONNECT_OK_IP}")\n" "${ip}"
      return 0
    fi
    sleep 1
  done
  ssid="$(current_ssid)"
  if [[ -n "${ssid}" ]]; then
    printf "  %s " "$(clr_bold_yellow '⚠')"; printf "${CONNECT_NO_IP}\n" "${ssid}"
    return 0
  fi
  printf "  %s " "$(clr_bold_red '✗')"; printf "${CONNECT_FAIL}\n" "${want}"
  return 1
}

do_connect() {
  local ssid=""
  while true; do
    scan_networks
    if [[ ${#SSID_LIST[@]} -eq 0 ]]; then
      printf "  %s\n" "$(clr_yellow "${SCAN_NONE}")"
    fi
    MENU_ITEMS=("${SSID_LIST[@]:-}")
    # Filter a possible single empty element when SSID_LIST is empty.
    [[ ${#SSID_LIST[@]} -eq 0 ]] && MENU_ITEMS=()
    MENU_ITEMS+=("${NET_MANUAL}" "${NET_RESCAN}")
    echo ""
    printf "  %s\n\n" "$(clr_bold_cyan "${SELECT_NETWORK}") $(clr_dim "· ${NAV_HINT}")"
    interactive_select
    local manual_idx=$(( ${#MENU_ITEMS[@]} - 2 ))
    local rescan_idx=$(( ${#MENU_ITEMS[@]} - 1 ))
    if [[ ${MENU_SELECTED} -eq ${rescan_idx} ]]; then
      continue
    elif [[ ${MENU_SELECTED} -eq ${manual_idx} ]]; then
      ssid="$(prompt_visible "${SSID_PROMPT}")"
    else
      ssid="${MENU_ITEMS[$MENU_SELECTED]}"
    fi
    break
  done

  if [[ -z "${ssid}" ]]; then printf "  %s\n" "$(clr_red "${SSID_REQUIRED}")"; return; fi

  local pass
  pass="$(prompt_secret "${PASS_PROMPT}" "${PASS_HINT}")"

  echo ""
  printf "  %s %s…\n" "$(clr_dim "${CONNECTING_TO}")" "$(clr_bold "${ssid}")"

  local ok=1
  if [[ "${BACKEND}" == "nmcli" ]]; then
    connect_nmcli "${ssid}" "${pass}" || ok=0
  else
    connect_netplan "${ssid}" "${pass}" || ok=0
  fi

  if [[ "${ok}" -eq 0 ]]; then
    printf "  %s " "$(clr_bold_red '✗')"; printf "${CONNECT_FAIL}\n" "${ssid}"
    return
  fi
  verify_connection "${ssid}" || true
}

do_disconnect() {
  local ssid; ssid="$(current_ssid)"
  if ! confirm "$(printf "${DISCONNECT_CONFIRM}" "${ssid}")"; then
    printf "  %s\n" "$(clr_dim "${CANCELLED}")"; return
  fi
  printf "  %s\n" "$(clr_dim "${DISCONNECTING}")"
  if [[ "${BACKEND}" == "nmcli" ]]; then
    if nmcli device disconnect "${IFACE}" &>/dev/null; then
      printf "  %s %s\n" "$(clr_bold_green '✓')" "${DISCONNECT_OK}"
    else
      printf "  %s %s\n" "$(clr_bold_red '✗')" "${DISCONNECT_FAIL}"
    fi
  else
    if [[ -f "${NETPLAN_FILE}" ]]; then
      rm -f "${NETPLAN_FILE}"
      netplan apply &>/dev/null || true
      ip link set "${IFACE}" down 2>/dev/null || true
      ip link set "${IFACE}" up 2>/dev/null || true
      printf "  %s %s\n" "$(clr_bold_green '✓')" "${DISCONNECT_OK}"
    else
      ip link set "${IFACE}" down 2>/dev/null || true
      ip link set "${IFACE}" up 2>/dev/null || true
      printf "  %s %s\n" "$(clr_bold_yellow '⚠')" "${DISCONNECT_NETPLAN_WARN}"
    fi
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────────
main() {
  printf "  %s" "Select language / Selecciona idioma [en/es] (en): "
  local raw_lang; read -r raw_lang || true
  local lang="en"
  [[ "$(lc "${raw_lang}")" == es* ]] && lang="es"
  setup_strings "${lang}"

  clear
  print_header

  detect_backend
  printf "  %s %s\n" "$(clr_dim "${BACKEND_DETECTED}:")" "$(clr_bold "$(backend_label)")"

  # Find a Wi-Fi interface. Try an rfkill unblock first in case the radio is the
  # only thing hiding it, then diagnose the hardware if still nothing.
  detect_wifi_ifaces
  if [[ ${#WIFI_IFACES[@]} -eq 0 ]]; then
    command -v rfkill &>/dev/null && rfkill unblock wifi 2>/dev/null || true
    detect_wifi_ifaces
  fi
  if [[ ${#WIFI_IFACES[@]} -eq 0 ]]; then
    echo ""
    diagnose_no_wifi
    exit 1
  fi

  # Pick the interface.
  if [[ ${#WIFI_IFACES[@]} -eq 1 ]]; then
    IFACE="${WIFI_IFACES[0]}"
  else
    MENU_ITEMS=("${WIFI_IFACES[@]}")
    echo ""
    printf "  %s\n\n" "$(clr_bold_cyan "${IFACE_SELECT}") $(clr_dim "· ${NAV_HINT}")"
    interactive_select
    IFACE="${WIFI_IFACES[$MENU_SELECTED]}"
  fi
  printf "  %s %s\n" "$(clr_dim "${IFACE_USING}:")" "$(clr_bold "${IFACE}")"

  # netplan mode relies on iw for scanning and status.
  [[ "${BACKEND}" == "netplan" ]] && { ensure_tool iw iw || true; }

  echo ""
  fix_wifi

  while true; do
    local cur; cur="$(current_ssid)"
    echo ""
    if [[ -n "${cur}" ]]; then
      printf "  %s %s\n" "$(clr_bold_green '✓')" "$(printf "${CONNECT_OK}" "${cur}")"
    fi
    printf "  %s\n\n" "$(clr_bold_cyan "${MENU_TITLE}")"

    MENU_ITEMS=(); local -a actions=()
    if [[ -n "${cur}" ]]; then
      MENU_ITEMS+=("${MENU_SWITCH}");     actions+=("connect")
      MENU_ITEMS+=("${MENU_DISCONNECT}"); actions+=("disconnect")
    else
      MENU_ITEMS+=("${MENU_CONNECT}");    actions+=("connect")
    fi
    MENU_ITEMS+=("${MENU_STATUS}"); actions+=("status")
    MENU_ITEMS+=("${MENU_EXIT}");   actions+=("exit")

    printf "  %s\n\n" "$(clr_dim "${NAV_HINT}")"
    interactive_select
    case "${actions[$MENU_SELECTED]}" in
      connect)    do_connect ;;
      disconnect) do_disconnect ;;
      status)     show_status ;;
      exit)       printf "  %s\n\n" "$(clr_dim "${BYE}")"; exit 0 ;;
    esac
  done
}

main "$@"
