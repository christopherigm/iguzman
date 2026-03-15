# play-videos

A collection of bash scripts for playing media on **Ubuntu Server** (or any headless Linux) via HDMI, using [mpv](https://mpv.io/) with DRM/KMS output — no desktop environment, X11, or Wayland required.

---

## Scripts

| Script | Description |
|--------|-------------|
| [`install.sh`](#installsh) | Install all dependencies and configure user groups |
| [`play-videos.sh`](#play-videossh) | Play video and audio files via DRM/KMS output |
| [`fix-audio.sh`](#fix-audiosh) | Inspect and fix common ALSA audio issues |

---

## Quick start

```bash
# 1. Install dependencies
bash cli/play-videos/install.sh

# 2. Log out and back in (if groups were changed)

# 3. List available connectors and audio devices
bash cli/play-videos/play-videos.sh --list-connectors
bash cli/play-videos/play-videos.sh --list-audio-devices

# 4. Play
bash cli/play-videos/play-videos.sh /media/videos/
```

---

## install.sh

Installs all packages required by `play-videos.sh` and `fix-audio.sh`, adds the current user to the necessary system groups, and verifies that DRM and ALSA devices are visible.

### What it installs

| Package | Why |
|---------|-----|
| `mpv` | Media player with DRM/KMS video output |
| `alsa-utils` | Provides `aplay` and `amixer` for audio device listing and control |
| `libdrm2` | Userspace DRM library required for `--vo=drm` KMS output |

### Groups configured

| Group | Why |
|-------|-----|
| `video` | Read/write access to `/dev/dri/card*` for DRM/KMS video output |
| `audio` | Access to ALSA sound devices |
| `render` | Access to `/dev/dri/renderD*` GPU render nodes (required on some distros) |

Supported package managers: `apt` (Debian/Ubuntu), `dnf` (Fedora), `yum` (RHEL/CentOS), `brew` (macOS).

### Usage

```bash
bash cli/play-videos/install.sh
```

> **Note:** If any group membership was changed, you must **log out and back in** (or reboot) for the changes to take effect. To apply a single group without logging out: `newgrp video`. Verify with `id`.

---

## play-videos.sh

Plays video and audio files via mpv's `--vo=drm` (Direct Rendering Manager / Kernel Mode Setting) output. Renders directly to the display through the Linux kernel — no X11, Wayland, or compositor needed. Works from a plain TTY or SSH session.

### Requirements

| Dependency | Provided by |
|------------|-------------|
| `mpv` ≥ 0.30.0 | `install.sh` / `sudo apt install mpv` |
| `bash` ≥ 4.0 | Pre-installed on Ubuntu |
| DRM-capable GPU | Intel, AMD, or NVIDIA (open drivers) |
| HDMI-connected display | Plugged in before boot for reliable KMS detection |

### Usage

```
./play-videos.sh [OPTIONS] <file|directory|playlist>
```

#### Positional argument

| Argument | Behaviour |
|----------|-----------|
| `file.mp4` (or any video/audio file) | Play a single file |
| `/path/to/dir/` | Play all media files in the directory (sorted) |
| `file.m3u` / `.m3u8` / `.pls` / `.txt` | Treated as a playlist file |

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--connector <name>` | `auto` | DRM connector to output on (e.g. `HDMI-A-1`, `DP-1`) |
| `--mode <WxH[@R]\|preferred\|highest>` | `preferred` | Display resolution and refresh rate (e.g. `1920x1080@60`) |
| `--device <path>` | auto | Override DRM device (e.g. `/dev/dri/card1`) |
| `--profile <name>` | `sw-fast` | mpv profile to use |
| `--loop` | off | Loop the current file infinitely |
| `--loop=<N>` | off | Loop the current file N times |
| `--loop-playlist` | off | Loop the entire playlist infinitely |
| `--loop-playlist=<N>` | off | Loop the entire playlist N times |
| `--shuffle` | off | Play files in random order |
| `--volume <0-100>` | `100` | Playback volume |
| `--mute` | off | Start with audio muted |
| `--no-fullscreen` | fullscreen on | Disable forced fullscreen |
| `--audio-only` | auto | Force audio-only mode (skips DRM video output) |
| `--ao <driver>` | `alsa` | Audio output driver: `alsa`, `pulse`, `pipewire`, `jack`, `auto` |
| `--audio-device <device>` | auto | ALSA device string (e.g. `alsa/hdmi:CARD=PCH,DEV=3`) |
| `--playlist <file>` | — | Explicit playlist file |
| `--list-connectors` | — | Print available DRM connectors and modes, then exit |
| `--list-audio-devices` | — | Print available ALSA audio devices, then exit |
| `--` | — | Pass all subsequent arguments directly to mpv |
| `-h`, `--help` | — | Show usage and exit |

### Examples

```bash
# Play a single video
./play-videos.sh video.mp4

# Play a single audio file
./play-videos.sh song.mp3

# Play all media in a directory
./play-videos.sh /media/videos/

# Kiosk / digital-signage mode: loop a folder forever, randomised
./play-videos.sh --loop-playlist --shuffle /media/videos/

# Audio-only playlist, looped and shuffled
./play-videos.sh --audio-only --loop --shuffle /media/music/

# Explicit connector and resolution
./play-videos.sh --connector HDMI-A-1 --mode 1920x1080@60 video.mp4

# Custom ALSA audio device
./play-videos.sh --ao alsa --audio-device 'alsa/hdmi:CARD=PCH,DEV=3' video.mp4
./play-videos.sh --ao alsa --audio-device 'alsa/plughw:CARD=rt5650,DEV=0' song.flac

# Find out what connectors and modes your machine exposes
./play-videos.sh --list-connectors

# Find out what audio devices are available
./play-videos.sh --list-audio-devices

# Use a playlist file
./play-videos.sh --playlist my-playlist.m3u --loop-playlist --shuffle

# Muted playback
./play-videos.sh --mute /media/videos/

# Pass extra mpv flags (start at 1 min, play at 1.5×)
./play-videos.sh video.mp4 -- --start=00:01:00 --speed=1.5

# Multi-GPU machine: pick a specific DRM card
./play-videos.sh --device /dev/dri/card1 --connector HDMI-A-1 video.mp4
```

### How It Works

#### DRM / KMS video output (`--vo=drm`)

mpv's DRM video output driver renders frames directly to the display via the Linux kernel's **Direct Rendering Manager** and **Kernel Mode Setting** subsystems:

- No X11 / Wayland / compositor needed
- Works from a plain TTY or SSH session
- The kernel takes ownership of the display; the terminal that launched the script will be hidden behind the video output
- Hardware video decoding is **not available** in this mode — the script sets `--profile=sw-fast` to compensate with optimised software decoding

#### Connector selection (`--drm-connector`)

The DRM connector name maps to the physical port. Typical names:

| Name | Port |
|------|------|
| `HDMI-A-1` | First HDMI port |
| `HDMI-A-2` | Second HDMI port |
| `DP-1` | First DisplayPort |
| `eDP-1` | Internal laptop display |

Run `./play-videos.sh --list-connectors` to enumerate what your system exposes. `auto` selects the first active connector.

#### Audio (`--ao`, `--audio-device`)

The default audio output driver is `alsa`. Use `--list-audio-devices` to find your device string, then pass it with `--audio-device`. For HDMI audio, the device string typically looks like `alsa/hdmi:CARD=PCH,DEV=3`.

#### Directory mode

When a directory is passed, the script uses `find` to collect all files matching supported video extensions (`.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.flv`, `.m4v`, `.ts`, `.wmv`) or audio extensions (`.mp3`, `.flac`, `.wav`, `.ogg`, `.aac`, `.m4a`, `.opus`, `.wma`, `.ape`, `.mka`, `.alac`), sorts them alphabetically, and passes the list directly to mpv. If all files are audio, `--audio-only` mode is activated automatically.

#### Profile: `sw-fast`

`--profile=sw-fast` (introduced in mpv 0.30.0) enables options that trade some quality for significantly better CPU performance during software decoding. It is the recommended profile when using `--vo=drm` because the DRM VO does not support GPU-assisted rendering. For GPU-accelerated output you would use `--vo=gpu --gpu-context=drm` with the appropriate Mesa/VAAPI/VDPAU drivers.

### Running as a systemd service

To start video playback automatically on boot (e.g. for a kiosk):

```ini
# /etc/systemd/system/play-videos.service
[Unit]
Description=Video Playback (HDMI)
After=multi-user.target

[Service]
Type=simple
User=your-user
Environment=HOME=/home/your-user
ExecStart=/usr/local/bin/play-videos --loop-playlist --shuffle /media/videos/
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now play-videos
```

> The service user must be in the `video` group to access `/dev/dri/*`. Run `install.sh` or add manually: `sudo usermod -aG video your-user`

---

## fix-audio.sh

Inspects all ALSA mixer controls and automatically fixes common issues: muted channels and zero-volume controls. Supports dry-run mode, targeting a specific card, and persisting fixes across reboots.

### Requirements

| Dependency | Provided by |
|------------|-------------|
| `amixer` | `install.sh` / `sudo apt install alsa-utils` |
| `aplay` | `install.sh` / `sudo apt install alsa-utils` |

### What it checks

- At least one ALSA playback device exists
- `Master`, `PCM`, `Speaker`, `Headphone`, and `Front` controls are unmuted and have volume > 0

### Usage

```
./fix-audio.sh [OPTIONS]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-n`, `--dry-run` | off | Show what would be fixed without applying changes |
| `-v`, `--volume <0-100>` | `100` | Target volume to set on muted/silent controls |
| `-c`, `--card <N>` | all | Target a specific card index |
| `-p`, `--persist` | off | Persist fixes across reboots via `alsactl store` |
| `-q`, `--quiet` | off | Suppress informational output (errors still shown) |
| `-h`, `--help` | — | Show usage and exit |

### Examples

```bash
# Inspect and fix all cards
./fix-audio.sh

# Preview changes without applying them
./fix-audio.sh --dry-run

# Fix and persist settings across reboots
./fix-audio.sh --persist

# Fix a specific card at 80% volume and persist
./fix-audio.sh --card 0 --volume 80 --persist

# Quiet mode (only print warnings and errors)
./fix-audio.sh --quiet --persist
```

---

## Troubleshooting

**Black screen / no video output**
- Run `--list-connectors` and confirm your HDMI connector is listed as connected.
- Specify `--connector` explicitly instead of relying on `auto`.
- Ensure the display is connected before the machine boots (KMS detects at boot time).
- Run `install.sh` and check that `/dev/dri/` devices exist.

**`ERROR: 'mpv' is not installed`**
```bash
bash cli/play-videos/install.sh
# or manually:
sudo apt install mpv
```

**Permission denied on `/dev/dri/card*`**
```bash
sudo usermod -aG video $USER
# Log out and back in, or:
newgrp video
```

**No audio / muted output**
```bash
# Run the audio fixer
./fix-audio.sh

# Or persist the fix
./fix-audio.sh --persist
```

**Permission denied on ALSA devices**
```bash
sudo usermod -aG audio $USER
# Log out and back in
```

**Poor performance / dropped frames**
- The default `sw-fast` profile is already optimised for software decoding.
- Try a lower resolution: `--mode 1280x720@60`.
- For hardware-accelerated decoding, investigate `--vo=gpu --gpu-context=drm` with the appropriate Mesa/VAAPI/VDPAU drivers.

**Multiple GPUs / wrong card**
- Use `--list-connectors` to see which connectors belong to which card.
- Override with `--device /dev/dri/card1` to target a specific GPU.

**ALSA issues not fixed by fix-audio.sh**
```bash
# Check group membership
sudo usermod -aG audio $(id -un)

# Reload ALSA
sudo alsa force-reload

# Load HDA Intel module
sudo modprobe snd_hda_intel

# List all mixer controls manually
amixer -c 0 scontents
```
