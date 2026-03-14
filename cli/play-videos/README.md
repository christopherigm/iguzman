# play-videos.sh

A bash script for playing videos on **Ubuntu Server** (or any headless Linux) via HDMI, using [mpv](https://mpv.io/) with DRM/KMS output — no desktop environment, X11, or Wayland required.

---

## Requirements

| Dependency | Install |
|------------|---------|
| `mpv` ≥ 0.30.0 | `sudo apt install mpv` |
| `bash` ≥ 4.0 | pre-installed on Ubuntu |
| DRM-capable GPU | Intel, AMD, or NVIDIA (open drivers) |
| HDMI-connected display | plugged in before boot for reliable KMS detection |

> **Note:** The script uses `--vo=drm` (Direct Rendering Manager / Kernel Mode Setting), which bypasses the display server entirely. The display must be connected and recognised by the kernel as a DRM connector.

---

## Installation

```bash
chmod +x play-videos.sh
# Optionally move to a location on your PATH:
sudo cp play-videos.sh /usr/local/bin/play-videos
```

---

## Usage

```
./play-videos.sh [OPTIONS] <file|directory|playlist>
```

### Positional argument

| Argument | Behaviour |
|----------|-----------|
| `file.mp4` (or any video) | Play a single video file |
| `/path/to/dir/` | Play all video files in the directory (sorted) |
| `file.m3u` / `.m3u8` / `.pls` / `.txt` | Treated as a playlist file |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--connector <name>` | `auto` | DRM connector to output on (e.g. `HDMI-A-1`, `DP-1`) |
| `--mode <WxH[@R]\|preferred\|highest>` | `preferred` | Display resolution and refresh rate (e.g. `1920x1080@60`) |
| `--loop` | off | Loop the current file infinitely |
| `--loop=<N>` | off | Loop the current file N times |
| `--loop-playlist` | off | Loop the entire playlist infinitely |
| `--loop-playlist=<N>` | off | Loop the entire playlist N times |
| `--shuffle` | off | Play files in random order |
| `--volume <0-100>` | `100` | Playback volume |
| `--mute` | off | Start with audio muted |
| `--no-fullscreen` | fullscreen on | Disable forced fullscreen |
| `--device <path>` | auto | Override DRM device (e.g. `/dev/dri/card1`) |
| `--profile <name>` | `sw-fast` | mpv profile to use |
| `--playlist <file>` | — | Explicit playlist file (same as passing the file as positional arg) |
| `--list-connectors` | — | Print available DRM connectors and modes, then exit |
| `--` | — | Pass all subsequent arguments directly to mpv |
| `-h`, `--help` | — | Show usage and exit |

---

## Examples

```bash
# Play a single video
./play-videos.sh video.mp4

# Play all videos in a directory
./play-videos.sh /media/videos/

# Kiosk / digital-signage mode: loop a folder forever, randomised
./play-videos.sh --loop-playlist --shuffle /media/videos/

# Explicit connector and resolution
./play-videos.sh --connector HDMI-A-1 --mode 1920x1080@60 video.mp4

# Find out what connectors and modes your machine exposes
./play-videos.sh --list-connectors

# Use a playlist file
./play-videos.sh playlist.m3u

# Muted playback
./play-videos.sh --mute /media/videos/

# Pass extra mpv flags (start at 1 min, play at 1.5×)
./play-videos.sh video.mp4 -- --start=00:01:00 --speed=1.5

# Multi-GPU machine: pick a specific DRM card
./play-videos.sh --device /dev/dri/card1 --connector HDMI-A-1 video.mp4
```

---

## How It Works

### DRM / KMS video output (`--vo=drm`)

mpv's DRM video output driver renders frames directly to the display via the Linux kernel's **Direct Rendering Manager** and **Kernel Mode Setting** subsystems. This means:

- No X11 / Wayland / compositor needed
- Works from a plain TTY or SSH session
- The kernel takes ownership of the display; the terminal that launched the script will be hidden behind the video output
- Hardware video decoding is **not available** in this mode (the script sets `--profile=sw-fast` to compensate with optimised software decoding)

### Connector selection (`--drm-connector`)

The DRM connector name maps to the physical port. Typical names:

| Name | Port |
|------|------|
| `HDMI-A-1` | First HDMI port |
| `HDMI-A-2` | Second HDMI port |
| `DP-1` | First DisplayPort |
| `eDP-1` | Internal laptop display |

Run `./play-videos.sh --list-connectors` to enumerate what your system exposes. `auto` selects the first active connector.

### Directory mode

When a directory is passed the script uses `find` to collect all files with common video extensions (`.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.flv`, `.m4v`, `.ts`, `.wmv`), sorts them alphabetically, and passes the list directly to mpv. Use `--shuffle` to randomise the order.

### Profile: `sw-fast`

`--profile=sw-fast` (introduced in mpv 0.30.0) enables a set of options that trade some quality for significantly better CPU performance during software decoding. It is the recommended profile when using `--vo=drm` because DRM VO does not support GPU-assisted rendering.

For GPU-accelerated output (better quality, lower CPU usage) you would use `--vo=gpu` with a DRM backend — but that requires additional GPU driver and Mesa setup beyond the scope of this script.

---

## Running as a systemd Service

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

> The service user must be in the `video` group to access `/dev/dri/*`:
> ```bash
> sudo usermod -aG video your-user
> ```

---

## Troubleshooting

**Black screen / no output**
- Run `--list-connectors` and confirm your HDMI connector is listed as connected.
- Specify `--connector` explicitly instead of relying on `auto`.
- Ensure the display is connected before the machine boots (KMS detects at boot time).

**`ERROR: 'mpv' is not installed`**
```bash
sudo apt install mpv
```

**Permission denied on `/dev/dri/card*`**
```bash
sudo usermod -aG video $USER
# Log out and back in (or reboot) for the group change to take effect
```

**Poor performance / dropped frames**
- The default `sw-fast` profile is already optimised for software decoding.
- Try a lower resolution with `--mode 1280x720@60`.
- For hardware-accelerated decoding, investigate `--vo=gpu --gpu-context=drm` with the appropriate Mesa/VAAPI/VDPAU drivers.

**Multiple GPUs / wrong card**
- Use `--list-connectors` to see which connectors belong to which card.
- Override with `--device /dev/dri/card1` to target a specific GPU.
