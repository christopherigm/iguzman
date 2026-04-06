#!/usr/bin/env bash
# server-audit.sh
#
# Security & performance audit for Ubuntu Server running:
#   MicroK8s (Kubernetes) · Plex Media Server · Samba
#
# Checks: UFW firewall, open ports, user accounts, SSH hardening,
#         failed logins, zombie/suspicious processes, resource usage
#         (CPU / memory / disk), pending updates, and service health.
#
# Output: colour-coded terminal report + severity-sorted summary
#         with actionable mitigations for every finding.
#
# Usage:
#   sudo bash cli/server-audit/server-audit.sh
#   sudo bash cli/server-audit/server-audit.sh --no-color

# Do NOT set -e: diagnostic probes may intentionally return non-zero.
set -uo pipefail

# ── Arguments ─────────────────────────────────────────────────────────────────

USE_COLOR=true
for _arg in "$@"; do
  [[ "${_arg}" == "--no-color" ]] && USE_COLOR=false
done

# ── Colors ────────────────────────────────────────────────────────────────────

if ${USE_COLOR}; then
  R='\033[0m'   B='\033[1m'   D='\033[2m'
  GRN='\033[0;32m'  RED='\033[0;31m'  YEL='\033[0;33m'
  CYN='\033[0;36m'  BLU='\033[0;34m'
  BGRN='\033[1;32m' BRED='\033[1;31m' BYEL='\033[1;33m' BCYN='\033[1;36m'
else
  R='' B='' D='' GRN='' RED='' YEL='' CYN='' BLU='' BGRN='' BRED='' BYEL='' BCYN=''
fi

# ── Output helpers ────────────────────────────────────────────────────────────

ok()   { printf "  ${BGRN}✓${R}  %s\n"  "$*"; }
fail() { printf "  ${RED}✗${R}  %s\n"  "$*"; }
info() { printf "  ${CYN}→${R}  %s\n"  "$*"; }
warn() { printf "  ${BYEL}⚠${R}   %s\n" "$*"; }
crit() { printf "  ${BRED}!!${R} %s\n" "$*"; }
sub()  { printf "  ${D}   %s${R}\n"    "$*"; }

step() {
  printf "\n${BCYN}▶ %s${R}\n" "$*"
  printf "${D}$(printf '─%.0s' {1..64})${R}\n"
}

hr() { printf "${D}$(printf '─%.0s' {1..64})${R}\n"; }
indent() { sed 's/^/     /'; }

# ── Findings store ────────────────────────────────────────────────────────────
# Each entry: "SEVERITY|CATEGORY|MESSAGE|MITIGATION"

declare -a FINDINGS=()

add_finding() {
  # add_finding SEVERITY CATEGORY MESSAGE MITIGATION
  FINDINGS+=("${1}|${2}|${3}|${4}")
}

count_sev() {
  local sev="$1" count=0
  for f in "${FINDINGS[@]+"${FINDINGS[@]}"}"; do
    [[ "${f%%|*}" == "${sev}" ]] && (( count++ )) || true
  done
  echo "${count}"
}

# ── Root check ────────────────────────────────────────────────────────────────

if [[ "${EUID}" -ne 0 ]]; then
  printf "\n  ${RED}Error:${R} Run with sudo.\n"
  printf "  ${CYN}sudo bash cli/server-audit/server-audit.sh${R}\n\n"
  exit 1
fi

# ── Known-safe listening ports for this server setup ─────────────────────────

declare -A KNOWN_PORTS=(
  [22]="SSH"         [80]="HTTP"        [443]="HTTPS"
  # Samba
  [139]="Samba/NetBIOS"  [445]="Samba/SMB"
  # Plex
  [32400]="Plex"     [3005]="Plex-Companion"  [8324]="Plex-Companion"  [32469]="Plex-DLNA"
  # MicroK8s / Kubernetes
  [16443]="k8s-API"  [10250]="kubelet"    [10255]="kubelet-ro"
  [10256]="kube-proxy" [10248]="kubelet-healthz" [10249]="kube-proxy-metrics"
  [10257]="k8s-ctrl-mgr" [10259]="k8s-scheduler"
  [2379]="etcd-client" [2380]="etcd-peer"
  # CoreDNS / NTP / system
  [53]="DNS"         [123]="NTP"
  [111]="rpcbind"    [631]="CUPS"
  # MicroK8s registry (optional addon)
  [5000]="registry"  [32000]="microk8s-registry"
)

is_known_port() {
  local p="$1"
  [[ -n "${KNOWN_PORTS[$p]+x}" ]] && return 0
  (( p >= 30000 && p <= 32767 )) && return 0   # k8s NodePort range
  return 1
}

is_loopback_addr() {
  local addr="$1"
  [[ "${addr}" == 127.* || "${addr}" == "[::1]"* ]] && return 0
  return 1
}

# ────────────────────────────────────────────────────────────────────────────
# Port helper — called from check_open_ports for each protocol
# ────────────────────────────────────────────────────────────────────────────

_audit_ports_proto() {
  local proto="$1"   # "tcp" | "udp"
  local ss_flag="$2" # "t"   | "u"
  local unknown_ref="$3"

  while IFS= read -r line; do
    [[ "${line}" == State* ]] && continue
    # TCP requires LISTEN state; UDP sockets are UNCONN
    if [[ "${proto}" == "tcp" ]]; then
      echo "${line}" | grep -q "LISTEN" || continue
    fi

    local laddr port process svc
    laddr="$(awk '{print $4}' <<< "${line}")"
    port="$(awk -F: '{print $NF}' <<< "${laddr}")"
    [[ "${port}" =~ ^[0-9]+$ ]] || continue

    process="$(grep -oP '(?<=users:\(\(")[^"]+' <<< "${line}" 2>/dev/null | head -1 || true)"
    [[ -z "${process}" ]] && process="kernel"

    if is_loopback_addr "${laddr}"; then
      sub "${proto^^} ${laddr}  [${process}]  (loopback)"
    elif is_known_port "${port}"; then
      if (( port >= 30000 && port <= 32767 )); then
        svc="k8s-NodePort"
      else
        svc="${KNOWN_PORTS[$port]}"
      fi
      ok "${proto^^} ${laddr}  [${process}]  ${CYN}${svc}${R}"
    else
      crit "${proto^^} ${laddr}  [${process}]  ${BRED}UNEXPECTED${R}"
      add_finding "MEDIUM" "Open Ports" \
        "Unexpected ${proto^^} port ${port} open (process: ${process}, addr: ${laddr})" \
        "Identify: ss -${ss_flag}lnp | grep :${port} — if unneeded: ufw deny ${port}/${proto} && systemctl stop <service>"
      # Increment caller's counter via nameref (bash 4.3+)
      printf -v "${unknown_ref}" '%d' "$(( ${!unknown_ref} + 1 ))" 2>/dev/null || true
    fi
  done < <(ss -"${ss_flag}"lnp 2>/dev/null | tail -n +2 || true)
}

# ════════════════════════════════════════════════════════════════════════════
# CHECK FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════

# ── 1. System Info ───────────────────────────────────────────────────────────

check_system_info() {
  step "System Information"
  info "Hostname  : $(hostname -f 2>/dev/null || hostname)"
  info "OS        : $(grep -oP '(?<=PRETTY_NAME=")[^"]+' /etc/os-release 2>/dev/null || uname -o)"
  info "Kernel    : $(uname -r)"
  info "Arch      : $(uname -m)"
  info "Uptime    : $(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | cut -d, -f1)"
  info "Date/Time : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  info "CPUs      : $(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo '?')"
  info "Load avg  : $(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null || echo 'unavailable')"
}

# ── 2. Firewall ──────────────────────────────────────────────────────────────

check_firewall() {
  step "Firewall (UFW)"

  if ! command -v ufw &>/dev/null; then
    crit "UFW not installed — no host-based firewall"
    add_finding "HIGH" "Firewall" "UFW is not installed — no host-level firewall detected" \
      "apt install ufw && ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw enable"
    return
  fi

  local ufw_out
  ufw_out="$(ufw status 2>/dev/null)"

  if echo "${ufw_out}" | grep -q "Status: active"; then
    ok "UFW is active"
    echo "${ufw_out}" | grep -v "^Status" | grep -v "^To\|^--" | grep -v "^$" | head -20 | indent
  else
    crit "UFW installed but INACTIVE"
    add_finding "HIGH" "Firewall" "UFW is installed but not enabled — server has no host firewall" \
      "ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw allow 445 && ufw allow 32400 && ufw enable"

    local ipt_count
    ipt_count="$(iptables -L INPUT 2>/dev/null | grep -vc "^Chain\|^target\|^$" || echo 0)"
    (( ipt_count > 1 )) && info "iptables has ${ipt_count} INPUT rules (possible manual firewall in place)"
  fi
}

# ── 3. Open Ports ────────────────────────────────────────────────────────────

check_open_ports() {
  step "Open / Listening Ports"

  if ! command -v ss &>/dev/null; then
    warn "ss not found — install iproute2"
    add_finding "LOW" "Open Ports" "ss tool unavailable — port scan skipped" "apt install iproute2"
    return
  fi

  local unknown=0

  info "TCP:"
  _audit_ports_proto "tcp" "t" "unknown"

  printf "\n"
  info "UDP (bound sockets):"
  _audit_ports_proto "udp" "u" "unknown"

  printf "\n"
  if (( unknown == 0 )); then
    ok "No unexpected listening ports"
  else
    warn "${unknown} unexpected port(s) flagged — see findings"
  fi
}

# ── 4. User Accounts ─────────────────────────────────────────────────────────

check_users() {
  step "User Accounts"

  # UID 0 accounts other than root
  local uid0_extra
  uid0_extra="$(awk -F: '$3 == 0 && $1 != "root" {print $1}' /etc/passwd 2>/dev/null || true)"
  if [[ -n "${uid0_extra}" ]]; then
    crit "Non-root account(s) with UID 0: ${uid0_extra}"
    add_finding "CRITICAL" "Users" "UID-0 (root-equivalent) account(s) found: ${uid0_extra}" \
      "userdel ${uid0_extra}  — or assign a normal UID: usermod -u <uid> ${uid0_extra}"
  else
    ok "Only root has UID 0"
  fi

  # Accounts with empty passwords (interactive shells only)
  local empty_pw
  empty_pw="$(awk -F: '$2 == "" && $7 !~ /nologin|false/ {print $1}' /etc/shadow 2>/dev/null || true)"
  if [[ -n "${empty_pw}" ]]; then
    crit "Login account(s) with empty password: ${empty_pw}"
    add_finding "CRITICAL" "Users" "Interactive account(s) with no password set: ${empty_pw}" \
      "Set a password: passwd <user>  — or lock: passwd -l <user>"
  else
    ok "No interactive accounts with empty passwords"
  fi

  # Sudoers
  info "Sudo-capable users:"
  {
    grep -rP '^\s*\S+\s+ALL' /etc/sudoers /etc/sudoers.d/ 2>/dev/null \
      | grep -v '^#' | awk '{print "  sudoers:", $1}' || true
    getent group sudo  2>/dev/null | awk -F: '{print $4}' | tr ',' '\n' \
      | grep -v '^$' | awk '{print "  sudo group:", $1}' || true
    getent group admin 2>/dev/null | awk -F: '{print $4}' | tr ',' '\n' \
      | grep -v '^$' | awk '{print "  admin group:", $1}' || true
  } | sort -u | indent

  # Accounts with login shells
  info "Accounts with login shells (UID ≥ 1000):"
  awk -F: '$3 >= 1000 && $7 !~ /nologin|false/ && $1 != "nobody" {print "  "$1"  ("$7")"}' \
    /etc/passwd 2>/dev/null | indent || true

  # Last 5 logins
  info "Last 5 logins:"
  last -n 5 2>/dev/null | head -5 | indent || true
}

# ── 5. SSH Hardening ─────────────────────────────────────────────────────────

check_ssh() {
  step "SSH Configuration"

  local sshd_cfg="/etc/ssh/sshd_config"
  if [[ ! -f "${sshd_cfg}" ]]; then
    info "sshd_config not found — SSH may not be installed"
    return
  fi

  # Read effective value: main config + drop-ins
  _ssh_val() {
    grep -rihP "^\s*${1}\s" "${sshd_cfg}" /etc/ssh/sshd_config.d/ 2>/dev/null \
      | tail -1 | awk '{print $2}' | tr '[:upper:]' '[:lower:]'
  }

  local permit_root pass_auth x11 max_tries port
  permit_root="$(_ssh_val PermitRootLogin)";  [[ -z "${permit_root}" ]] && permit_root="yes"
  pass_auth="$(_ssh_val PasswordAuthentication)"; [[ -z "${pass_auth}" ]] && pass_auth="yes"
  x11="$(_ssh_val X11Forwarding)";            [[ -z "${x11}" ]] && x11="no"
  max_tries="$(_ssh_val MaxAuthTries)";       [[ -z "${max_tries}" ]] && max_tries="6"
  port="$(_ssh_val Port)";                    [[ -z "${port}" ]] && port="22"

  # PermitRootLogin
  case "${permit_root}" in
    "no") ok "PermitRootLogin: no" ;;
    "without-password"|"prohibit-password")
      warn "PermitRootLogin ${permit_root} — root key-based login allowed"
      add_finding "MEDIUM" "SSH" "PermitRootLogin allows key-based root login (${permit_root})" \
        "Set PermitRootLogin no in ${sshd_cfg} — use sudo for privilege escalation"
      ;;
    *)
      crit "PermitRootLogin ${permit_root} — root can log in with a password"
      add_finding "HIGH" "SSH" "PermitRootLogin is '${permit_root}' — direct root SSH access allowed" \
        "Set PermitRootLogin no in ${sshd_cfg} then: systemctl restart ssh"
      ;;
  esac

  # PasswordAuthentication
  if [[ "${pass_auth}" == "yes" ]]; then
    warn "PasswordAuthentication yes — brute-force risk"
    add_finding "MEDIUM" "SSH" "PasswordAuthentication enabled — vulnerable to brute-force" \
      "Set PasswordAuthentication no in ${sshd_cfg} (SSH keys only); install fail2ban"
  else
    ok "PasswordAuthentication: ${pass_auth}"
  fi

  # X11 Forwarding
  if [[ "${x11}" == "yes" ]]; then
    warn "X11Forwarding yes — unnecessary attack surface on a server"
    add_finding "LOW" "SSH" "X11Forwarding is enabled — no display server needed on a headless server" \
      "Set X11Forwarding no in ${sshd_cfg}"
  else
    ok "X11Forwarding: ${x11:-no}"
  fi

  # MaxAuthTries
  if (( max_tries > 3 )); then
    warn "MaxAuthTries ${max_tries} — recommended ≤ 3"
    add_finding "LOW" "SSH" "MaxAuthTries ${max_tries} allows more retry attempts than necessary" \
      "Set MaxAuthTries 3 in ${sshd_cfg}"
  else
    ok "MaxAuthTries: ${max_tries}"
  fi

  # Port
  if [[ "${port}" == "22" ]]; then
    warn "SSH on default port 22 — attracts automated scanners"
    add_finding "LOW" "SSH" "SSH on port 22 (default) — increases exposure to automated attacks" \
      "Optional: change Port in ${sshd_cfg} to non-standard (e.g. 2222), update UFW: ufw allow 2222/tcp && ufw delete allow 22/tcp"
  else
    ok "SSH port: ${port} (non-default)"
  fi

  # fail2ban
  if command -v fail2ban-client &>/dev/null; then
    local banned
    banned="$(fail2ban-client status sshd 2>/dev/null | grep "Currently banned" | awk '{print $NF}' || echo 'N/A')"
    ok "fail2ban installed (sshd banned IPs: ${banned})"
  else
    warn "fail2ban not installed"
    add_finding "MEDIUM" "SSH" "fail2ban not installed — no automated brute-force protection" \
      "apt install fail2ban && systemctl enable --now fail2ban"
  fi
}

# ── 6. Failed Logins ─────────────────────────────────────────────────────────

check_failed_logins() {
  step "Failed Login Attempts"

  local auth_log=""
  for f in /var/log/auth.log /var/log/secure; do
    [[ -f "${f}" ]] && { auth_log="${f}"; break; }
  done

  if [[ -z "${auth_log}" ]]; then
    warn "Auth log not found — skipping"
    return
  fi

  local fail_count
  fail_count="$(grep -c "Failed password\|Invalid user\|authentication failure" "${auth_log}" 2>/dev/null || echo 0)"

  if (( fail_count > 100 )); then
    crit "${fail_count} failed login events in ${auth_log}"
    add_finding "HIGH" "Auth" "${fail_count} failed SSH login attempts — likely active brute-force" \
      "Install fail2ban: apt install fail2ban — audit IPs: grep 'Failed password' ${auth_log} | awk '{print \$11}' | sort | uniq -c | sort -rn | head -20"
  elif (( fail_count > 10 )); then
    warn "${fail_count} failed login events"
    add_finding "MEDIUM" "Auth" "${fail_count} failed SSH login attempts logged" \
      "Review: grep 'Failed password' ${auth_log} | awk '{print \$11}' | sort | uniq -c | sort -rn | head -10"
  else
    ok "${fail_count} failed login events (normal)"
  fi

  # Top attacking IPs
  local top_ips
  top_ips="$(grep "Failed password" "${auth_log}" 2>/dev/null \
    | awk '{print $11}' | sort | uniq -c | sort -rn | head -5 || true)"
  if [[ -n "${top_ips}" ]]; then
    info "Top source IPs:"
    echo "${top_ips}" | indent
  fi
}

# ── 7. Process Health ─────────────────────────────────────────────────────────

check_processes() {
  step "Process Health"

  # --- Zombie processes ---
  local zombies
  zombies="$(ps aux 2>/dev/null | awk '$8 == "Z" {print "PID "$2": "$11}' || true)"
  if [[ -n "${zombies}" ]]; then
    local zombie_count
    zombie_count="$(echo "${zombies}" | wc -l)"
    crit "${zombie_count} zombie process(es):"
    echo "${zombies}" | indent
    add_finding "MEDIUM" "Processes" "${zombie_count} zombie process(es) — parent not reaping children" \
      "Find parent: ps -p <PID> -o ppid= — restart the parent service, or reboot if persistent"
  else
    ok "No zombie processes"
  fi

  # --- Processes from suspicious / temp paths ---
  info "Scanning for suspicious process paths..."
  local suspicious=0

  for pid_dir in /proc/[0-9]*/; do
    local pid="${pid_dir%/}"
    pid="${pid##*/}"

    local cmdline
    cmdline="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null | cut -c1-100 || true)"
    [[ -z "${cmdline}" ]] && continue   # kernel thread — skip

    local exe_link
    exe_link="$(readlink "/proc/${pid}/exe" 2>/dev/null || true)"

    # Deleted binary
    if [[ "${exe_link}" == *"(deleted)"* ]]; then
      warn "PID ${pid} running deleted binary: ${cmdline}"
      add_finding "HIGH" "Processes" \
        "PID ${pid} running a deleted binary — may be malware or a pending upgrade: ${cmdline}" \
        "Investigate: lsof -p ${pid} — if malware: isolate and review /var/log/auth.log"
      (( suspicious++ )) || true
    fi

    # Execution from temp/world-writable paths
    local exe_path
    exe_path="$(readlink -f "/proc/${pid}/exe" 2>/dev/null || true)"
    if [[ "${exe_path}" == /tmp/* || "${exe_path}" == /dev/shm/* || \
          "${exe_path}" == /var/tmp/* || "${exe_path}" == /run/shm/* ]]; then
      crit "PID ${pid} running from temp path: ${exe_path}"
      add_finding "CRITICAL" "Processes" \
        "PID ${pid} executing from temp directory: ${exe_path} — command: ${cmdline}" \
        "IMMEDIATE: lsof -p ${pid} && kill -9 ${pid} — scan with: rkhunter --check OR clamscan -r /"
      (( suspicious++ )) || true
    fi
  done

  [[ "${suspicious}" -eq 0 ]] && ok "No processes from suspicious paths"

  # --- Top CPU consumers ---
  printf "\n"
  info "Top 5 CPU consumers:"
  ps aux --sort=-%cpu 2>/dev/null \
    | awk 'NR>1 && NR<=6 {printf "     %5s%%  %-15s  %s\n", $3, $1, $11}' || true

  # --- Top memory consumers ---
  printf "\n"
  info "Top 5 memory consumers:"
  ps aux --sort=-%mem 2>/dev/null \
    | awk 'NR>1 && NR<=6 {printf "     %5s%%  %-15s  %s\n", $4, $1, $11}' || true
}

# ── 8. Resource Usage ────────────────────────────────────────────────────────

check_resources() {
  step "Resource Usage"

  local ncpus
  ncpus="$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)"

  # --- Load average ---
  local load1 load5 load15
  read -r load1 load5 load15 _ < /proc/loadavg 2>/dev/null || { load1=0; load5=0; load15=0; }

  printf "  Load: ${B}%s${R} (1m) / ${B}%s${R} (5m) / ${B}%s${R} (15m)   [${ncpus} CPU(s)]\n" \
    "${load1}" "${load5}" "${load15}"

  # Compare using awk (avoids bc dependency)
  local load_high
  load_high="$(awk "BEGIN { print (${load1} > ${ncpus}) ? 1 : 0 }")"
  if [[ "${load_high}" == "1" ]]; then
    warn "1-min load (${load1}) exceeds CPU count (${ncpus})"
    add_finding "MEDIUM" "Resources" \
      "Load average ${load1} (1m) exceeds ${ncpus} CPUs — system CPU-saturated" \
      "Identify cause: ps aux --sort=-%cpu | head -10 — check for k8s workload spikes"
  else
    ok "Load average within CPU capacity"
  fi

  # --- Memory ---
  printf "\n"
  if [[ -f /proc/meminfo ]]; then
    local mem_total mem_avail mem_used mem_pct
    mem_total="$(awk '/^MemTotal:/    {print $2}' /proc/meminfo)"
    mem_avail="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)"
    mem_used=$(( mem_total - mem_avail ))
    mem_pct=$(( (mem_used * 100) / mem_total ))

    local mem_total_gb mem_used_gb mem_avail_gb
    mem_total_gb="$(awk "BEGIN{printf \"%.1f\", ${mem_total}/1048576}")"
    mem_used_gb="$(awk  "BEGIN{printf \"%.1f\", ${mem_used}/1048576}")"
    mem_avail_gb="$(awk "BEGIN{printf \"%.1f\", ${mem_avail}/1048576}")"

    printf "  Memory: ${B}%d%%${R} used  (%s GB used / %s GB total / %s GB free)\n" \
      "${mem_pct}" "${mem_used_gb}" "${mem_total_gb}" "${mem_avail_gb}"

    if (( mem_pct > 90 )); then
      crit "Memory usage critical: ${mem_pct}%"
      add_finding "HIGH" "Resources" \
        "Memory at ${mem_pct}% — OOM risk; system may start swapping heavily" \
        "ps aux --sort=-%mem | head -10 — consider adding RAM or adjusting k8s memory limits"
    elif (( mem_pct > 80 )); then
      warn "Memory elevated: ${mem_pct}%"
      add_finding "MEDIUM" "Resources" \
        "Memory at ${mem_pct}% — monitor for further increase" \
        "ps aux --sort=-%mem | head -10 — tune k8s resource requests/limits"
    else
      ok "Memory OK (${mem_pct}%)"
    fi

    # Swap
    local swap_total swap_free swap_pct
    swap_total="$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)"
    swap_free="$(awk  '/^SwapFree:/ {print $2}' /proc/meminfo)"

    if (( swap_total > 0 )); then
      local swap_used swap_used_gb swap_total_gb
      swap_used=$(( swap_total - swap_free ))
      swap_pct=$(( (swap_used * 100) / swap_total ))
      swap_used_gb="$(awk "BEGIN{printf \"%.1f\", ${swap_used}/1048576}")"
      swap_total_gb="$(awk "BEGIN{printf \"%.1f\", ${swap_total}/1048576}")"
      printf "  Swap:   ${B}%d%%${R} used  (%s GB / %s GB)\n" \
        "${swap_pct}" "${swap_used_gb}" "${swap_total_gb}"
      if (( swap_pct > 50 )); then
        warn "Swap usage high: ${swap_pct}%"
        add_finding "MEDIUM" "Resources" \
          "Swap at ${swap_pct}% — indicates memory pressure and degraded performance" \
          "Add RAM or reduce workload — to flush swap: swapoff -a && swapon -a"
      fi
    else
      warn "No swap configured"
      add_finding "LOW" "Resources" "No swap space — OOM kills more likely under memory pressure" \
        "fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab"
    fi
  fi

  # --- Disk ---
  printf "\n"
  info "Disk usage:"
  local disk_issues=0
  while IFS= read -r line; do
    local fs use_pct mount
    fs="$(awk '{print $1}' <<< "${line}")"
    use_pct="$(awk '{print $5}' <<< "${line}" | tr -d '%')"
    mount="$(awk '{print $6}' <<< "${line}")"
    [[ "${use_pct}" =~ ^[0-9]+$ ]] || continue
    # Skip virtual/overlay filesystems
    [[ "${fs}" =~ ^(tmpfs|devtmpfs|udev|overlay|shm|cgroupfs)$ ]] && continue

    if (( use_pct >= 95 )); then
      printf "  ${BRED}  %-35s %3d%%  CRITICAL${R}\n" "${mount} (${fs})" "${use_pct}"
      add_finding "CRITICAL" "Resources" \
        "Disk ${mount} is ${use_pct}% full — may cause service failures" \
        "du -sh ${mount}/* | sort -rh | head -10 — prune k8s images: microk8s.ctr images prune"
      (( disk_issues++ )) || true
    elif (( use_pct >= 85 )); then
      printf "  ${BYEL}  %-35s %3d%%  WARNING${R}\n" "${mount} (${fs})" "${use_pct}"
      add_finding "HIGH" "Resources" \
        "Disk ${mount} is ${use_pct}% full — approaching capacity" \
        "du -sh ${mount}/* | sort -rh | head -10 — check k8s logs: microk8s kubectl logs"
      (( disk_issues++ )) || true
    else
      printf "  ${BGRN}  %-35s %3d%%${R}\n" "${mount} (${fs})" "${use_pct}"
    fi
  done < <(df -h 2>/dev/null | tail -n +2 || true)

  [[ "${disk_issues}" -eq 0 ]] && ok "All disks below 85%"

  # --- Network interface stats ---
  printf "\n"
  info "Network interface errors/drops:"
  local net_issues=0
  while IFS= read -r iface; do
    local rx_err rx_drop tx_err tx_drop
    rx_err="$(cat "/sys/class/net/${iface}/statistics/rx_errors"   2>/dev/null || echo 0)"
    rx_drop="$(cat "/sys/class/net/${iface}/statistics/rx_dropped"  2>/dev/null || echo 0)"
    tx_err="$(cat "/sys/class/net/${iface}/statistics/tx_errors"   2>/dev/null || echo 0)"
    tx_drop="$(cat "/sys/class/net/${iface}/statistics/tx_dropped"  2>/dev/null || echo 0)"
    local total=$(( rx_err + rx_drop + tx_err + tx_drop ))
    if (( total > 0 )); then
      warn "${iface}: RX err=${rx_err} drop=${rx_drop}  TX err=${tx_err} drop=${tx_drop}"
      add_finding "LOW" "Resources" \
        "Interface ${iface} has network errors/drops (total: ${total})" \
        "Check driver: ethtool ${iface} — review dmesg | grep ${iface} for hardware issues"
      (( net_issues++ )) || true
    fi
  done < <(ls /sys/class/net/ 2>/dev/null | grep -v "^lo$" || true)
  [[ "${net_issues}" -eq 0 ]] && ok "No network errors or drops"
}

# ── 9. Pending Updates ───────────────────────────────────────────────────────

check_updates() {
  step "Pending Updates"

  if ! command -v apt &>/dev/null; then
    info "apt not found — skipping update check"
    return
  fi

  apt-get -qq update 2>/dev/null || true

  local upgradable security_count
  upgradable="$(apt list --upgradable 2>/dev/null | grep -c "/" || echo 0)"
  security_count="$(apt list --upgradable 2>/dev/null | grep -ic "security" || echo 0)"

  if (( security_count > 0 )); then
    crit "${security_count} security update(s) pending (${upgradable} total)"
    add_finding "HIGH" "Updates" "${security_count} security packages need updating" \
      "apt upgrade -y — or enable automatic security patches: dpkg-reconfigure unattended-upgrades"
  elif (( upgradable > 0 )); then
    warn "${upgradable} update(s) available (no security fixes)"
    add_finding "LOW" "Updates" "${upgradable} package updates available" \
      "apt upgrade -y — schedule regular maintenance windows"
  else
    ok "System packages up to date"
  fi

  # unattended-upgrades
  if dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii"; then
    ok "unattended-upgrades installed"
  else
    warn "unattended-upgrades not installed"
    add_finding "MEDIUM" "Updates" "Automatic security updates not configured" \
      "apt install unattended-upgrades && dpkg-reconfigure unattended-upgrades"
  fi

  # Reboot required
  if [[ -f /var/run/reboot-required ]]; then
    warn "Reboot required to apply kernel updates"
    add_finding "MEDIUM" "Updates" "Kernel update pending — reboot needed to activate" \
      "Schedule a maintenance window: systemctl reboot"
  fi
}

# ── 10. MicroK8s ─────────────────────────────────────────────────────────────

check_microk8s() {
  step "MicroK8s"

  if ! command -v microk8s &>/dev/null; then
    info "microk8s not found — skipping"
    return
  fi

  # Running?
  local mk_status
  mk_status="$(microk8s status 2>/dev/null | head -2 || echo '')"

  if echo "${mk_status}" | grep -q "microk8s is running"; then
    ok "MicroK8s is running"
  else
    crit "MicroK8s is NOT running"
    add_finding "HIGH" "MicroK8s" "MicroK8s is not running" \
      "microk8s start — or check snap services: snap services microk8s"
    return
  fi

  # Node readiness
  local not_ready
  not_ready="$(microk8s kubectl get nodes --no-headers 2>/dev/null | grep -v " Ready " || true)"
  if [[ -n "${not_ready}" ]]; then
    warn "Nodes NOT Ready:"
    echo "${not_ready}" | indent
    add_finding "HIGH" "MicroK8s" "One or more Kubernetes nodes are not in Ready state" \
      "microk8s kubectl describe node <name> — check kubelet: systemctl status snap.microk8s.daemon-kubelet"
  else
    ok "All nodes Ready"
    microk8s kubectl get nodes --no-headers 2>/dev/null | indent || true
  fi

  # Unhealthy pods
  local bad_pods
  bad_pods="$(microk8s kubectl get pods --all-namespaces --no-headers 2>/dev/null \
    | grep -v "Running\|Completed\|Succeeded" | grep -v "^$" || true)"
  if [[ -n "${bad_pods}" ]]; then
    local pod_count
    pod_count="$(echo "${bad_pods}" | wc -l)"
    warn "${pod_count} pod(s) not in Running/Completed state:"
    echo "${bad_pods}" | indent
    add_finding "MEDIUM" "MicroK8s" "${pod_count} unhealthy pod(s) detected" \
      "microk8s kubectl describe pod <name> -n <ns> — check logs: microk8s kubectl logs <pod> -n <ns>"
  else
    ok "All pods Running / Completed"
  fi

  # API server binding — flag if on all interfaces without firewall
  if ss -tlnp 2>/dev/null | grep ":16443" | grep -q "0\.0\.0\.0\|\*\|:::"; then
    local ufw_active
    ufw_active="$(ufw status 2>/dev/null | grep -c "Status: active" || echo 0)"
    if (( ufw_active == 0 )); then
      warn "k8s API server (16443) exposed on all interfaces without UFW"
      add_finding "HIGH" "MicroK8s" \
        "Kubernetes API server (port 16443) accessible on all interfaces and UFW is off" \
        "Enable UFW with a rule restricting 16443: ufw allow from <admin-IP> to any port 16443"
    fi
  fi
}

# ── 11. Plex Media Server ────────────────────────────────────────────────────

check_plex() {
  step "Plex Media Server"

  local plex_running=false
  if systemctl is-active --quiet plexmediaserver 2>/dev/null; then
    ok "plexmediaserver service is active"
    plex_running=true
  elif pgrep -fi "plex media server\|plexmediaserver" &>/dev/null; then
    ok "Plex process running (outside systemd)"
    plex_running=true
  else
    warn "Plex Media Server not detected as running"
    add_finding "LOW" "Plex" "Plex Media Server does not appear to be running" \
      "systemctl start plexmediaserver && systemctl enable plexmediaserver"
    return
  fi

  # Port 32400
  if ss -tlnp 2>/dev/null | grep -q ":32400"; then
    ok "Port 32400 is listening"
    if ss -tlnp 2>/dev/null | grep ":32400" | grep -q "0\.0\.0\.0\|\*\|:::"; then
      info "Port 32400 bound to all interfaces (expected for remote access)"
      add_finding "INFO" "Plex" "Plex port 32400 is publicly accessible" \
        "Verify authentication is enabled: Plex Settings → Network → 'Require authentication on local network'"
    fi
  else
    warn "Port 32400 not listening — Plex may still be starting or using a custom port"
  fi

  # Running as root?
  local plex_user
  plex_user="$(ps aux 2>/dev/null \
    | grep -i "plex media server\|plexmediaserver" | grep -v grep \
    | awk '{print $1}' | head -1 || true)"
  if [[ "${plex_user}" == "root" ]]; then
    crit "Plex running as root"
    add_finding "HIGH" "Plex" "Plex Media Server running as root — privilege escalation risk" \
      "Set PLEX_MEDIA_SERVER_USER in /etc/default/plexmediaserver to a dedicated non-root user"
  elif [[ -n "${plex_user}" ]]; then
    ok "Plex running as user: ${plex_user}"
  fi
}

# ── 12. Samba ────────────────────────────────────────────────────────────────

check_samba() {
  step "Samba"

  # smbd
  if systemctl is-active --quiet smbd 2>/dev/null || pgrep -x smbd &>/dev/null; then
    ok "smbd is running"
  else
    warn "smbd not running — file shares unavailable"
    add_finding "MEDIUM" "Samba" "smbd is not running" \
      "systemctl start smbd && systemctl enable smbd"
  fi

  # nmbd
  if systemctl is-active --quiet nmbd 2>/dev/null || pgrep -x nmbd &>/dev/null; then
    ok "nmbd is running"
  else
    info "nmbd not running (only needed for NetBIOS name resolution)"
  fi

  local smb_conf="/etc/samba/smb.conf"
  if [[ ! -f "${smb_conf}" ]]; then
    warn "smb.conf not found at ${smb_conf}"
    return
  fi

  # Guest / public shares
  local guest_shares
  guest_shares="$(grep -iP "guest ok\s*=\s*yes|public\s*=\s*yes" "${smb_conf}" 2>/dev/null || true)"
  if [[ -n "${guest_shares}" ]]; then
    warn "Guest-accessible shares detected:"
    echo "${guest_shares}" | indent
    add_finding "MEDIUM" "Samba" "smb.conf has guest-accessible shares configured" \
      "Review ${smb_conf} — remove 'guest ok = yes' unless intentional; restrict: valid users = @sambashare"
  else
    ok "No guest shares in smb.conf"
  fi

  # Interface binding
  local bind_line
  bind_line="$(grep -iP "^\s*interfaces\s*=" "${smb_conf}" 2>/dev/null | head -1 | xargs || true)"
  if [[ -z "${bind_line}" ]]; then
    warn "Samba not bound to specific interfaces — accessible on all NICs"
    add_finding "LOW" "Samba" "Samba not restricted to specific interfaces" \
      "Add to smb.conf [global]: interfaces = lo <LAN-NIC>\nbind interfaces only = yes"
  else
    ok "${bind_line}"
  fi

  # Minimum SMB protocol
  local min_proto
  min_proto="$(grep -iP "^\s*(min protocol|server min protocol)\s*=" "${smb_conf}" 2>/dev/null \
    | awk -F= '{print $2}' | tr -d ' ' | head -1 || true)"
  if [[ -z "${min_proto}" ]] || \
     echo "${min_proto}" | grep -iqP "^(NT1|LANMAN|CORE|COREPLUS|LANMAN1|LANMAN2)$"; then
    warn "SMBv1/legacy protocol not explicitly disabled (min protocol: ${min_proto:-not set})"
    add_finding "MEDIUM" "Samba" \
      "SMBv1 or legacy SMB protocols may be enabled (min protocol: ${min_proto:-not set})" \
      "Add to smb.conf [global]: min protocol = SMB2  (or SMB3 for better security)"
  else
    ok "SMB min protocol: ${min_proto}"
  fi
}

# ── 13. Summary ───────────────────────────────────────────────────────────────

print_summary() {
  local c_crit c_high c_med c_low c_info total
  c_crit="$(count_sev CRITICAL)"
  c_high="$(count_sev HIGH)"
  c_med="$(count_sev MEDIUM)"
  c_low="$(count_sev LOW)"
  c_info="$(count_sev INFO)"
  total=$(( c_crit + c_high + c_med + c_low + c_info ))

  printf "\n"
  printf "${B}${BCYN}╔══════════════════════════════════════════════════════════════╗${R}\n"
  printf "${B}${BCYN}║  AUDIT SUMMARY                                               ║${R}\n"
  printf "${B}${BCYN}╚══════════════════════════════════════════════════════════════╝${R}\n\n"

  if (( total == 0 )); then
    printf "  ${BGRN}✓  No issues found — server looks healthy.${R}\n\n"
    return
  fi

  printf "  Findings: "
  (( c_crit > 0 )) && printf "${BRED}%d CRITICAL${R}  " "${c_crit}"
  (( c_high > 0 )) && printf "${RED}%d HIGH${R}  " "${c_high}"
  (( c_med  > 0 )) && printf "${YEL}%d MEDIUM${R}  " "${c_med}"
  (( c_low  > 0 )) && printf "${CYN}%d LOW${R}  " "${c_low}"
  (( c_info > 0 )) && printf "${D}%d INFO${R}" "${c_info}"
  printf "\n\n"
  hr

  local -a order=("CRITICAL" "HIGH" "MEDIUM" "LOW" "INFO")
  local -a clrs=("${BRED}" "${RED}" "${BYEL}" "${CYN}" "${D}")
  local i=0

  for sev in "${order[@]}"; do
    local clr="${clrs[$i]}"
    (( i++ )) || true
    local printed=false

    for f in "${FINDINGS[@]+"${FINDINGS[@]}"}"; do
      local fsev fcat fmsg ffix
      IFS='|' read -r fsev fcat fmsg ffix <<< "${f}"
      [[ "${fsev}" != "${sev}" ]] && continue

      if ! ${printed}; then
        printf "\n  ${clr}${B}[ ${sev} ]${R}\n"
        printed=true
      fi

      printf "  ${clr}▸${R} ${B}[%s]${R} %s\n"  "${fcat}" "${fmsg}"
      printf "    ${CYN}→ Fix:${R} %s\n\n" "${ffix}"
    done
  done

  hr
  printf "\n  Total: ${B}%d${R} finding(s)\n\n" "${total}"
}

# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

main() {
  printf "\n"
  printf "${B}${BCYN}╔══════════════════════════════════════════════════════════════╗${R}\n"
  printf "${B}${BCYN}║  Server Security & Performance Audit                         ║${R}\n"
  printf "${B}${BCYN}║  MicroK8s · Plex Media Server · Samba                        ║${R}\n"
  printf "${B}${BCYN}╚══════════════════════════════════════════════════════════════╝${R}\n"

  check_system_info
  check_firewall
  check_open_ports
  check_users
  check_ssh
  check_failed_logins
  check_processes
  check_resources
  check_updates
  check_microk8s
  check_plex
  check_samba
  print_summary
}

main "$@"
