import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CodeBlock } from "@repo/ui/core-elements/code-block";

// ── edit-videos constants ─────────────────────────────────────────────────────

const EV_INVOKE = "bash cli/edit-videos/edit-videos.sh";

const EV_FILES =
  "Select files to process:\n" +
  "Use ↑↓ to navigate · Space to toggle · Enter to confirm\n" +
  "(a = all  ·  n = none)\n" +
  "\n" +
  "  ▶ [✓] interstellar.mkv        1.82 GB\n" +
  "    [✓] the-fall.mkv          742.10 MB\n" +
  "    [ ] arrival.mkv             1.11 GB  (already processed)\n" +
  "  ↑ 0 more above  ·  ↓ 24 more below";

const EV_FPS_PARAMS =
  "# Multiplier - how many times to multiply the original frame rate\n" +
  "# Options:  2× | 4× | 8×\n" +
  "# Default:  2\n" +
  "\n" +
  "Multiplier: 2";

const EV_STAB_PARAMS =
  "# Preset\n" +
  "# 1) Standard  - shakiness=7  accuracy=15  smoothing=30  (customizable)\n" +
  "# 2) Concert   - shakiness=5  smoothing=50  maxAngle=0.05  maxShift=30\n" +
  "\n" +
  "# Custom parameters (Standard preset, example values):\n" +
  "Shakiness   [1-10]   default: 7    # detected motion intensity\n" +
  "Accuracy    [1-15]   default: 15   # analysis accuracy (15 = max)\n" +
  "Smoothing   [0-100]  default: 30   # stabilization window in frames";

const EV_DENOISE_PARAMS =
  "Luma spatial    [0-10]  default: 4   # spatial noise reduction (luminance)\n" +
  "Chroma spatial  [0-10]  default: 4   # spatial noise reduction (color)\n" +
  "Luma temporal   [0-10]  default: 3   # frame-to-frame noise reduction (luma)\n" +
  "Chroma temporal [0-10]  default: 3   # frame-to-frame noise reduction (chroma)\n" +
  "\n" +
  "# Example - moderate denoise:\n" +
  "luma_s=5  chroma_s=5  luma_t=3  chroma_t=3";

const EV_SHARPEN_PARAMS =
  "Matrix size    [3-23, odd]  default: 5    # kernel size (larger = wider effect)\n" +
  "Luma amount    [-2.0-5.0]   default: 1.0  # luminance sharpening strength\n" +
  "Chroma amount  [-2.0-5.0]   default: 0.0  # color sharpening (0 = off)\n" +
  "\n" +
  "# Example - gentle sharpen:\n" +
  "matrix=5  luma_amount=0.8  chroma_amount=0.0";

const EV_UPSCALE_PARAMS =
  "# Shorthand:  720 | 1080 | 1440 | 2160 (or 4K)\n" +
  "# Custom WxH: 1280x720 | 3840x2160\n" +
  "#\n" +
  "# Automatically skipped if source resolution ≥ target.\n" +
  "# Default: 1080\n" +
  "Target: 1080   # → fits inside 1920×1080, aspect ratio preserved";

const EV_DOWNSIZE_PARAMS =
  "# Shorthand:  480 | 720 | 1080 | 1440 | 2160 (or 4K)\n" +
  "# Custom WxH: 854x480 | 1280x720\n" +
  "#\n" +
  "# Automatically skipped if source resolution ≤ target.\n" +
  "# Default: 1080\n" +
  "Target: 1080   # → fits inside 1920×1080, aspect ratio preserved";

const EV_COLOR_PARAMS =
  "Contrast    [0.0-2.0]    default: 1.1   # 1.0 = no change\n" +
  "Brightness  [-1.0-1.0]   default: 0.0   # 0.0 = no change\n" +
  "Saturation  [0.0-2.0]    default: 1.1   # 1.0 = no change\n" +
  "Gamma       [0.1-10.0]   default: 1.0   # 1.0 = no change\n" +
  "\n" +
  "# Example - subtle punch:\n" +
  "contrast=1.1  brightness=0.0  saturation=1.2  gamma=1.0";

const EV_COMPRESS_PARAMS =
  "# Compression level % (default: 50)\n" +
  "# Range: 1-100   (higher = smaller file, lower quality)\n" +
  "#\n" +
  "# Maps to the encoder CRF/CQ/QP; original vs. new size and the\n" +
  "# achieved reduction % are logged after each file.\n" +
  "Level: 50";

const EV_SMARTTV_PARAMS =
  "# Resolution tier\n" +
  "#   1) SD   854×480\n" +
  "#   2) HD   1280×720   (default)\n" +
  "#   3) FHD  1920×1080\n" +
  "Quality: 2\n" +
  "\n" +
  "# Bundles per tier: crop black bars → downscale → H.265 in MP4 at a tuned\n" +
  "# CRF (SD 26 · HD 24 · FHD 22, medium preset) with +faststart and the hvc1\n" +
  "# tag so Samsung AVPlay recognises the HEVC track. The container is always\n" +
  "# MP4 - MKV output would not play on the test Samsung Smart TV.\n" +
  "# Audio: DTS/TrueHD/PCM → AC3 (7.1 downmixed to 5.1); AAC/AC3/E-AC3 copied.\n" +
  "# Subtitles: text tracks kept as mov_text. DVD/VobSub bitmap tracks are\n" +
  "# offered to OCR (see below); PGS/DVB bitmap subs are still dropped.";

const EV_STREAMS_PARAMS =
  "# Prompted only when at least one file has >1 audio track or any\n" +
  "# subtitle/caption track. Choose once for the whole batch:\n" +
  "#   1) Keep all audio streams & subtitles/captions   (default)\n" +
  "#   2) Select streams & subtitles per video\n" +
  "\n" +
  "# Option 2 shows a checkbox list per qualifying file (all pre-checked):\n" +
  '[✓] Audio #0     eng  aac     5.1     "Director Commentary"\n' +
  "[✓] Audio #1     spa  ac3     stereo\n" +
  '[ ] Subtitle #0  eng  subrip  "English"\n' +
  "\n" +
  "# The video stream is always kept. Unchecked audio/subtitle tracks are\n" +
  "# dropped on re-encode and on plain remux. When the output container is MP4,\n" +
  "# DVD/VobSub bitmap subtitles can be OCR'd to text (see below); PGS/DVB\n" +
  "# bitmap subtitles are still dropped automatically.";

const EV_OCR_PARAMS =
  "# Prompted only when the output container is MP4 (Smart TV profile, or an\n" +
  "# explicit .mp4 override) AND at least one file has DVD/VobSub subtitles.\n" +
  "⚠ 1 file(s) with image subtitles (DVD/VobSub)\n" +
  "  MP4 cannot store image subtitles. OCR converts them to text (mov_text)\n" +
  "  without burning them into the video.\n" +
  "  Detected languages: eng spa\n" +
  "OCR image subtitles to text? [y/n] (y): y\n" +
  "\n" +
  "# Needs tesseract; offers to `sudo apt-get install` it plus the language\n" +
  "# data on first use. Declining leaves the bitmap tracks dropped, as before.\n" +
  "# Pipeline: FFmpeg rasterises each subtitle track (sub2video) → tesseract\n" +
  "# reads the bitmaps → SubRip → muxed back in as mov_text with its language\n" +
  "# tag. Adds a few minutes per track and can make recognition errors.";

const EV_RIFE_PARAMS =
  "# Multiplier (default: 2)\n" +
  "# Options: 2× | 4× | 8×\n" +
  "Multiplier: 2\n" +
  "\n" +
  "# Model: auto-selected from ~/.local/share/edit-videos/rife/\n" +
  "# Preferred: rife-v4.6";

const EV_VIDEO2X_PARAMS =
  "# Scale factor (default: 2)\n" +
  "# Options: 2× | 4×\n" +
  "Scale: 2\n" +
  "\n" +
  "# Model (default: realesr-animevideov3)\n" +
  "# Options: realesr-animevideov3 | realesrgan-x4plus | realesr-general-x4v3\n" +
  "Model: realesr-animevideov3";

const EV_DEEP3D_PARAMS =
  "Stability  [1-50]  default: 12  # optical-flow smoothing window (frames)\n" +
  "\n" +
  "# Example - stronger stabilization:\n" +
  "Stability: 20";

const EV_TIKTOK_PARAMS =
  "# LLM model served by Ollama  (default: gemma4:latest)\n" +
  "Model: gemma4:latest\n" +
  "\n" +
  "Min score       [1-10]   default: 7   # frames below this score are dropped\n" +
  "Clip min        [1-10s]  default: 3   # shortest allowed clip\n" +
  "Clip max        [1-30s]  default: 7   # longest allowed clip\n" +
  "Frame interval  [1-30s]  default: 5   # seconds between sampled frames\n" +
  "\n" +
  "# Optional background music:\n" +
  "Music file:       /path/to/music.mp3   # leave blank to skip\n" +
  "Original volume:  0.7\n" +
  "Music volume:     0.3";

// ── docker-cleanup constants ──────────────────────────────────────────────────

const DC_INVOKE =
  "bash cli/docker-cleanup/docker-cleanup.sh\n" +
  "bash cli/docker-cleanup/docker-cleanup.sh --dry-run     # preview only - no deletions\n" +
  "bash cli/docker-cleanup/docker-cleanup.sh --no-color    # disable ANSI colors";

const DC_OLD_PARAMS =
  "# Age threshold - prompted only when this operation is selected\n" +
  "Age threshold in days  default: 10";

// ── play-videos constants ─────────────────────────────────────────────────────

const PV_INVOKE =
  "bash cli/play-videos/play-videos.sh [OPTIONS] <file|dir|playlist>\n" +
  "bash cli/play-videos/play-videos.sh                # no arguments: interactive menu";

const PV_MENU =
  "# Run with no arguments to open an interactive (arrow-key) menu.\n" +
  "# Picks an en/es language on start; stays open until you choose Exit.\n" +
  "# Every entry maps to a flag below, and configures the current session:\n" +
  "Play media (audio or video)     # the positional <file/dir/playlist>\n" +
  "Audio device                    # --audio-device  (built from aplay -l)\n" +
  "Video connector                 # --connector     (built from mpv's DRM probe)\n" +
  "Display mode                    # --mode\n" +
  "Loop                            # --loop / --loop=<N>\n" +
  "Volume                          # --volume\n" +
  "Max ALSA mixer                  # --no-max-volume  (on by default)\n" +
  "Enhance (GPU)                   # --enhance / --sdr-to-hdr\n" +
  "Audio output                    # --ao\n" +
  "Shuffle / Mute / Audio-only     # --shuffle / --mute / --audio-only\n" +
  "List connectors / audio devices # --list-connectors / --list-audio-devices\n" +
  "Fix audio / video issues        # runs fix-video.sh + fix-audio.sh\n" +
  "Help: playback keys             # shows the in-playback key bindings below\n" +
  "Exit";

const PV_CONTROLS =
  "# Keys while a video / audio file is playing (mpv). The menu's\n" +
  "# 'Help: playback keys' entry prints this same list.\n" +
  "Space / p     Pause / resume\n" +
  "Left / Right  Seek backward / forward 5s\n" +
  "Up / Down     Volume up / down\n" +
  "9 / 0         Volume down / up  (mpv default)\n" +
  "m             Mute / unmute\n" +
  "f             Toggle fullscreen\n" +
  "< / >         Previous / next in playlist\n" +
  "[ / ]         Slower / faster playback speed\n" +
  "j             Cycle subtitle tracks\n" +
  "#             Cycle audio tracks\n" +
  "q / Esc       Quit";

const PV_EXAMPLES =
  "./play-videos.sh video.mp4\n" +
  "./play-videos.sh /media/videos/\n" +
  "./play-videos.sh --loop --shuffle /media/\n" +
  "./play-videos.sh --loop=3 --volume 80 video.mp4\n" +
  "./play-videos.sh --audio-only --loop --shuffle /media/music/\n" +
  "./play-videos.sh --playlist my-playlist.m3u --loop-playlist --shuffle\n" +
  "./play-videos.sh --connector HDMI-A-1 --mode 1920x1080@60 video.mp4\n" +
  "./play-videos.sh --ao alsa --audio-device 'alsa/hdmi:CARD=PCH,DEV=3' video.mp4\n" +
  "./play-videos.sh --list-connectors\n" +
  "./play-videos.sh --list-audio-devices\n" +
  "./play-videos.sh video.mp4 -- --brightness=10 --contrast=5";

const PV_MEDIA_FLAGS =
  "--playlist <file>    # treat <file> as a playlist (.m3u / .m3u8 / .pls / .txt)\n" +
  "--audio-only         # force audio-only mode - skips DRM video output";

const PV_PLAYBACK_FLAGS =
  "--loop [N|inf]           # loop current file N times or infinitely  (default when bare: inf)\n" +
  "--loop-playlist [N|inf]  # loop entire playlist  (default when bare: inf)\n" +
  "--shuffle                # shuffle playlist order\n" +
  "--no-fullscreen          # disable fullscreen  (fullscreen is on by default)";

const PV_DISPLAY_FLAGS =
  "--connector <name>      # DRM connector  (default: auto)\n" +
  "                        # Example: HDMI-A-1\n" +
  "--mode <WxH[@R]>        # display mode: preferred | highest | WxH[@R]  (default: preferred)\n" +
  "                        # Example: 1920x1080@60\n" +
  "--device <path>         # DRM device path  (default: auto, e.g. /dev/dri/card1)\n" +
  "--profile <name>        # mpv profile  (default: sw-fast - recommended for DRM VO)\n" +
  "--list-connectors       # list available connectors and modes, then exit";

const PV_AUDIO_FLAGS =
  "--volume <0-100>          # playback volume  (default: 100)\n" +
  "                          # mpv's SOFTWARE volume - never touches the ALSA mixer\n" +
  "--mute                    # mute audio\n" +
  "--no-max-volume           # do not raise the ALSA hardware mixer before playback\n" +
  "--ao <driver>             # audio output driver  (default: alsa)\n" +
  "                          # Options: alsa | pulse | pipewire | jack | auto\n" +
  "--audio-device <device>   # audio device string  (default: auto)\n" +
  "                          # Example: alsa/hdmi:CARD=PCH,DEV=3\n" +
  "                          # Example: alsa/plughw:CARD=rt5650,DEV=0\n" +
  "--list-audio-devices      # list available ALSA devices, then exit\n" +
  "\n" +
  "# Two independent volume layers. Because --volume is software-only, a Master\n" +
  "# left at 20% (or a muted HDMI IEC958 switch) stays quiet whatever mpv is told.\n" +
  "# So before every playback play-videos.sh opens the hardware all the way up:\n" +
  "fix-audio.sh --force --quiet --volume 100 [--card <from --audio-device>]\n" +
  "\n" +
  "# The mixer KEEPS that level after playback - nothing is restored.\n" +
  "# Use --no-max-volume (or the menu toggle) to leave the system mixer alone.\n" +
  "# A pure HDMI card has no Master at all, only an IEC958 on/off switch, so\n" +
  "# there is no hardware level to raise - attenuate with --volume instead.";

const PV_ADVANCED_FLAGS =
  "-- <mpv-args...>   # pass remaining arguments directly to mpv\n" +
  "\n" +
  "# Example:\n" +
  "./play-videos.sh video.mp4 -- --brightness=10 --contrast=5";

const PV_FIX =
  "# The menu's 'Fix audio / video issues' entry runs both sibling scripts.\n" +
  "# They also run standalone:\n" +
  "bash cli/play-videos/fix-video.sh                        # diagnose + repair\n" +
  "bash cli/play-videos/fix-video.sh --dry-run              # diagnose only\n" +
  "sudo bash cli/play-videos/fix-video.sh --yes             # apply, no prompts\n" +
  "sudo bash cli/play-videos/fix-video.sh --yes --headless  # also drop the desktop\n" +
  "bash cli/play-videos/fix-audio.sh                        # muted / 0% ALSA controls\n" +
  "bash cli/play-videos/fix-audio.sh --force                # every control to 100%\n" +
  "\n" +
  "# --vo=drm renders onto the HDMI console, so it needs all three at once:\n" +
  "#   1. A real console VT   Ctrl+Alt+F1 on the machine. SSH can never work.\n" +
  "#                          mpv: 'VT_GETMODE failed'\n" +
  "#   2. Atomic modesetting  the legacy 'radeon' driver has none, and amdgpu\n" +
  "#                          leaves Display Core off on old DCE-8 GPUs.\n" +
  "#                          mpv: 'Failed to create DRM atomic context'\n" +
  "#   3. DRM master          a running display manager owns the GPU.\n" +
  "\n" +
  "# Old AMD APUs (Temash / Kabini / Kaveri / Beema / Mullins) need all five\n" +
  "# kernel params as one unit - amdgpu.dc=1 does nothing unless amdgpu owns the\n" +
  "# card. fix-video.sh writes them to /etc/default/grub (timestamped backup),\n" +
  "# runs update-grub, and asks you to reboot:\n" +
  'GRUB_CMDLINE_LINUX_DEFAULT="... radeon.si_support=0 radeon.cik_support=0\n' +
  '                                amdgpu.si_support=1 amdgpu.cik_support=1 amdgpu.dc=1"\n' +
  "\n" +
  "# Verify after rebooting - all three must pass:\n" +
  "lspci -k | grep -A2 -i vga             # Kernel driver in use: amdgpu\n" +
  "cat /sys/module/amdgpu/parameters/dc   # 1\n" +
  "sudo dmesg | grep -i 'display core'    # Display Core initialized";

// ── server-audit constants ────────────────────────────────────────────────────

const SA_INVOKE =
  "sudo bash cli/server-audit/server-audit.sh\n" +
  "sudo bash cli/server-audit/server-audit.sh --no-color   # plain output for logging";

const SA_CHECKS =
  " 1. System Information    hostname, OS, kernel, arch, uptime, CPU count, load average\n" +
  " 2. Firewall (UFW)        active/inactive; iptables fallback detection\n" +
  " 3. Open / Listening Ports  TCP + UDP: known-safe vs. unexpected; loopback excluded\n" +
  " 4. User Accounts         UID-0 duplicates, empty passwords, sudo members, last logins\n" +
  " 5. SSH Configuration     PermitRootLogin, PasswordAuthentication, MaxAuthTries, fail2ban\n" +
  " 6. Failed Login Attempts count from auth.log; top attacking source IPs\n" +
  " 7. Process Health        zombie processes, temp-path executables, top CPU/memory consumers\n" +
  " 8. Resource Usage        load average, memory + swap, disk per mount, NIC error counters\n" +
  " 9. Pending Updates       upgradable packages, security patches, unattended-upgrades\n" +
  "10. MicroK8s              running state, node readiness, unhealthy pods, API exposure\n" +
  "11. Plex Media Server     service status, port 32400, running user (alerts if root)\n" +
  "12. Samba                 smbd/nmbd status, guest shares, interface binding, min SMB protocol\n" +
  "\n" +
  "Severity levels: CRITICAL · HIGH · MEDIUM · LOW · INFO\n" +
  "Each finding includes a mitigation command in the summary.";

// ── setup-wifi constants ───────────────────────────────────────────────────────

const SW_INVOKE =
  "pnpm setup-wifi\n" +
  "# or\n" +
  "bash cli/setup-wifi/setup-wifi.sh\n" +
  "\n" +
  "# Re-runs itself with sudo (needs root for rfkill / ip link / netplan).";

const SW_FLOW =
  "Backend (auto-detected):\n" +
  "  • NetworkManager (nmcli)    — when its service is active\n" +
  "  • netplan + wpa_supplicant  — Ubuntu Server's default otherwise\n" +
  "\n" +
  "1. Detect the Wi-Fi interface (wlan0, wlp1s0, …); diagnose the\n" +
  "   hardware (PCI/USB, firmware hint) if none is found.\n" +
  "2. Fix the card:   rfkill unblock · radio on · interface up\n" +
  "3. Connect:        scan → pick SSID (or type it) → password →\n" +
  "                   verify association + IP\n" +
  "4. Already connected → switch to another network or disconnect\n" +
  "\n" +
  "Persistent: nmcli saves an auto-connect profile; netplan writes\n" +
  "/etc/netplan/90-setup-wifi.yaml (mode 600) and runs netplan apply.";

// ── Component ─────────────────────────────────────────────────────────────────

export async function ToolsPanel() {
  const t = await getTranslations("HomePage");

  return (
    <>
      {/* ─── edit-videos ─── */}
      <ScriptHeader
        title={t("toolsEvScriptTitle")}
        description={t("toolsEvScriptDesc")}
      />

      <EvSection
        heading={t("toolsEditVideosInvokeHeading")}
        description={t("toolsEditVideosInvokeDescription")}
        code={EV_INVOKE}
      />
      <EvSection
        heading={t("toolsEvFlowHeading")}
        description={t("toolsEvFlowDescription")}
      />
      <EvSection
        heading={t("toolsEvFilesHeading")}
        description={t("toolsEvFilesDesc")}
        code={EV_FILES}
      />

      <GroupLabel>{t("toolsEvFiltersGroup")}</GroupLabel>

      <EvSection
        heading={t("toolsEvBlackBarsHeading")}
        description={t("toolsEvBlackBarsDesc")}
      />
      <EvSection
        heading={t("toolsEvFpsHeading")}
        description={t("toolsEvFpsDesc")}
        code={EV_FPS_PARAMS}
      />
      <EvSection
        heading={t("toolsEvStabHeading")}
        description={t("toolsEvStabDesc")}
        code={EV_STAB_PARAMS}
      />
      <EvSection
        heading={t("toolsEvDenoiseHeading")}
        description={t("toolsEvDenoiseDesc")}
        code={EV_DENOISE_PARAMS}
      />
      <EvSection
        heading={t("toolsEvSharpenHeading")}
        description={t("toolsEvSharpenDesc")}
        code={EV_SHARPEN_PARAMS}
      />
      <EvSection
        heading={t("toolsEvUpscaleHeading")}
        description={t("toolsEvUpscaleDesc")}
        code={EV_UPSCALE_PARAMS}
      />
      <EvSection
        heading={t("toolsEvDownsizeHeading")}
        description={t("toolsEvDownsizeDesc")}
        code={EV_DOWNSIZE_PARAMS}
      />
      <EvSection
        heading={t("toolsEvColorHeading")}
        description={t("toolsEvColorDesc")}
        code={EV_COLOR_PARAMS}
      />
      <EvSection
        heading={t("toolsEvCompressHeading")}
        description={t("toolsEvCompressDesc")}
        code={EV_COMPRESS_PARAMS}
      />
      <EvSection
        heading={t("toolsEvMpgHeading")}
        description={t("toolsEvMpgDesc")}
      />
      <EvSection
        heading={t("toolsEvSmartTvHeading")}
        description={t("toolsEvSmartTvDesc")}
        code={EV_SMARTTV_PARAMS}
      />
      <EvSection
        heading={t("toolsEvStreamsHeading")}
        description={t("toolsEvStreamsDesc")}
        code={EV_STREAMS_PARAMS}
      />
      <EvSection
        heading={t("toolsEvOcrHeading")}
        description={t("toolsEvOcrDesc")}
        code={EV_OCR_PARAMS}
      />

      <GroupLabel marginTop={8}>{t("toolsEvAiGroup")}</GroupLabel>

      <EvSection
        heading={t("toolsEvRifeHeading")}
        description={t("toolsEvRifeDesc")}
        code={EV_RIFE_PARAMS}
      />
      <EvSection
        heading={t("toolsEvVideo2xHeading")}
        description={t("toolsEvVideo2xDesc")}
        code={EV_VIDEO2X_PARAMS}
      />
      <EvSection
        heading={t("toolsEvDeep3dHeading")}
        description={t("toolsEvDeep3dDesc")}
        code={EV_DEEP3D_PARAMS}
      />
      <EvSection
        heading={t("toolsEvTiktokHeading")}
        description={t("toolsEvTiktokDesc")}
        code={EV_TIKTOK_PARAMS}
      />

      <ScriptDivider />

      {/* ─── docker-cleanup ─── */}
      <ScriptHeader
        title={t("toolsDcSection")}
        description={t("toolsDcDescription")}
      />

      <EvSection
        heading={t("toolsDcInvokeHeading")}
        description={t("toolsDcInvokeDescription")}
        code={DC_INVOKE}
      />
      <EvSection
        heading={t("toolsDcFlowHeading")}
        description={t("toolsDcFlowDescription")}
      />

      <GroupLabel>{t("toolsDcDockerOpsGroup")}</GroupLabel>

      <EvSection
        heading={t("toolsDcDanglingHeading")}
        description={t("toolsDcDanglingDesc")}
      />
      <EvSection
        heading={t("toolsDcOldHeading")}
        description={t("toolsDcOldDesc")}
        code={DC_OLD_PARAMS}
      />
      <EvSection
        heading={t("toolsDcAllUnusedHeading")}
        description={t("toolsDcAllUnusedDesc")}
      />
      <EvSection
        heading={t("toolsDcStoppedHeading")}
        description={t("toolsDcStoppedDesc")}
      />
      <EvSection
        heading={t("toolsDcCacheHeading")}
        description={t("toolsDcCacheDesc")}
      />
      <EvSection
        heading={t("toolsDcSystemPruneHeading")}
        description={t("toolsDcSystemPruneDesc")}
      />

      <ScriptDivider />

      {/* ─── play-videos ─── */}
      <ScriptHeader
        title={t("toolsPvSection")}
        description={t("toolsPvDescription")}
      />

      <EvSection
        heading={t("toolsPvInvokeHeading")}
        description={t("toolsPvInvokeDescription")}
        code={PV_INVOKE}
      />
      <EvSection
        heading={t("toolsPvMenuHeading")}
        description={t("toolsPvMenuDesc")}
        code={PV_MENU}
      />
      <EvSection
        heading={t("toolsPvControlsHeading")}
        description={t("toolsPvControlsDesc")}
        code={PV_CONTROLS}
      />
      <EvSection
        heading={t("toolsPvExamplesHeading")}
        description={t("toolsPvExamplesDescription")}
        code={PV_EXAMPLES}
      />
      <EvSection
        heading={t("toolsPvMediaHeading")}
        description={t("toolsPvMediaDesc")}
        code={PV_MEDIA_FLAGS}
      />
      <EvSection
        heading={t("toolsPvPlaybackHeading")}
        description={t("toolsPvPlaybackDesc")}
        code={PV_PLAYBACK_FLAGS}
      />
      <EvSection
        heading={t("toolsPvDisplayHeading")}
        description={t("toolsPvDisplayDesc")}
        code={PV_DISPLAY_FLAGS}
      />
      <EvSection
        heading={t("toolsPvAudioHeading")}
        description={t("toolsPvAudioDesc")}
        code={PV_AUDIO_FLAGS}
      />
      <EvSection
        heading={t("toolsPvAdvancedHeading")}
        description={t("toolsPvAdvancedDesc")}
        code={PV_ADVANCED_FLAGS}
      />
      <EvSection
        heading={t("toolsPvFixHeading")}
        description={t("toolsPvFixDesc")}
        code={PV_FIX}
      />

      <ScriptDivider />

      {/* ─── server-audit ─── */}
      <ScriptHeader
        title={t("toolsSaSection")}
        description={t("toolsSaDescription")}
      />

      <EvSection
        heading={t("toolsSaInvokeHeading")}
        description={t("toolsSaInvokeDescription")}
        code={SA_INVOKE}
      />
      <EvSection
        heading={t("toolsSaChecksHeading")}
        description={t("toolsSaChecksDescription")}
        code={SA_CHECKS}
      />

      <ScriptDivider />

      {/* ─── setup-wifi ─── */}
      <ScriptHeader
        title={t("toolsSwSection")}
        description={t("toolsSwDescription")}
      />

      <EvSection
        heading={t("toolsSwInvokeHeading")}
        description={t("toolsSwInvokeDescription")}
        code={SW_INVOKE}
      />
      <EvSection
        heading={t("toolsSwFlowHeading")}
        description={t("toolsSwFlowDescription")}
        code={SW_FLOW}
      />
    </>
  );
}

function EvSection({
  heading,
  description,
  code,
}: {
  heading: string;
  description: string;
  code?: string;
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
      {code && <CodeBlock language="bash" code={code} />}
    </Box>
  );
}

function ScriptHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h2">
        {title}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
    </Box>
  );
}

function ScriptDivider() {
  return (
    <Box
      marginTop={8}
      marginBottom={48}
      styles={{ borderTop: "1px solid rgba(128, 128, 128, 0.15)" }}
    />
  );
}

function GroupLabel({
  children,
  marginTop,
}: {
  children: React.ReactNode;
  marginTop?: number;
}) {
  return (
    <Typography
      as="p"
      variant="none"
      color="var(--foreground-muted)"
      fontWeight={600}
      marginTop={marginTop}
      marginBottom={24}
      styles={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </Typography>
  );
}
