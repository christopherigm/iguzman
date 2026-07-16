# play-videos

A collection of bash scripts for playing media on **Ubuntu Server** (or any headless Linux) via HDMI, using [mpv](https://mpv.io/) with DRM/KMS output - no desktop environment, X11, or Wayland required.

---

## Scripts

| Script                             | Description                                        |
| ---------------------------------- | -------------------------------------------------- |
| [`install.sh`](#installsh)         | Install all dependencies and configure user groups |
| [`play-videos.sh`](#play-videossh) | Play video and audio files via DRM/KMS output      |
| [`fix-video.sh`](#fix-videosh)     | Inspect and fix DRM/KMS video-output issues        |
| [`fix-audio.sh`](#fix-audiosh)     | Inspect and fix common ALSA audio issues           |

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

| Package      | Why                                                                |
| ------------ | ------------------------------------------------------------------ |
| `mpv`        | Media player with DRM/KMS video output                             |
| `alsa-utils` | Provides `aplay` and `amixer` for audio device listing and control |
| `libdrm2`    | Userspace DRM library required for `--vo=drm` KMS output           |

### Groups configured

| Group    | Why                                                                       |
| -------- | ------------------------------------------------------------------------- |
| `video`  | Read/write access to `/dev/dri/card*` for DRM/KMS video output            |
| `audio`  | Access to ALSA sound devices                                              |
| `render` | Access to `/dev/dri/renderD*` GPU render nodes (required on some distros) |

Supported package managers: `apt` (Debian/Ubuntu), `dnf` (Fedora), `yum` (RHEL/CentOS), `brew` (macOS).

### Usage

```bash
bash cli/play-videos/install.sh
```

> **Note:** If any group membership was changed, you must **log out and back in** (or reboot) for the changes to take effect. To apply a single group without logging out: `newgrp video`. Verify with `id`.

---

## play-videos.sh

Plays video and audio files via mpv's `--vo=drm` (Direct Rendering Manager / Kernel Mode Setting) output. Renders directly to the display through the Linux kernel - no X11, Wayland, or compositor needed. Works from a plain TTY or SSH session.

### Requirements

| Dependency             | Provided by                                       |
| ---------------------- | ------------------------------------------------- |
| `mpv` ≥ 0.30.0         | `install.sh` / `sudo apt install mpv`             |
| `bash` ≥ 4.0           | Pre-installed on Ubuntu                           |
| DRM-capable GPU        | Intel, AMD, or NVIDIA (open drivers)              |
| HDMI-connected display | Plugged in before boot for reliable KMS detection |

### Usage

```
./play-videos.sh [OPTIONS] <file|directory|playlist>
./play-videos.sh                              # no arguments: interactive menu
```

#### Interactive menu

Run `play-videos.sh` with **no arguments** to open a `setup-wifi`-style
interactive menu (arrow keys to navigate, Enter to select, Ctrl+C to quit). It
picks up an `en`/`es` language choice on start and stays open until you choose
**Exit**, so you can adjust settings and play repeatedly without re-invoking the
script. Every flag below has an equivalent menu entry:

| Menu entry                      | Equivalent flag(s)                           |
| ------------------------------- | -------------------------------------------- |
| Play media (audio or video)     | the positional `<file/dir/playlist>`         |
| Audio device                    | `--audio-device` (built from `aplay -l`)     |
| Video connector                 | `--connector` (built from mpv's DRM probe)   |
| Display mode                    | `--mode`                                     |
| Loop                            | `--loop` / `--loop=<N>`                      |
| Volume                          | `--volume`                                   |
| Max ALSA mixer                  | `--no-max-volume` (on by default)            |
| Enhance (GPU)                   | `--enhance` / `--sdr-to-hdr`                 |
| Audio output                    | `--ao`                                       |
| Shuffle / Mute / Audio-only     | `--shuffle` / `--mute` / `--audio-only`      |
| List connectors / audio devices | `--list-connectors` / `--list-audio-devices` |
| Fix audio / video issues        | runs `fix-video.sh` + `fix-audio.sh`         |

The last-played path is remembered and offered as the default the next time you
choose **Play media**.

#### Positional argument

| Argument                               | Behaviour                                      |
| -------------------------------------- | ---------------------------------------------- |
| `file.mp4` (or any video/audio file)   | Play a single file                             |
| `/path/to/dir/`                        | Play all media files in the directory (sorted) |
| `file.m3u` / `.m3u8` / `.pls` / `.txt` | Treated as a playlist file                     |

#### Options

| Option                                 | Default       | Description                                                      |
| -------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `--connector <name>`                   | `auto`        | DRM connector to output on (e.g. `HDMI-A-1`, `DP-1`)             |
| `--mode <WxH[@R]\|preferred\|highest>` | `preferred`   | Display resolution and refresh rate (e.g. `1920x1080@60`)        |
| `--device <path>`                      | auto          | Override DRM device (e.g. `/dev/dri/card1`)                      |
| `--profile <name>`                     | `sw-fast`     | mpv profile to use                                               |
| `--loop`                               | off           | Loop the current file infinitely                                 |
| `--loop=<N>`                           | off           | Loop the current file N times                                    |
| `--loop-playlist`                      | off           | Loop the entire playlist infinitely                              |
| `--loop-playlist=<N>`                  | off           | Loop the entire playlist N times                                 |
| `--shuffle`                            | off           | Play files in random order                                       |
| `--volume <0-100>`                     | `100`         | Playback volume (mpv's **software** volume, not the ALSA mixer)  |
| `--mute`                               | off           | Start with audio muted                                           |
| `--no-max-volume`                      | mixer maxed   | Do not raise the ALSA hardware mixer to 100% before playback     |
| `--no-fullscreen`                      | fullscreen on | Disable forced fullscreen                                        |
| `--audio-only`                         | auto          | Force audio-only mode (skips DRM video output)                   |
| `--ao <driver>`                        | `alsa`        | Audio output driver: `alsa`, `pulse`, `pipewire`, `jack`, `auto` |
| `--audio-device <device>`              | auto          | ALSA device string (e.g. `alsa/hdmi:CARD=PCH,DEV=3`)             |
| `--playlist <file>`                    | -             | Explicit playlist file                                           |
| `--list-connectors`                    | -             | Print available DRM connectors and modes, then exit              |
| `--list-audio-devices`                 | -             | Print available ALSA audio devices, then exit                    |
| `--`                                   | -             | Pass all subsequent arguments directly to mpv                    |
| `-h`, `--help`                         | -             | Show usage and exit                                              |

#### Volume: two independent layers

`--volume` is mpv's **software** volume - it never touches the ALSA hardware mixer. A `Master` control left at 20%, or an HDMI `IEC958` switch left muted, therefore makes playback quiet no matter what `--volume` says.

So before every playback `play-videos.sh` opens the hardware all the way up: it runs `fix-audio.sh --force --quiet --volume 100`, which sets every volume-capable control on the card in use to 100%, unmutes it, and unmutes the `IEC958` switch. `--volume` is then the only thing setting the actual level.

- The card is taken from `--audio-device` when given (`alsa/hdmi:CARD=PCH,DEV=3` → card `PCH`); otherwise every card is raised.
- **The mixer keeps that level after playback ends** - nothing is restored. Pass `--no-max-volume` (or toggle **Max ALSA mixer** off in the menu) on a machine where you don't want the system mixer touched.
- A pure HDMI card exposes no `Master` at all, only `IEC958` switches, so there is no hardware level to raise - only the mute is cleared. Attenuate with `--volume` instead.

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
- Hardware video decoding is **not available** in this mode - the script sets `--profile=sw-fast` to compensate with optimised software decoding

#### Connector selection (`--drm-connector`)

The DRM connector name maps to the physical port. Typical names:

| Name       | Port                    |
| ---------- | ----------------------- |
| `HDMI-A-1` | First HDMI port         |
| `HDMI-A-2` | Second HDMI port        |
| `DP-1`     | First DisplayPort       |
| `eDP-1`    | Internal laptop display |

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

## fix-video.sh

Diagnoses why `--vo=drm` will not start, and repairs the driver-side causes by writing kernel parameters to `/etc/default/grub`.

mpv's DRM output needs **three things at once**. When any one is missing, mpv prints a message that names the symptom but not the cause:

| Requirement        | What breaks without it                                     | mpv says                                 |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------- |
| A real console VT  | SSH and terminal emulators cannot drive DRM output         | `VT_GETMODE failed`                      |
| Atomic modesetting | `radeon` has none; `amdgpu` disables Display Core on DCE-8 | `Failed to create DRM atomic context`    |
| DRM master         | A running display manager owns the GPU                     | (silent, or fails to acquire the device) |

### The AMD case

Old AMD APUs - **Temash, Kabini, Kaveri, Beema, Mullins** (GCN/CIK) - bind to the legacy `radeon` driver, which has **no atomic KMS**. Forcing `amdgpu` fixes that, but `amdgpu` then falls back to its _own_ legacy display path on DCE-8 hardware, which also has no atomic. Display Core must be forced on as well.

All five parameters are **a single unit**: `amdgpu.dc=1` does nothing unless `amdgpu` owns the card, and `amdgpu` will not claim it while `radeon.*_support` is enabled.

```
GRUB_CMDLINE_LINUX_DEFAULT="... radeon.si_support=0 radeon.cik_support=0 amdgpu.si_support=1 amdgpu.cik_support=1 amdgpu.dc=1"
```

`fix-video.sh` shows the diff, backs up `/etc/default/grub` with a timestamp, applies the change, and runs `update-grub`. It **never reboots on its own**.

Verify after rebooting - all three must pass:

```bash
lspci -k | grep -A2 -i vga            # Kernel driver in use: amdgpu
cat /sys/module/amdgpu/parameters/dc  # 1
sudo dmesg | grep -i 'display core'   # [drm] Display Core initialized with v...
```

### What it checks

- `/dev/dri` DRM devices exist and the user is in the `video` group
- The session is a real console VT (not SSH, not a terminal emulator)
- No display manager / compositor is holding DRM master
- The GPU's kernel driver supports atomic modesetting:
  - `radeon` → offers the `amdgpu` switch (GRUB, needs reboot)
  - `amdgpu` with Display Core off → offers `amdgpu.dc=1` (GRUB, needs reboot)
  - `nvidia-drm` → reports the `modeset=1` requirement (not auto-applied)

### Usage

```
./fix-video.sh [OPTIONS]
```

| Option            | Default | Description                                                      |
| ----------------- | ------- | ---------------------------------------------------------------- |
| `-n`, `--dry-run` | off     | Show what would be fixed without applying changes                |
| `-y`, `--yes`     | off     | Apply GRUB fixes without prompting (never reboots)               |
| `-q`, `--quiet`   | off     | Suppress informational output (errors still shown)               |
| `--headless`      | off     | Also set the boot target to `multi-user.target`, freeing the GPU |
| `-h`, `--help`    | -       | Show usage and exit                                              |

Exits `0` when there was nothing to fix (or everything was fixed), `1` when issues remain.

### Examples

```bash
# Diagnose and repair interactively
./fix-video.sh

# Diagnose only - change nothing
./fix-video.sh --dry-run

# Unattended repair, e.g. while re-imaging a server
sudo ./fix-video.sh --yes

# Dedicated media box: also drop to a no-desktop boot target
sudo ./fix-video.sh --yes --headless
```

> `--vo=drm` cannot render over SSH no matter what this script fixes. Run playback from the machine's own keyboard (`Ctrl+Alt+F1`), or hand mpv a VT with `sudo openvt -s -w -- ./play-videos.sh <file>`.

---

## fix-audio.sh

Inspects all ALSA mixer controls and automatically fixes common issues: muted channels and zero-volume controls. Supports dry-run mode, targeting a specific card, and persisting fixes across reboots.

### Requirements

| Dependency | Provided by                                  |
| ---------- | -------------------------------------------- |
| `amixer`   | `install.sh` / `sudo apt install alsa-utils` |
| `aplay`    | `install.sh` / `sudo apt install alsa-utils` |

### What it checks

- At least one ALSA playback device exists
- `Master`, `PCM`, `Speaker`, `Headphone`, and `Front` controls are unmuted and have volume > 0
- `IEC958` (the S/PDIF + HDMI switch) is unmuted. It carries **no volume level**, so it is only ever unmuted, never given a percentage.

By default only _broken_ controls (muted, or at 0%) are touched - a control you deliberately set to 40% is left alone. `--force` overrides that and sets every volume-capable control to `--volume`.

### Usage

```
./fix-audio.sh [OPTIONS]
```

| Option                   | Default | Description                                                       |
| ------------------------ | ------- | ----------------------------------------------------------------- |
| `-n`, `--dry-run`        | off     | Show what would be fixed without applying changes                 |
| `-f`, `--force`          | off     | Set **every** control to `--volume` and unmute, even healthy ones |
| `-v`, `--volume <0-100>` | `100`   | Target volume to set                                              |
| `-c`, `--card <N\|name>` | all     | Target a specific card index or name (e.g. `0`, `PCH`)            |
| `-p`, `--persist`        | off     | Persist fixes across reboots via `alsactl store`                  |
| `-q`, `--quiet`          | off     | Suppress banner, summary and informational output                 |
| `-h`, `--help`           | -       | Show usage and exit                                               |

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

# Open the hardware all the way up - what play-videos.sh runs before playback
./fix-audio.sh --force --quiet --volume 100

# Max out one card by name, and make it survive a reboot
./fix-audio.sh --force --card PCH --persist
```

---

## Troubleshooting

**Start here:** `./fix-video.sh` diagnoses the three DRM requirements and fixes the driver-side ones. `./fix-audio.sh` handles muted/zero-volume ALSA controls. The interactive menu's **Fix audio / video issues** entry runs both.

**`Error opening/initializing the selected video_out (--vo) device`**

The video output never started, so the codec/container is irrelevant - transcoding the file will not help. It is always one of the three requirements below. Run `./fix-video.sh`.

**`VT_GETMODE failed: Inappropriate ioctl for device`**

mpv is not on a real console VT. DRM output draws onto the physical framebuffer and cannot render over an SSH pty or a terminal emulator.

```bash
# Run from the machine's own keyboard:  Ctrl+Alt+F1, log in, then play.
# Or hand mpv a VT from SSH (playback keys then come from the physical keyboard):
sudo openvt -s -w -- ./play-videos.sh video.mp4
```

**`Failed to create DRM atomic context, no DRM Atomic support`**

The GPU driver has no atomic modesetting. On old AMD APUs this needs both the `radeon`→`amdgpu` switch **and** `amdgpu.dc=1` - see [`fix-video.sh`](#fix-videosh).

```bash
sudo ./fix-video.sh          # applies the GRUB params, then reboot
lspci -k | grep -A2 -i vga   # confirm: Kernel driver in use: amdgpu
```

**A desktop is running and holds DRM master**

```bash
sudo systemctl stop display-manager        # just for now
sudo systemctl set-default multi-user.target && sudo reboot   # permanently
```

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

**Playback is quiet even with `--volume 100`**

`--volume` is mpv's _software_ volume and never touches the ALSA mixer. `play-videos.sh` maxes the hardware mixer for you before playback - unless you passed `--no-max-volume` or toggled **Max ALSA mixer** off. To do it by hand:

```bash
./fix-audio.sh --force            # every control to 100%, unmuted
./fix-audio.sh --force --persist  # ...and survive a reboot
amixer -c 0 scontents             # inspect what the card actually exposes
```

On a pure HDMI card there is no `Master` to raise - only an `IEC958` on/off switch. Lower the level with `--volume N` instead.

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
