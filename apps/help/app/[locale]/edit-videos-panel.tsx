import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CodeBlock } from "@repo/ui/core-elements/code-block";

// ── edit-videos constants ─────────────────────────────────────────────────────

const EV_INVOKE = "bash cli/edit-videos/edit-videos.sh";

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
  "bash cli/play-videos/play-videos.sh [OPTIONS] <file|dir|playlist>";

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
  "--mute                    # mute audio\n" +
  "--ao <driver>             # audio output driver  (default: alsa)\n" +
  "                          # Options: alsa | pulse | pipewire | jack | auto\n" +
  "--audio-device <device>   # audio device string  (default: auto)\n" +
  "                          # Example: alsa/hdmi:CARD=PCH,DEV=3\n" +
  "                          # Example: alsa/plughw:CARD=rt5650,DEV=0\n" +
  "--list-audio-devices      # list available ALSA devices, then exit";

const PV_ADVANCED_FLAGS =
  "-- <mpv-args...>   # pass remaining arguments directly to mpv\n" +
  "\n" +
  "# Example:\n" +
  "./play-videos.sh video.mp4 -- --brightness=10 --contrast=5";

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
