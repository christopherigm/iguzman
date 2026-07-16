# setup-wifi

Interactive Wi-Fi setup for **Ubuntu servers** that have a Wi-Fi card. Enables and
"fixes" the radio if needed, then scans, connects, and verifies you got an IP.

```bash
pnpm setup-wifi
# or
bash cli/setup-wifi/setup-wifi.sh
```

The script **re-runs itself with `sudo`** on start (it needs root for `rfkill`,
`ip link`, and `netplan`), so you supply your password once.

## What it does

1. **Language** prompt (English / Spanish).
2. **Auto-detects the networking backend** and drives it:
   - **NetworkManager (`nmcli`)** when its service is active, or
   - **netplan + `wpa_supplicant`** (Ubuntu Server's default stack) otherwise.
3. **Finds the Wi-Fi interface** (`wlan0`, `wlp1s0`, …). If several exist, you
   pick one. If none is found, it prints hardware diagnostics (PCI/USB adapters,
   a firmware hint) and exits.
4. **Fixes the card** so it can scan and connect:
   - `rfkill` — unblocks a **soft** block; warns on a **hard** block (physical
     switch / BIOS — not fixable from software).
   - Turns the Wi-Fi **radio on** (nmcli mode).
   - Brings the **interface up**.
5. **Main menu** (adapts to the current state):
   - **Connect to a Wi-Fi network** — scans, lists SSIDs in range (plus _type
     the SSID manually_ and _scan again_), prompts for the password (leave blank
     for an open network), connects, and **verifies** the association + IP.
   - **Show status** — backend, interface, SSID, IP, signal.

## Already connected? Re-run to switch or disconnect

If the interface is already associated with a network when you run the script,
the menu changes to:

- **Connect to another Wi-Fi network** — scan and join a different SSID.
- **Disconnect the current network**.

## Persistence

Connections survive reboots:

- **nmcli** — saved as a NetworkManager connection profile that auto-connects.
- **netplan** — written to `/etc/netplan/90-setup-wifi.yaml` (mode `600`, it holds
  the PSK), applied with `netplan apply`. This file is **owned by the script**:
  disconnecting removes it and re-applies, leaving any wired config in other
  netplan files untouched.

## Requirements

Auto-installed on demand (via `apt`, with a confirm prompt):

- `rfkill`
- `iw` — netplan mode, for scanning and status
- `wpasupplicant` — netplan mode, to associate with a network

`nmcli` (from `network-manager`) is used only when NetworkManager is already the
active backend; the script never installs or switches you to it.

## Notes

- Designed for **headless servers**. Everything runs over SSH / the console — no
  desktop environment required.
- SSIDs and passwords with quotes/backslashes are escaped when written to the
  netplan YAML.
