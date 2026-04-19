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
          };

          const input = 'input_subs.mp4';
          const srtFile = 'subs.srt';
          const output = 'output_subs.mp4';

          await ff.writeFile(input, videoData);
          await ff.writeFile(srtFile, new TextEncoder().encode(srtContent));

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

          /* Probe duration for progress reporting. */
          let probeLog = '';
          const probeHandler = ({ message }: { message: string }) => {
            probeLog += message + '\n';
          };
          ff.on('log', probeHandler);
          await ff.exec(['-i', input]);
          ff.off('log', probeHandler);

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

          const forceStyle = [
            `Alignment=${alignment}`,
            `MarginV=${marginV}`,
            `FontSize=${fontSize}`,
            `PrimaryColour=${primaryColour}`,
            `BackColour=${backColour}`,
            /*  ASS spec: with BorderStyle=3 the opaque box is filled with
                OutlineColour, NOT BackColour.  Map the caller's intended
                background colour to the correct property.  For BorderStyle=1
                (outline mode) use a solid black outline for legibility. */
            `OutlineColour=${borderStyle === 3 ? backColour : '&H00000000'}`,
            `BorderStyle=${borderStyle}`,
            `Outline=${outline}`,
            ...(fontData ? ['FontName=Roboto'] : []),
          ].join(',');
          const fontsOption = fontData ? ':fontsdir=/fonts' : '';
          const code = await ff.exec([
            '-i',
            input,
            '-vf',
            `subtitles=${srtFile}${fontsOption}:force_style='${forceStyle}'`,
            '-c:a',
            'copy',
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
          await ff.deleteFile(srtFile);
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
