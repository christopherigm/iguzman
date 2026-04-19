/**
 * FFmpeg Web Worker
 *
 * Runs all FFmpeg WASM operations (load, exec, file I/O) in a dedicated
 * worker thread, keeping the main thread fully responsive during heavy
 * video processing.
 *
 * Message protocol
 * ─────────────────
 * Incoming (main → worker):
 *   { id, type: 'load', payload: { coreURL, wasmURL, workerURL } }
 *   { id, type: 'interpolateFps',  payload: { videoData: Uint8Array, targetFps: number } }
 *   { id, type: 'convertToH264',   payload: { videoData: Uint8Array } }
 *   { id, type: 'removeBlackBars', payload: { videoData: Uint8Array, limit?: number, round?: number, cropString?: string } }
 *   { id, type: 'extractAudio',    payload: { videoData: Uint8Array, format?: string } }
 *   { id, type: 'burnSubtitles',   payload: {
 *       videoData: Uint8Array, srtContent: string,
 *       alignment?: number (numpad 1–9, default 2),
 *       marginV?: number, fontSize?: number,
 *       primaryColour?: string, backColour?: string,
 *       borderStyle?: number, outline?: number,
 *       animation?: {
 *         types?: Array<'none'|'fade'|'slideUp'|'slideDown'|'blur'|'zoom'|'karaoke'>,
 *         fadeInMs?: number, fadeOutMs?: number,
 *         slideOffset?: number, slideDurationMs?: number,
 *         blurStrength?: number, blurDurationMs?: number,
 *         zoomDurationMs?: number,
 *         karaokeMode?: 'k'|'kf'|'ko', karaokeHighlightColour?: string
 *       }
 *   } }
 *
 * Outgoing (worker → main):
 *   { id, type: 'progress',  payload: { progress: number } }
 *   { id, type: 'result',    payload: { data: Uint8Array } }          – transfer
 *   { id, type: 'error',     payload: { message: string } }
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/* ── Worker state ──────────────────────────────────── */

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

/* ── Subtitle font (cached across calls) ─────────── */
let subtitleFontCache: Uint8Array | null = null;
const SUBTITLE_FONT_URL =
  'https://cdn.jsdelivr.net/npm/roboto-font@0.1.0/fonts/Roboto/roboto-regular-webfont.ttf';

async function getSubtitleFont(): Promise<Uint8Array | null> {
  if (subtitleFontCache) return subtitleFontCache;
  try {
    const res = await fetch(SUBTITLE_FONT_URL);
    if (!res.ok) return null;
    subtitleFontCache = new Uint8Array(await res.arrayBuffer());
    return subtitleFontCache;
  } catch {
    return null;
  }
}

/* ── Animated subtitle types & helpers ───────────── */

type AnimationType =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'blur'
  | 'zoom'
  | 'karaoke';

interface AnimationOptions {
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
    const tsIdx = lines.findIndex(l => l.includes('-->'));
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
  const x =
    col === 0 ? marginL : col === 1 ? playResX / 2 : playResX - marginR;
  const y =
    row === 0 ? playResY - marginV : row === 1 ? playResY / 2 : marginV;
  return { x, y };
}

/**
 * Build the ASS override tag block `{…}` for non-karaoke animation types.
 * Karaoke is handled separately at the text level by applyKaraokeToText.
 */
function buildOverrideTags(
  types: AnimationType[],
  opts: AnimationOptions,
  playResX: number,
  playResY: number,
  alignment: number,
  marginV: number,
): string {
  const tags: string[] = [];

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
        const pos = computeDefaultPosition(
          alignment,
          playResX,
          playResY,
          marginV,
        );
        const startY =
          type === 'slideUp' ? pos.y + offset : pos.y - offset;
        tags.push(
          `\\move(${Math.round(pos.x)},${Math.round(startY)},${Math.round(pos.x)},${Math.round(pos.y)},0,${dur})`,
        );
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

  return tags.length > 0 ? `{${tags.join('')}}` : '';
}

/**
 * Wrap each word in `text` with `\k`/`\kf`/`\ko` tags, distributing
 * the subtitle's total duration evenly across words.
 * ASS `\\N` (line-break tokens) are preserved.
 */
function applyKaraokeToText(
  text: string,
  durationCs: number,
  mode: 'k' | 'kf' | 'ko',
): string {
  const NL_MARKER = '\x00NL\x00';
  const normalized = text.replace(/\\N/g, ` ${NL_MARKER} `);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const wordCount = tokens.filter(t => t !== NL_MARKER).length;
  if (wordCount === 0) return text;
  const csPerWord = Math.max(1, Math.round(durationCs / wordCount));
  return tokens
    .map(t => (t === NL_MARKER ? '\\N' : `{\\${mode}${csPerWord}}${t}`))
    .join(' ')
    .replace(/\s*\\N\s*/g, '\\N');
}

/**
 * Convert an SRT string to a full ASS v4+ document with embedded styles
 * and per-event animation override tags.
 *
 * This replaces the old `force_style` approach: styles are written directly
 * into the ASS [V4+ Styles] section, so no `force_style=` FFmpeg option is
 * needed.  The Alignment field uses ASS v4+ numpad values (1–9) directly —
 * no SSA v4 bit-flag conversion required.
 */
function generateAssContent(params: {
  srtContent: string;
  alignment: number;
  marginV: number;
  fontSize: number;
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
  const activeTypes = allTypes.filter(t => t !== 'none');
  const hasKaraoke = activeTypes.includes('karaoke');
  const nonKaraokeTypes = activeTypes.filter(t => t !== 'karaoke');
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
  const dialogues = events
    .map(({ startCs, endCs, text }) => {
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

      if (overrideTags) finalText = `${overrideTags}${finalText}`;

      return `Dialogue: 0,${formatAssTimestamp(startCs)},${formatAssTimestamp(endCs)},Default,,0,0,0,,${finalText}`;
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
    0,
    0,
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

/* ── Helpers ─────────────────────────────────────── */

async function ensureLoaded(
  coreURL: string,
  wasmURL: string,
  workerURL: string,
): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    loadPromise = (async () => {
      const instance = new FFmpeg();
      await instance.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
        workerURL: await toBlobURL(workerURL, 'text/javascript'),
      });
      ffmpeg = instance;
    })();
  }

  await loadPromise;
  return ffmpeg!;
}

/* ── Main message handler ────────────────────────── */

self.onmessage = async (
  event: MessageEvent<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
  }>,
) => {
  const { id, type, payload } = event.data;

  const sendProgress = (progress: number) => {
    self.postMessage({ id, type: 'progress', payload: { progress } });
  };

  const sendError = (message: string) => {
    self.postMessage({ id, type: 'error', payload: { message } });
  };

  const sendWarn = (message: string) => {
    self.postMessage({ id, type: 'warn', payload: { message } });
  };

  try {
    if (type === 'load') {
      const { coreURL, wasmURL, workerURL } = payload as {
        coreURL: string;
        wasmURL: string;
        workerURL: string;
      };
      await ensureLoaded(coreURL, wasmURL, workerURL);
      self.postMessage({ id, type: 'loaded' });
      return;
    }

    const { coreURL, wasmURL, workerURL } = payload as {
      coreURL: string;
      wasmURL: string;
      workerURL: string;
    };
    const ff = await ensureLoaded(coreURL, wasmURL, workerURL);

    const progressHandler = ({ progress: p }: { progress: number }) => {
      sendProgress(Math.round(p * 100));
    };
    ff.on('progress', progressHandler);

    try {
      switch (type) {
        case 'interpolateFps': {
          const { videoData, targetFps } = payload as {
            videoData: Uint8Array;
            targetFps: number;
          };
          const input = 'input.mp4';
          const output = 'output.mp4';
          await ff.writeFile(input, videoData);

          // Probe input resolution. FFmpeg exits 1 with no output specified
          // but still logs stream info – ignore the exit code.
          let probeLog = '';
          const probeHandler = ({ message }: { message: string }) => {
            probeLog += message + '\n';
          };
          ff.on('log', probeHandler);
          await ff.exec(['-i', input]);
          ff.off('log', probeHandler);

          const dimMatch = probeLog.match(/(\d{2,5})x(\d{2,5})/);
          const origW = dimMatch ? Number(dimMatch[1]) : 0;
          const origH = dimMatch ? Number(dimMatch[2]) : 0;

          if (origW > 2560 || origH > 1440) {
            await ff.deleteFile(input);
            throw new Error(
              `Video resolution ${origW}x${origH} exceeds QHD+ (2560×1440). FPS interpolation is not supported for resolutions above QHD+.`,
            );
          }

          const videoFilter = `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;

          // minterpolate does not reliably fire FFmpeg progress events, so
          // parse frame numbers from the log as a fallback progress source.
          const durMatch = probeLog.match(
            /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/,
          );
          const durationSec = durMatch
            ? Number(durMatch[1]) * 3600 +
              Number(durMatch[2]) * 60 +
              Number(durMatch[3])
            : 0;
          const estimatedFrames = durationSec > 0 ? durationSec * targetFps : 0;
          let lastReportedFrame = 0;
          const frameLogHandler = ({ message }: { message: string }) => {
            const m = message.match(/frame=\s*(\d+)/);
            if (!m) return;
            const frame = Number(m[1]);
            if (frame <= lastReportedFrame) return;
            lastReportedFrame = frame;
            if (estimatedFrames > 0) {
              sendProgress(
                Math.min(99, Math.round((frame / estimatedFrames) * 100)),
              );
            }
          };
          ff.on('log', frameLogHandler);

          const code = await ff.exec([
            '-i',
            input,
            '-filter:v',
            videoFilter,
            '-c:a',
            'copy',
            output,
          ]);
          ff.off('log', frameLogHandler);
          if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
          const result = (await ff.readFile(output)) as Uint8Array;
          await ff.deleteFile(input);
          await ff.deleteFile(output);
          self.postMessage(
            { id, type: 'result', payload: { data: result } },
            { transfer: [result.buffer as ArrayBuffer] },
          );
          break;
        }

        case 'convertToH264': {
          const { videoData } = payload as { videoData: Uint8Array };
          const input = 'input_h265.mp4';
          const output = 'output_h264.mp4';
          await ff.writeFile(input, videoData);
          const code = await ff.exec([
            '-i',
            input,
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '23',
            '-c:a',
            'copy',
            output,
          ]);
          if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
          const result = (await ff.readFile(output)) as Uint8Array;
          await ff.deleteFile(input);
          await ff.deleteFile(output);
          self.postMessage(
            { id, type: 'result', payload: { data: result } },
            { transfer: [result.buffer as ArrayBuffer] },
          );
          break;
        }

        case 'removeBlackBars': {
          /* Unregister the global progress handler — this case uses
             its own frame-based progress for both detection and crop. */
          ff.off('progress', progressHandler);

          const {
            videoData,
            limit = 24,
            round = 16,
            cropString,
          } = payload as {
            videoData: Uint8Array;
            limit?: number;
            round?: number;
            cropString?: string;
          };
          const input = 'input_bars.mp4';
          const output = 'output_cropped.mp4';
          await ff.writeFile(input, videoData);

          /* Probe input dimensions + duration for progress reporting. */
          let probeLog = '';
          const probeHandler = ({ message }: { message: string }) => {
            probeLog += message + '\n';
          };
          ff.on('log', probeHandler);
          await ff.exec(['-i', input]);
          ff.off('log', probeHandler);

          const dimMatch = probeLog.match(/(\d{2,5})x(\d{2,5})/);
          const origW = dimMatch ? Number(dimMatch[1]) : 0;
          const origH = dimMatch ? Number(dimMatch[2]) : 0;

          const durMatch = probeLog.match(
            /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/,
          );
          const durationSec = durMatch
            ? Number(durMatch[1]) * 3600 +
              Number(durMatch[2]) * 60 +
              Number(durMatch[3])
            : 0;

          let crop = cropString;

          if (!crop) {
            /* Step 1: detect crop dimensions.
               -f null produces no encoding output, so FFmpeg's built-in
               progress event does not fire. Use frame-count log parsing
               instead (same approach as interpolateFps). */
            let cropLogs = '';
            const fpsMatch = probeLog.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
            const srcFps = fpsMatch ? Number(fpsMatch[1]) : 30;
            const estimatedFrames = durationSec > 0 ? durationSec * srcFps : 0;
            let lastReportedFrame = 0;

            const detectLogHandler = ({ message }: { message: string }) => {
              cropLogs += message + '\n';
              if (estimatedFrames > 0) {
                const m = message.match(/frame=\s*(\d+)/);
                if (m) {
                  const frame = Number(m[1]);
                  if (frame > lastReportedFrame) {
                    lastReportedFrame = frame;
                    /* Detection is ~half the work; report 0-49%. */
                    sendProgress(
                      Math.min(49, Math.round((frame / estimatedFrames) * 50)),
                    );
                  }
                }
              }
            };
            ff.on('log', detectLogHandler);
            await ff.exec([
              '-i',
              input,
              '-vf',
              `cropdetect=limit=${limit}:round=${round}:reset=0`,
              '-f',
              'null',
              '-',
            ]);
            ff.off('log', detectLogHandler);

            const matches = [
              ...cropLogs.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g),
            ];
            if (matches.length === 0) {
              await ff.deleteFile(input);
              throw new Error('No black bars detected');
            }
            const last = matches[matches.length - 1]!;
            const [, w, h, x, y] = last;

            /* If detected crop matches original dimensions → no bars. */
            if (
              origW > 0 &&
              origH > 0 &&
              Number(w) >= origW &&
              Number(h) >= origH
            ) {
              await ff.deleteFile(input);
              throw new Error('No black bars detected');
            }
            crop = `${w}:${h}:${x}:${y}`;
          }

          sendProgress(50);

          /* Step 2: apply crop — use frame-based progress for 50-100%. */
          const cropEstFrames =
            durationSec > 0
              ? durationSec *
                (probeLog.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/)
                  ? Number(probeLog.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/)![1])
                  : 30)
              : 0;
          let lastCropFrame = 0;
          const cropLogHandler = ({ message }: { message: string }) => {
            if (cropEstFrames > 0) {
              const m = message.match(/frame=\s*(\d+)/);
              if (m) {
                const frame = Number(m[1]);
                if (frame > lastCropFrame) {
                  lastCropFrame = frame;
                  sendProgress(
                    Math.min(99, 50 + Math.round((frame / cropEstFrames) * 50)),
                  );
                }
              }
            }
          };
          ff.on('log', cropLogHandler);
          const code = await ff.exec([
            '-i',
            input,
            '-vf',
            `crop=${crop}`,
            '-c:a',
            'copy',
            output,
          ]);
          ff.off('log', cropLogHandler);
          if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
          const result = (await ff.readFile(output)) as Uint8Array;
          await ff.deleteFile(input);
          await ff.deleteFile(output);
          sendProgress(100);
          self.postMessage(
            { id, type: 'result', payload: { data: result } },
            { transfer: [result.buffer as ArrayBuffer] },
          );
          break;
        }

        case 'extractAudio': {
          const { videoData, format = 'wav' } = payload as {
            videoData: Uint8Array;
            format?: string;
          };
          const input = 'input_audio_extract.mp4';
          const output = `output_audio.${format}`;
          await ff.writeFile(input, videoData);

          const args =
            format === 'wav'
              ? [
                  '-i',
                  input,
                  '-vn',
                  '-acodec',
                  'pcm_s16le',
                  '-ar',
                  '16000',
                  '-ac',
                  '1',
                  output,
                ]
              : ['-i', input, '-vn', '-c:a', 'copy', output];

          const code = await ff.exec(args);
          if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
          const result = (await ff.readFile(output)) as Uint8Array;
          await ff.deleteFile(input);
          await ff.deleteFile(output);
          sendProgress(100);
          self.postMessage(
            { id, type: 'result', payload: { data: result } },
            { transfer: [result.buffer as ArrayBuffer] },
          );
          break;
        }

        case 'burnSubtitles': {
          const {
            videoData,
            srtContent,
            alignment = 2,
            marginV = 40,
            fontSize = 16,
            primaryColour = '&H00FFFFFF',
            backColour = '&H70000000',
            borderStyle = 3,
            outline = 0,
            animation = {},
          } = payload as {
            videoData: Uint8Array;
            srtContent: string;
            alignment?: number;
            marginV?: number;
            fontSize?: number;
            primaryColour?: string;
            backColour?: string;
            borderStyle?: number;
            outline?: number;
            /** Animation options; omit or pass {} for no animation. */
            animation?: AnimationOptions;
          };

          const input = 'input_subs.mp4';
          const assFile = 'subs.ass';
          const output = 'output_subs.mp4';

          await ff.writeFile(input, videoData);

          /* Provide a font for libass — WASM has no system fonts. */
          const fontData = await getSubtitleFont();
          if (fontData) {
            try {
              await ff.createDir('/fonts');
            } catch {
              /* dir already exists */
            }
            await ff.writeFile('/fonts/subtitle-font.ttf', fontData);
          } else {
            sendWarn(
              'Failed to load subtitle font from CDN — subtitles may not render.',
            );
          }

          /* Probe duration, fps, rotation, and dimensions.
             Duration + fps feed progress reporting; dimensions + rotation
             are needed for accurate ASS PlayRes and \move coordinates. */
          let probeLog = '';
          const probeHandler = ({ message }: { message: string }) => {
            probeLog += message + '\n';
          };
          ff.on('log', probeHandler);
          await ff.exec(['-i', input]);
          ff.off('log', probeHandler);

          const dimMatch = probeLog.match(/(\d{2,5})x(\d{2,5})/);
          const origW = dimMatch ? Number(dimMatch[1]) : 1280;
          const origH = dimMatch ? Number(dimMatch[2]) : 720;

          const durMatch = probeLog.match(
            /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/,
          );
          const durationSec = durMatch
            ? Number(durMatch[1]) * 3600 +
              Number(durMatch[2]) * 60 +
              Number(durMatch[3])
            : 0;
          const fpsMatch = probeLog.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
          const srcFps = fpsMatch ? Number(fpsMatch[1]) : 30;

          /* Detect rotation metadata so we can orient the frame before
             burning subtitles.  Without this, portrait videos (stored as
             landscape + rotation flag) get subtitles in the wrong position. */
          const rotMatch = probeLog.match(
            /rotation\s+(?:of\s+)?(-?\d+(?:\.\d+)?)/i,
          );
          const rotation = rotMatch
            ? ((Math.round(Number(rotMatch[1])) % 360) + 360) % 360
            : 0;

          /* After transpose=1/2 the displayed frame swaps width ↔ height.
             ASS PlayRes must match the frame the subtitles filter sees. */
          const needsRotation = rotation !== 0;
          const playResX =
            rotation === 90 || rotation === 270 ? origH : origW;
          const playResY =
            rotation === 90 || rotation === 270 ? origW : origH;

          /* Generate ASS content from SRT — embeds all style + animation tags.
             This replaces the old SRT + force_style approach: styles live in
             the ASS [V4+ Styles] section, so no force_style= option is needed.
             Alignment is in ASS v4+ numpad format (1–9) directly — no SSA
             bit-flag conversion required. */
          const assContent = generateAssContent({
            srtContent,
            alignment,
            marginV,
            fontSize,
            primaryColour,
            backColour,
            borderStyle,
            outline,
            fontName: fontData ? 'Roboto' : null,
            playResX,
            playResY,
            animation,
          });
          await ff.writeFile(assFile, new TextEncoder().encode(assContent));

          const estimatedFrames = durationSec > 0 ? durationSec * srcFps : 0;
          let lastFrame = 0;

          let burnLog = '';
          const burnLogHandler = ({ message }: { message: string }) => {
            burnLog += message + '\n';
            if (estimatedFrames > 0) {
              const m = message.match(/frame=\s*(\d+)/);
              if (m) {
                const frame = Number(m[1]);
                if (frame > lastFrame) {
                  lastFrame = frame;
                  sendProgress(
                    Math.min(99, Math.round((frame / estimatedFrames) * 100)),
                  );
                }
              }
            }
          };
          ff.on('log', burnLogHandler);

          const fontsOption = fontData ? ':fontsdir=/fonts' : '';
          const subsFilter = `subtitles=${assFile}${fontsOption}`;

          /* Build the video filter chain.  When the source has rotation
             metadata we must orient the pixels *before* the subtitles
             filter so that ASS alignment values match the displayed frame.
             We pass -noautorotate to prevent ffmpeg from double-rotating. */
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

          const code = await ff.exec([
            ...(needsRotation ? ['-noautorotate'] : []),
            '-i',
            input,
            '-vf',
            vf,
            '-c:a',
            'copy',
            ...(needsRotation ? ['-metadata:s:v:0', 'rotate=0'] : []),
            output,
          ]);
          ff.off('log', burnLogHandler);

          if (code !== 0) {
            throw new Error(
              `FFmpeg exited with code ${code}\n${burnLog.slice(-500)}`,
            );
          }

          /* Warn if libass reported font/glyph issues (subtitles won't be visible). */
          if (
            /font.*not found|glyph.*not found|no fonts|failed to load/i.test(
              burnLog,
            )
          ) {
            sendWarn(
              'FFmpeg/libass could not find a suitable font — subtitles may not be visible.',
            );
          }

          const result = (await ff.readFile(output)) as Uint8Array;
          await ff.deleteFile(input);
          await ff.deleteFile(assFile);
          await ff.deleteFile(output);
          sendProgress(100);

          self.postMessage(
            { id, type: 'result', payload: { data: result } },
            { transfer: [result.buffer as ArrayBuffer] },
          );
          break;
        }

        default:
          sendError(`Unknown message type: ${type}`);
      }
    } finally {
      ff.off('progress', progressHandler);
    }
  } catch (err) {
    sendError(err instanceof Error ? err.message : String(err));
  }
};
