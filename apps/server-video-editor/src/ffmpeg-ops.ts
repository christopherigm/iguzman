import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir, cpus } from 'os';
import { randomUUID } from 'crypto';
import { join } from 'path';

/* ── Constants ───────────────────────────────────────────────────────── */

const DEFAULT_FFMPEG = 'ffmpeg';

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Runs an FFmpeg command via spawn, parsing stderr for frame-based progress.
 * Resolves when the process exits 0, rejects on non-zero exit.
 */
const CPU_COUNT = String(cpus().length);
const THREAD_FLAGS = [
  '-threads',
  CPU_COUNT,
  '-filter_threads',
  CPU_COUNT,
  '-filter_complex_threads',
  CPU_COUNT,
];

const runFFmpeg = (
  args: string[],
  binary: string,
  onProgress?: (pct: number) => void,
  estimatedFrames?: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(binary, [...THREAD_FLAGS, ...args]);
    let stderr = '';
    let lastFrame = 0;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      if (onProgress && estimatedFrames && estimatedFrames > 0) {
        const m = text.match(/frame=\s*(\d+)/);
        if (m) {
          const frame = Number(m[1]);
          if (frame > lastFrame) {
            lastFrame = frame;
            onProgress(
              Math.min(99, Math.round((frame / estimatedFrames) * 100)),
            );
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`FFmpeg exited with code ${code}\n${stderr.slice(-500)}`),
        );
      } else {
        onProgress?.(100);
        resolve();
      }
    });

    proc.on('error', reject);
  });

interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  rotation: number;
}

/**
 * Probes a media file by parsing ffmpeg's stderr info output.
 * ffmpeg always exits non-zero when no output is given — that is expected.
 */
const probeVideo = (filePath: string, binary: string): Promise<ProbeResult> =>
  new Promise((resolve) => {
    const proc = spawn(binary, ['-i', filePath]);
    let log = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      log += chunk.toString();
    });

    proc.on('close', () => {
      const dimMatch = log.match(/(\d{2,5})x(\d{2,5})/);
      const width = dimMatch ? Number(dimMatch[1]) : 1280;
      const height = dimMatch ? Number(dimMatch[2]) : 720;

      const durMatch = log.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const durationSec = durMatch
        ? Number(durMatch[1]) * 3600 +
          Number(durMatch[2]) * 60 +
          Number(durMatch[3])
        : 0;

      const fpsMatch = log.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
      const fps = fpsMatch ? Number(fpsMatch[1]) : 30;

      const rotMatch = log.match(/rotation\s+(?:of\s+)?(-?\d+(?:\.\d+)?)/i);
      const rotation = rotMatch
        ? ((Math.round(Number(rotMatch[1])) % 360) + 360) % 360
        : 0;

      resolve({ width, height, durationSec, fps, rotation });
    });
  });

/* ── ASS subtitle types & helpers (ported from ffmpeg-worker.ts) ─────── */

type AnimationType =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'blur'
  | 'zoom'
  | 'karaoke';

export interface AnimationOptions {
  /** Which animations to apply; combine freely (karaoke is text-level, rest are line-level). Default: ['none']. */
  types?: AnimationType[];
  /** Fade: fade-in duration in ms. Default 300. */
  fadeInMs?: number;
  /** Fade: fade-out duration in ms. Default 200. */
  fadeOutMs?: number;
  /** SlideUp / SlideDown: pixel offset from the final anchor position. Default 20. */
  slideOffset?: number;
  /** SlideUp / SlideDown: travel duration in ms. Default 300. */
  slideDurationMs?: number;
  /** Blur: initial blur strength (libass units). Default 15. */
  blurStrength?: number;
  /** Blur: duration in ms to clear the blur to 0. Default 300. */
  blurDurationMs?: number;
  /** Zoom: duration in ms to scale text from 0 → 100 %. Default 300. */
  zoomDurationMs?: number;
  /** Karaoke: ASS karaoke tag variant. Default 'kf' (sweep). */
  karaokeMode?: 'k' | 'kf' | 'ko';
  /** Karaoke: highlight (sung) colour in ASS &HAABBGGRR format. Default '&H0000FFFF' (yellow). */
  karaokeHighlightColour?: string;
}

interface SrtEvent {
  startCs: number;
  endCs: number;
  text: string;
}

/** '00:01:23,456' → centiseconds */
function parseSrtTimeToCentiseconds(t: string): number {
  const [hms = '0:0:0', ms = '0'] = t.trim().split(',');
  const parts = hms.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return (h * 3600 + m * 60 + s) * 100 + Math.round(Number(ms) / 10);
}

/** centiseconds → 'H:MM:SS.CC' */
function formatAssTimestamp(cs: number): string {
  const h = Math.floor(cs / 360000);
  const rem1 = cs % 360000;
  const m = Math.floor(rem1 / 6000);
  const rem2 = rem1 % 6000;
  const s = Math.floor(rem2 / 100);
  const c = rem2 % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function parseSrt(srt: string): SrtEvent[] {
  const events: SrtEvent[] = [];
  const blocks = srt.trim().split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const tsIdx = lines.findIndex((l) => l.includes('-->'));
    if (tsIdx === -1) continue;
    const [startRaw = '', endRaw = ''] = lines[tsIdx]!.split('-->');
    const startCs = parseSrtTimeToCentiseconds(startRaw);
    const endCs = parseSrtTimeToCentiseconds(endRaw);
    const text = lines
      .slice(tsIdx + 1)
      .join('\\N')
      .trim();
    if (text) events.push({ startCs, endCs, text });
  }
  return events;
}

/**
 * Compute the default ASS anchor point for a given alignment + margins.
 * ASS [V4+ Styles] numpad alignment (1–9):
 *   7 8 9  (top)
 *   4 5 6  (middle)
 *   1 2 3  (bottom)
 */
function computeDefaultPosition(
  alignment: number,
  playResX: number,
  playResY: number,
  marginV: number,
  marginL = 10,
  marginR = 10,
): { x: number; y: number } {
  const col = (alignment - 1) % 3; // 0=left 1=center 2=right
  const row = Math.floor((alignment - 1) / 3); // 0=bottom 1=middle 2=top
  const x = col === 0 ? marginL : col === 1 ? playResX / 2 : playResX - marginR;
  const y = row === 0 ? playResY - marginV : row === 1 ? playResY / 2 : marginV;
  return { x, y };
}

/**
 * Build the ASS override tag block `{…}` for non-karaoke animation types.
 *
 * posX / posY: when provided (multi-line split), the explicit anchor is used
 * instead of the computed default.  A \pos tag is emitted unless a \move is
 * already present (slide animations embed the position in \move).
 */
function buildOverrideTags(
  types: AnimationType[],
  opts: AnimationOptions,
  playResX: number,
  playResY: number,
  alignment: number,
  marginV: number,
  posX?: number,
  posY?: number,
): string {
  const tags: string[] = [];
  const hasExplicitPos = posX !== undefined && posY !== undefined;
  let hasMove = false;

  for (const type of types) {
    switch (type) {
      case 'fade': {
        const fi = opts.fadeInMs ?? 300;
        const fo = opts.fadeOutMs ?? 200;
        tags.push(`\\fad(${fi},${fo})`);
        break;
      }
      case 'slideUp':
      case 'slideDown': {
        const offset = opts.slideOffset ?? 20;
        const dur = opts.slideDurationMs ?? 300;
        const pos = hasExplicitPos
          ? { x: posX!, y: posY! }
          : computeDefaultPosition(alignment, playResX, playResY, marginV);
        const startY = type === 'slideUp' ? pos.y + offset : pos.y - offset;
        tags.push(
          `\\move(${Math.round(pos.x)},${Math.round(startY)},${Math.round(pos.x)},${Math.round(pos.y)},0,${dur})`,
        );
        hasMove = true;
        break;
      }
      case 'blur': {
        const strength = opts.blurStrength ?? 15;
        const dur = opts.blurDurationMs ?? 300;
        tags.push(`\\blur${strength}\\t(0,${dur},\\blur0)`);
        break;
      }
      case 'zoom': {
        const dur = opts.zoomDurationMs ?? 300;
        tags.push(`\\fscx0\\fscy0\\t(0,${dur},\\fscx100\\fscy100)`);
        break;
      }
      default:
        break;
    }
  }

  if (hasExplicitPos && !hasMove) {
    tags.push(`\\pos(${Math.round(posX!)},${Math.round(posY!)})`);
  }

  return tags.length > 0 ? `{${tags.join('')}}` : '';
}

/**
 * Wrap each word in `text` with `\k`/`\kf`/`\ko` tags, distributing
 * the subtitle's total duration evenly across words.
 */
function applyKaraokeToText(
  text: string,
  durationCs: number,
  mode: 'k' | 'kf' | 'ko',
): string {
  const NL_MARKER = '\x00NL\x00';
  const normalized = text.replace(/\\N/g, ` ${NL_MARKER} `);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const wordCount = tokens.filter((t) => t !== NL_MARKER).length;
  if (wordCount === 0) return text;
  const csPerWord = Math.max(1, Math.round(durationCs / wordCount));
  return tokens
    .map((t) => (t === NL_MARKER ? '\\N' : `{\\${mode}${csPerWord}}${t}`))
    .join(' ')
    .replace(/\s*\\N\s*/g, '\\N');
}

/**
 * Convert an SRT string to a full ASS v4+ document with embedded styles
 * and per-event animation override tags.
 */
function generateAssContent(params: {
  srtContent: string;
  alignment: number;
  marginV: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  primaryColour: string;
  backColour: string;
  borderStyle: number;
  outline: number;
  fontName: string | null;
  playResX: number;
  playResY: number;
  animation: AnimationOptions;
}): string {
  const {
    srtContent,
    alignment,
    marginV,
    fontSize,
    bold,
    italic,
    primaryColour,
    backColour,
    borderStyle,
    outline,
    fontName,
    playResX,
    playResY,
    animation,
  } = params;

  const allTypes = animation.types ?? ['none'];
  const activeTypes = allTypes.filter((t) => t !== 'none');
  const hasKaraoke = activeTypes.includes('karaoke');
  const nonKaraokeTypes = activeTypes.filter((t) => t !== 'karaoke');
  const karaokeMode = animation.karaokeMode ?? 'kf';
  const karaokeHighlight = animation.karaokeHighlightColour ?? '&H0000FFFF';

  /* ASS spec: with BorderStyle=3 the box uses OutlineColour, not BackColour. */
  const outlineColour = borderStyle === 3 ? backColour : '&H00000000';

  /* Karaoke remaps colours:
       PrimaryColour   = highlight (sung) colour
       SecondaryColour = normal (unsung) text colour  */
  const stylePrimary = hasKaraoke ? karaokeHighlight : primaryColour;
  const styleSecondary = hasKaraoke ? primaryColour : '&H000000FF';

  const events = parseSrt(srtContent);

  /* For BorderStyle=3 (opaque box), multi-line subtitles are split into one
     Dialogue per line so each line gets its own independent background box.
     Line spacing accounts for font height + both sides of the box padding so
     boxes never touch.  A \be3 tag softens box corners for a rounded look. */
  const dialogues = events
    .flatMap(({ startCs, endCs, text }) => {
      const rawLines = text.split('\\N');
      const splitPerLine = borderStyle === 3 && rawLines.length > 1;

      if (!splitPerLine) {
        let finalText = text;
        if (hasKaraoke) {
          finalText = applyKaraokeToText(
            finalText,
            endCs - startCs,
            karaokeMode,
          );
        }
        const overrideTags = buildOverrideTags(
          nonKaraokeTypes,
          animation,
          playResX,
          playResY,
          alignment,
          marginV,
        );
        let tagBlock: string;
        if (borderStyle === 3) {
          tagBlock = overrideTags
            ? `{${overrideTags.slice(1, -1)}\\be3}`
            : '{\\be3}';
        } else {
          tagBlock = overrideTags;
        }
        if (tagBlock) finalText = `${tagBlock}${finalText}`;
        return [
          `Dialogue: 0,${formatAssTimestamp(startCs)},${formatAssTimestamp(endCs)},Default,,0,0,0,,${finalText}`,
        ];
      }

      /* lineHeight must exceed (fontSize + 2*outline) so boxes don't overlap.
         Adding 30 % of fontSize provides a small visible gap between boxes. */
      const lineHeight = Math.round(fontSize * 1.3 + 2 * outline);
      const defaultPos = computeDefaultPosition(
        alignment,
        playResX,
        playResY,
        marginV,
      );
      const row = Math.floor((alignment - 1) / 3); // 0=bottom 1=middle 2=top
      const totalWords = rawLines.reduce(
        (s, l) => s + l.split(/\s+/).filter(Boolean).length,
        0,
      );

      return rawLines.map((line, i) => {
        let lineY: number;
        if (row === 0) {
          // bottom-aligned: last line at base position, earlier lines go up
          lineY = Math.round(
            defaultPos.y - (rawLines.length - 1 - i) * lineHeight,
          );
        } else if (row === 2) {
          // top-aligned: first line at base, later lines go down
          lineY = Math.round(defaultPos.y + i * lineHeight);
        } else {
          // middle-aligned: centre the block around defaultPos.y
          const totalOffset = (rawLines.length - 1) * lineHeight;
          lineY = Math.round(defaultPos.y - totalOffset / 2 + i * lineHeight);
        }
        const lineX = Math.round(defaultPos.x);

        let finalLine = line;
        if (hasKaraoke) {
          const lineWords = line.split(/\s+/).filter(Boolean).length;
          const lineDuration =
            totalWords > 0
              ? Math.round(((endCs - startCs) * lineWords) / totalWords)
              : endCs - startCs;
          finalLine = applyKaraokeToText(finalLine, lineDuration, karaokeMode);
        }

        const overrideTags = buildOverrideTags(
          nonKaraokeTypes,
          animation,
          playResX,
          playResY,
          alignment,
          marginV,
          lineX,
          lineY,
        );
        // overrideTags always contains \pos (or \move for slide) when posX/posY given
        const tagBlock = overrideTags
          ? `{${overrideTags.slice(1, -1)}\\be3}`
          : `{\\pos(${lineX},${lineY})\\be3}`;

        return `Dialogue: 0,${formatAssTimestamp(startCs)},${formatAssTimestamp(endCs)},Default,,0,0,0,,${tagBlock}${finalLine}`;
      });
    })
    .join('\n');

  const styleLine = [
    'Default',
    fontName ?? 'Arial',
    fontSize,
    stylePrimary,
    styleSecondary,
    outlineColour,
    backColour,
    bold ? -1 : 0,
    italic ? -1 : 0,
    0,
    0, // Bold, Italic, Underline, StrikeOut
    100,
    100, // ScaleX, ScaleY
    0,
    0, // Spacing, Angle
    borderStyle,
    outline,
    0, // Shadow
    alignment,
    10,
    10,
    marginV, // MarginL, MarginR, MarginV
    1, // Encoding
  ].join(',');

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleLine}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    dialogues,
    '',
  ].join('\n');
}

/* ── Public option & result types ────────────────────────────────────── */

export interface InterpolateFpsOptions {
  /** Absolute path to the input video file. */
  inputPath: string;
  /** Absolute path where the output file will be written. */
  outputPath: string;
  /** Target frames per second (e.g. 60). */
  targetFps: number;
  /**
   * Motion-search radius for `minterpolate` (pixels). Default 16.
   * Lower = faster ME, more CPU headroom for the encoder; higher = more
   * accurate motion vectors at the cost of sequential search time.
   * Valid range: 4–64.
   */
  searchParam?: number;
  /** Path to the ffmpeg binary. Defaults to `'ffmpeg'`. */
  ffmpegBinary?: string;
  /** Called with a value 0–100 as encoding progresses. */
  onProgress?: (pct: number) => void;
}

export interface ConvertToH264Options {
  /** Absolute path to the input video file. */
  inputPath: string;
  /** Absolute path where the output file will be written. */
  outputPath: string;
  /** Path to the ffmpeg binary. Defaults to `'ffmpeg'`. */
  ffmpegBinary?: string;
  /** Called with a value 0–100 as encoding progresses. */
  onProgress?: (pct: number) => void;
}

export interface RemoveBlackBarsOptions {
  /** Absolute path to the input video file. */
  inputPath: string;
  /** Absolute path where the output file will be written. */
  outputPath: string;
  /** Cropdetect luminance threshold (0–255). Default 24. */
  limit?: number;
  /** Round crop dimensions to the nearest multiple. Default 16. */
  round?: number;
  /**
   * Pre-computed crop string in `w:h:x:y` format.
   * When provided, the cropdetect pass is skipped.
   */
  cropString?: string;
  /** Path to the ffmpeg binary. Defaults to `'ffmpeg'`. */
  ffmpegBinary?: string;
  /** Called with a value 0–100 as processing progresses. */
  onProgress?: (pct: number) => void;
}

export interface ExtractAudioOptions {
  /** Absolute path to the input video file. */
  inputPath: string;
  /** Absolute path where the output audio file will be written. */
  outputPath: string;
  /**
   * Output audio format/extension. Default `'wav'`.
   * When `'wav'` the audio is down-mixed to mono 16 kHz PCM (speech-friendly).
   * Any other value copies the audio stream without re-encoding.
   */
  format?: string;
  /** Path to the ffmpeg binary. Defaults to `'ffmpeg'`. */
  ffmpegBinary?: string;
  /** Called with a value 0–100 as processing progresses. */
  onProgress?: (pct: number) => void;
}

export interface BurnSubtitlesOptions {
  /** Absolute path to the input video file. */
  inputPath: string;
  /** Absolute path where the output file will be written. */
  outputPath: string;
  /** SRT subtitle content to burn into the video. */
  srtContent: string;
  /**
   * ASS numpad alignment (1–9).
   * 7 8 9 = top-left/center/right · 4 5 6 = mid · 1 2 3 = bottom. Default 2.
   */
  alignment?: number;
  /** Vertical margin in pixels from the edge. Default 40. */
  marginV?: number;
  /** Font size in points. Default 16. */
  fontSize?: number;
  /** Bold text. Default false. */
  bold?: boolean;
  /** Italic text. Default false. */
  italic?: boolean;
  /** Primary (text fill) colour in ASS &HAABBGGRR format. Default `'&H00FFFFFF'` (white). */
  primaryColour?: string;
  /** Background / outline box colour in ASS &HAABBGGRR format. Default `'&H70000000'` (semi-transparent black). */
  backColour?: string;
  /** ASS border style (1 = outline+shadow, 3 = opaque box). Default 3. */
  borderStyle?: number;
  /** Outline width in pixels. Default 0. */
  outline?: number;
  /**
   * Absolute path to a `.ttf` / `.otf` font file to embed via libass.
   * When omitted, libass falls back to system fonts.
   */
  fontPath?: string;
  /** Animation options; omit or pass `{}` for no animation. */
  animation?: AnimationOptions;
  /** Path to the ffmpeg binary. Defaults to `'ffmpeg'`. */
  ffmpegBinary?: string;
  /** Called with a value 0–100 as encoding progresses. */
  onProgress?: (pct: number) => void;
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Interpolates a video to a higher frame rate using `minterpolate`.
 *
 * @returns The resolved `outputPath`.
 * @throws When ffmpeg exits with a non-zero code.
 */
export async function interpolateFps(
  options: InterpolateFpsOptions,
): Promise<string> {
  const {
    inputPath,
    outputPath,
    targetFps,
    searchParam = 16,
    ffmpegBinary = DEFAULT_FFMPEG,
    onProgress,
  } = options;

  const { durationSec } = await probeVideo(inputPath, ffmpegBinary);

  const estimatedFrames = durationSec > 0 ? durationSec * targetFps : 0;
  const videoFilter = `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=${searchParam}`;

  await runFFmpeg(
    [
      '-i',
      inputPath,
      '-filter:v',
      videoFilter,
      '-c:v',
      'libx264',
      '-preset',
      'faster',
      '-crf',
      '23',
      '-c:a',
      'copy',
      outputPath,
    ],
    ffmpegBinary,
    onProgress,
    estimatedFrames,
  );

  return outputPath;
}

/**
 * Converts a video to H.264 (libx264) while copying the audio stream.
 *
 * @returns The resolved `outputPath`.
 * @throws When ffmpeg exits with a non-zero code.
 */
export async function convertToH264(
  options: ConvertToH264Options,
): Promise<string> {
  const {
    inputPath,
    outputPath,
    ffmpegBinary = DEFAULT_FFMPEG,
    onProgress,
  } = options;

  const { durationSec, fps } = await probeVideo(inputPath, ffmpegBinary);
  const estimatedFrames = durationSec > 0 ? durationSec * fps : 0;

  await runFFmpeg(
    [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'faster',
      '-crf',
      '23',
      '-c:a',
      'copy',
      outputPath,
    ],
    ffmpegBinary,
    onProgress,
    estimatedFrames,
  );

  return outputPath;
}

/**
 * Detects and removes black bars (letterbox/pillarbox) from a video.
 *
 * When `cropString` is provided the cropdetect pass is skipped and the
 * supplied crop dimensions are applied directly.
 *
 * @returns The resolved `outputPath`.
 * @throws When no black bars are detected or ffmpeg fails.
 */
export async function removeBlackBars(
  options: RemoveBlackBarsOptions,
): Promise<string> {
  const {
    inputPath,
    outputPath,
    limit = 24,
    round = 16,
    cropString,
    ffmpegBinary = DEFAULT_FFMPEG,
    onProgress,
  } = options;

  const {
    width: origW,
    height: origH,
    durationSec,
    fps,
  } = await probeVideo(inputPath, ffmpegBinary);
  const estimatedFrames = durationSec > 0 ? durationSec * fps : 0;

  let crop = cropString;

  if (!crop) {
    /* Step 1 (0–49 %): cropdetect pass — no output file, so no encoding
       frames; we parse frame numbers from the null-muxer log. */
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBinary, [
        ...THREAD_FLAGS,
        '-i',
        inputPath,
        '-vf',
        `cropdetect=limit=${limit}:round=${round}:reset=0`,
        '-f',
        'null',
        '-',
      ]);

      let log = '';
      let lastFrame = 0;

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        log += text;

        if (onProgress && estimatedFrames > 0) {
          const m = text.match(/frame=\s*(\d+)/);
          if (m) {
            const frame = Number(m[1]);
            if (frame > lastFrame) {
              lastFrame = frame;
              onProgress(
                Math.min(49, Math.round((frame / estimatedFrames) * 50)),
              );
            }
          }
        }

        const matches = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
        if (matches.length > 0) {
          const last = matches[matches.length - 1]!;
          const [, w, h, x, y] = last;

          if (
            origW > 0 &&
            origH > 0 &&
            Number(w) >= origW &&
            Number(h) >= origH
          ) {
            // Detected crop equals source — no bars
            return;
          }
          crop = `${w}:${h}:${x}:${y}`;
        }
      });

      proc.on('close', (code) => {
        if (!crop) {
          // Re-parse full log for the last crop= entry
          const matches = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
          if (matches.length === 0) {
            return reject(new Error('No black bars detected'));
          }
          const last = matches[matches.length - 1]!;
          const [, w, h, x, y] = last;
          if (
            origW > 0 &&
            origH > 0 &&
            Number(w) >= origW &&
            Number(h) >= origH
          ) {
            return reject(new Error('No black bars detected'));
          }
          crop = `${w}:${h}:${x}:${y}`;
        }
        if (code !== 0 && !crop) {
          reject(new Error(`FFmpeg cropdetect exited with code ${code}`));
        } else {
          onProgress?.(50);
          resolve();
        }
      });

      proc.on('error', reject);
    });
  }

  /* Step 2 (50–100 %): apply crop */
  const cropEstFrames = estimatedFrames;
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBinary, [
      ...THREAD_FLAGS,
      '-i',
      inputPath,
      '-vf',
      `crop=${crop}`,
      '-c:a',
      'copy',
      outputPath,
    ]);

    let stderr = '';
    let lastFrame = 0;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      if (onProgress && cropEstFrames > 0) {
        const m = text.match(/frame=\s*(\d+)/);
        if (m) {
          const frame = Number(m[1]);
          if (frame > lastFrame) {
            lastFrame = frame;
            onProgress(
              Math.min(99, 50 + Math.round((frame / cropEstFrames) * 50)),
            );
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `FFmpeg crop exited with code ${code}\n${stderr.slice(-500)}`,
          ),
        );
      } else {
        onProgress?.(100);
        resolve();
      }
    });

    proc.on('error', reject);
  });

  return outputPath;
}

/**
 * Extracts the audio track from a video file.
 *
 * When `format` is `'wav'` the stream is down-mixed to mono 16 kHz PCM,
 * which is optimised for speech recognition workloads.
 * For any other format the audio codec is copied without re-encoding.
 *
 * @returns The resolved `outputPath`.
 * @throws When ffmpeg exits with a non-zero code.
 */
export async function extractAudio(
  options: ExtractAudioOptions,
): Promise<string> {
  const {
    inputPath,
    outputPath,
    format = 'wav',
    ffmpegBinary = DEFAULT_FFMPEG,
    onProgress,
  } = options;

  const { durationSec } = await probeVideo(inputPath, ffmpegBinary);
  // Audio extraction is fast; estimate frames loosely for progress
  const estimatedFrames = durationSec > 0 ? durationSec * 30 : 0;

  const args =
    format === 'wav'
      ? [
          '-i',
          inputPath,
          '-vn',
          '-acodec',
          'pcm_s16le',
          '-ar',
          '16000',
          '-ac',
          '1',
          outputPath,
        ]
      : ['-i', inputPath, '-vn', '-c:a', 'copy', outputPath];

  await runFFmpeg(args, ffmpegBinary, onProgress, estimatedFrames);

  return outputPath;
}

/**
 * Burns SRT subtitles into a video using libass.
 *
 * The SRT content is converted to an ASS v4+ document (including all
 * style and animation tags) and written to a temporary file. The file
 * is automatically deleted after ffmpeg finishes.
 *
 * Rotation metadata is detected so that subtitles are positioned
 * correctly on portrait videos stored with a rotation flag.
 *
 * @returns The resolved `outputPath`.
 * @throws When ffmpeg exits with a non-zero code.
 */
export async function burnSubtitles(
  options: BurnSubtitlesOptions,
): Promise<string> {
  const {
    inputPath,
    outputPath,
    srtContent,
    alignment = 2,
    marginV = 40,
    fontSize = 16,
    bold = false,
    italic = false,
    primaryColour = '&H00FFFFFF',
    backColour = '&H70000000',
    borderStyle = 3,
    outline = 0,
    fontPath,
    animation = {},
    ffmpegBinary = DEFAULT_FFMPEG,
    onProgress,
  } = options;

  const {
    width: origW,
    height: origH,
    durationSec,
    fps,
    rotation,
  } = await probeVideo(inputPath, ffmpegBinary);

  /* ASS PlayRes must match the frame the subtitles filter sees.
     When there is rotation metadata and we transpose, width ↔ height swap. */
  const playResX = rotation === 90 || rotation === 270 ? origH : origW;
  const playResY = rotation === 90 || rotation === 270 ? origW : origH;

  const fontName = fontPath ? 'CustomFont' : null;

  const assContent = generateAssContent({
    srtContent,
    alignment,
    marginV,
    fontSize,
    bold,
    italic,
    primaryColour,
    backColour,
    borderStyle,
    outline,
    fontName,
    playResX,
    playResY,
    animation,
  });

  /* Write ASS to a temp file next to the output, cleaned up afterwards. */
  const assFile = join(tmpdir(), `${randomUUID()}.ass`);
  writeFileSync(assFile, assContent, 'utf8');

  /* When a custom font is provided, copy it into a temp fonts directory
     so libass can find it via fontsdir=. */
  let fontsDir: string | null = null;
  if (fontPath && existsSync(fontPath)) {
    fontsDir = join(tmpdir(), `fonts_${randomUUID()}`);
    mkdirSync(fontsDir, { recursive: true });
    // Copy the font file into the temp fonts directory
    const { copyFileSync } = await import('fs');
    const fontFilename = fontPath.split('/').pop() ?? 'font.ttf';
    copyFileSync(fontPath, join(fontsDir, fontFilename));
  }

  const fontsOption = fontsDir ? `:fontsdir=${fontsDir}` : '';
  const subsFilter = `subtitles=${assFile}${fontsOption}`;

  const needsRotation = rotation !== 0;
  let vf: string;
  if (rotation === 90) {
    vf = `transpose=1,${subsFilter}`;
  } else if (rotation === 270) {
    vf = `transpose=2,${subsFilter}`;
  } else if (rotation === 180) {
    vf = `transpose=1,transpose=1,${subsFilter}`;
  } else {
    vf = subsFilter;
  }

  const estimatedFrames = durationSec > 0 ? durationSec * fps : 0;

  try {
    await runFFmpeg(
      [
        ...(needsRotation ? ['-noautorotate'] : []),
        '-i',
        inputPath,
        '-vf',
        vf,
        '-c:a',
        'copy',
        ...(needsRotation ? ['-metadata:s:v:0', 'rotate=0'] : []),
        outputPath,
      ],
      ffmpegBinary,
      onProgress,
      estimatedFrames,
    );
  } finally {
    try {
      rmSync(assFile, { force: true });
    } catch {
      /* ignore */
    }
    if (fontsDir) {
      try {
        rmSync(fontsDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  return outputPath;
}
