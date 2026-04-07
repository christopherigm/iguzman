# server-audit

A bash script that audits an **Ubuntu Server** running **MicroK8s**, **Plex Media Server**, and **Samba** for security and performance issues. It produces a colour-coded report and a severity-sorted summary with an actionable fix for every finding.

---

## Quick start

```bash
sudo bash cli/server-audit/server-audit.sh
```

To save the report to a file:

```bash
sudo bash cli/server-audit/server-audit.sh --no-color | tee server-audit-$(date +%F).log
```

---

## Scripts

| Script | Description |
|--------|-------------|
| [`server-audit.sh`](#server-auditsh) | Run the full security & performance audit |

---

## server-audit.sh

### Requirements

| Requirement | Notes |
|-------------|-------|
| `bash` ≥ 4.3 | Pre-installed on Ubuntu 18.04+ |
| `sudo` / root | Most checks require elevated privileges |
| `ss` (`iproute2`) | Port scanning — pre-installed on Ubuntu |
| `ps`, `df`, `uptime` | Resource checks — part of `procps` / `coreutils` |
| `ufw` | Firewall checks — install if not present |
| `awk` | Used throughout — pre-installed on Ubuntu |

Optional tools enhance specific checks when installed:

| Tool | Enhances |
|------|----------|
| `fail2ban` | SSH brute-force protection check |
| `microk8s` | Kubernetes health section |
| `systemctl` | Service active/inactive detection |

### Usage

```
sudo bash cli/server-audit/server-audit.sh [--no-color]
```

| Option | Description |
|--------|-------------|
| `--no-color` | Strip ANSI color codes — use when piping to a file or CI |

### What it checks

#### Firewall
- UFW active / inactive
- iptables INPUT rules (fallback firewall detection)
- Finding raised if no host firewall is present

#### Open / Listening ports
Compares every TCP and UDP listener against a built-in allowlist of ports expected for this server setup:

| Service | Expected ports |
|---------|----------------|
| SSH | 22 |
| HTTP / HTTPS | 80, 443 |
| Samba | 139, 445 |
| Plex | 32400, 3005, 8324, 32469 |
| MicroK8s / Kubernetes | 16443, 10248–10259, 2379, 2380 |
| CoreDNS | 53 |
| k8s NodePort range | 30000–32767 |
| NTP | 123 |

Any port outside this list is flagged as **unexpected** with a targeted mitigation command.  
Loopback-only sockets (`127.x` / `[::1]`) are shown but not flagged.

#### User accounts
- Accounts with **UID 0** other than root
- Login accounts with **empty passwords**
- All **sudo-capable** users (sudoers file + `sudo` / `admin` groups)
- Accounts with **interactive login shells** (UID ≥ 1000)
- Last 5 login events

#### SSH hardening
| Setting | Recommended | Flagged when |
|---------|-------------|--------------|
| `PermitRootLogin` | `no` | anything other than `no` |
| `PasswordAuthentication` | `no` | `yes` |
| `X11Forwarding` | `no` | `yes` |
| `MaxAuthTries` | ≤ 3 | > 3 |
| Port | non-standard | 22 (informational) |
| fail2ban | installed | not present |

Reads both `/etc/ssh/sshd_config` and drop-ins in `/etc/ssh/sshd_config.d/`.

#### Failed login attempts
- Total failed SSH events in `/var/log/auth.log` (or `/var/log/secure`)
- Top 5 attacking source IPs
- Thresholds: > 10 events → MEDIUM, > 100 events → HIGH

#### Process health
- **Zombie processes** (`ps` state `Z`)
- **Processes from suspicious paths** — flags any process executing from `/tmp`, `/dev/shm`, `/var/tmp`, or `/run/shm` (common malware staging areas)
- **Deleted binaries** — flags processes whose executable has been removed from disk (can indicate malware or a package upgrade requiring a restart)
- Top 5 processes by **CPU usage**
- Top 5 processes by **memory usage**

#### Resource usage
| Resource | Warning threshold | Critical threshold |
|----------|-------------------|--------------------|
| Load average | > CPU count | — |
| Memory | > 80% | > 90% |
| Swap | > 50% | — |
| Disk (per mount) | ≥ 85% | ≥ 95% |
| Network errors/drops | > 0 on any interface | — |

Skips virtual filesystems (`tmpfs`, `overlay`, `devtmpfs`, etc.) in disk checks.

#### Pending updates
- Counts available packages, separately counting security updates
- Checks whether `unattended-upgrades` is installed
- Detects `/var/run/reboot-required` (kernel update pending)

#### MicroK8s
- Cluster running (`microk8s status`)
- Node readiness (`kubectl get nodes`)
- Unhealthy pods across all namespaces
- API server (port 16443) exposed on all interfaces without UFW

#### Plex Media Server
- Service / process running
- Port 32400 listening
- Running as **root** (privilege escalation risk)

#### Samba
- `smbd` / `nmbd` running
- **Guest shares** configured in `smb.conf`
- Not bound to specific interfaces (accessible on all NICs)
- **SMBv1 / legacy protocol** not explicitly disabled

---

## Output format

The script prints a live colour-coded report as it runs, then finishes with a consolidated summary:

```
▶ Firewall
────────────────────────────────────────────────────────────────
  ✓  UFW is active
  →  [rule table]

▶ Open / Listening Ports
────────────────────────────────────────────────────────────────
  ✓  TCP 0.0.0.0:22     [sshd]        SSH
  ✓  TCP 0.0.0.0:445    [smbd]        Samba/SMB
  !! TCP 0.0.0.0:8080   [nginx]       UNEXPECTED

...

╔══════════════════════════════════════════════════════════════╗
║  AUDIT SUMMARY                                               ║
╚══════════════════════════════════════════════════════════════╝

  Findings: 1 CRITICAL  2 HIGH  3 MEDIUM  1 LOW

  [ CRITICAL ]
  ▸ [Processes] PID 3847 executing from temp directory: /tmp/abc
    → Fix: lsof -p 3847 && kill -9 3847 — scan with: rkhunter --check

  [ HIGH ]
  ▸ [SSH] PermitRootLogin is 'yes' — direct root SSH access allowed
    → Fix: Set PermitRootLogin no in /etc/ssh/sshd_config then: systemctl restart ssh
  ...
```

Severity levels:

| Level | Colour | Meaning |
|-------|--------|---------|
| CRITICAL | Bold red | Immediate action required — active risk |
| HIGH | Red | Should be fixed soon |
| MEDIUM | Yellow | Increases attack surface or degrades performance |
| LOW | Cyan | Hardening recommendation |
| INFO | Dim | Informational — no action required |

---

## Scheduling (optional)

To run the audit automatically and save a dated log:

```bash
# Add to root's crontab: sudo crontab -e
0 6 * * 1  bash /path/to/cli/server-audit/server-audit.sh --no-color \
             > /var/log/server-audit-$(date +\%F).log 2>&1
```

This runs every Monday at 06:00 and keeps a log per date in `/var/log/`.

---

## Troubleshooting

**`Error: Run with sudo.`**
```bash
sudo bash cli/server-audit/server-audit.sh
```

**Skipped sections (e.g. "microk8s not found")**  
The script skips any section whose required tool is not installed. Install the tool and re-run.

**`ss` missing**
```bash
sudo apt install iproute2
```

**Auth log not found**  
On systems using `journald` without log files:
```bash
sudo journalctl _COMM=sshd | grep "Failed password" | wc -l
```

**Port flagged as unexpected but it is intentional**  
Add the port to the `KNOWN_PORTS` associative array near the top of `server-audit.sh`:
```bash
KNOWN_PORTS[8080]="my-app"
```
