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
 *   { id, type: 'detectBars',      payload: { videoData: Uint8Array, limit?: number, round?: number } }
 *
 * Outgoing (worker → main):
 *   { id, type: 'progress',  payload: { progress: number } }
 *   { id, type: 'result',    payload: { data: Uint8Array } }          – transfer
 *   { id, type: 'detect',    payload: { hasBars: boolean, crop: string | null } }
 *   { id, type: 'error',     payload: { message: string } }
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/* ── Worker state ──────────────────────────────────── */

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

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
          const code = await ff.exec([
            '-i', input,
            '-filter:v',
            `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
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

        case 'convertToH264': {
          const { videoData } = payload as { videoData: Uint8Array };
          const input = 'input_h265.mp4';
          const output = 'output_h264.mp4';
          await ff.writeFile(input, videoData);
          const code = await ff.exec([
            '-i', input,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'copy',
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
          const { videoData, limit = 24, round = 16, cropString } = payload as {
            videoData: Uint8Array;
            limit?: number;
            round?: number;
            cropString?: string;
          };
          const input = 'input_bars.mp4';
          const output = 'output_cropped.mp4';
          await ff.writeFile(input, videoData);

          let crop = cropString;

          if (!crop) {
            /* Step 1: detect crop dimensions */
            let cropLogs = '';
            const logHandler = ({ message }: { message: string }) => {
              cropLogs += message + '\n';
            };
            ff.on('log', logHandler);
            await ff.exec([
              '-i', input,
              '-vf', `cropdetect=limit=${limit}:round=${round}:reset=0`,
              '-f', 'null', '-',
            ]);
            ff.off('log', logHandler);

            const matches = [
              ...cropLogs.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g),
            ];
            if (matches.length === 0) {
              await ff.deleteFile(input);
              throw new Error('No crop parameters detected');
            }
            const last = matches[matches.length - 1]!;
            const [, w, h, x, y] = last;
            crop = `${w}:${h}:${x}:${y}`;
          }

          /* Step 2: apply crop */
          const code = await ff.exec([
            '-i', input,
            '-vf', `crop=${crop}`,
            '-c:a', 'copy',
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

        case 'detectBars': {
          const { videoData, limit = 24, round = 16 } = payload as {
            videoData: Uint8Array;
            limit?: number;
            round?: number;
          };
          const input = 'detect_bars_input.mp4';
          await ff.writeFile(input, videoData);

          let cropLogs = '';
          const logHandler = ({ message }: { message: string }) => {
            cropLogs += message + '\n';
          };
          ff.on('log', logHandler);
          await ff.exec([
            '-i', input,
            '-vf', `cropdetect=limit=${limit}:round=${round}:reset=0`,
            '-f', 'null', '-',
          ]);
          ff.off('log', logHandler);
          await ff.deleteFile(input);

          const matches = [
            ...cropLogs.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g),
          ];
          if (matches.length === 0) {
            self.postMessage({
              id,
              type: 'detect',
              payload: { hasBars: false, crop: null },
            });
            break;
          }

          const last = matches[matches.length - 1]!;
          const [, w, h, x, y] = last;
          const crop = `${w}:${h}:${x}:${y}`;

          const dimMatch = cropLogs.match(/(\d{2,5})x(\d{2,5})/);
          let hasBars: boolean;
          if (!dimMatch) {
            hasBars = Number(x) > 0 || Number(y) > 0;
          } else {
            hasBars =
              Number(w) < Number(dimMatch[1]) ||
              Number(h) < Number(dimMatch[2]);
          }

          self.postMessage({ id, type: 'detect', payload: { hasBars, crop } });
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
