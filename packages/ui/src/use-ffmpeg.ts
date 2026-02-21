'use client';

import { useRef, useState, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

const CORE_VERSION = '0.12.10';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/umd`;

export type FFmpegStatus = 'idle' | 'loading' | 'processing' | 'ready';

/**
 * Lazy-loaded FFmpeg WASM hook.
 *
 * – Loads the multi-threaded core on first use.
 * – Exposes `interpolateFps()` to apply motion-interpolation to a video blob.
 */
export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [status, setStatus] = useState<FFmpegStatus>('idle');
  const [progress, setProgress] = useState(0);

  /** Ensure ffmpeg-core is loaded (idempotent). */
  const ensureLoaded = useCallback(async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;

    setStatus('loading');
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm',
      ),
      workerURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.worker.js`,
        'text/javascript',
      ),
    });

    ffmpegRef.current = ffmpeg;
    setStatus('ready');
    return ffmpeg;
  }, []);

  /**
   * Apply motion-interpolated FPS conversion using the minterpolate filter.
   *
   * @param videoUrl   URL (or object-URL) of the source video
   * @param targetFps  Target frame-rate (e.g. 60, 90, 120)
   * @returns          `{ objectUrl, blob }` – object-URL for immediate use
   *                   and the raw Blob for uploading back to the server.
   */
  const interpolateFps = useCallback(
    async (
      videoUrl: string,
      targetFps: number,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const ffmpeg = await ensureLoaded();
      setStatus('processing');
      setProgress(0);

      const inputName = 'input.mp4';
      const outputName = 'output.mp4';

      /* Write the source video into the WASM virtual FS */
      await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));

      /* Run the minterpolate filter — mirrors the user's requested command:
         ffmpeg -i <input> -filter:v "minterpolate=fps=<fps>:mi_mode=mci
           :mc_mode=aobmc:me_mode=bidir:vsbmc=1" <output>                 */
      const exitCode = await ffmpeg.exec([
        '-i',
        inputName,
        '-filter:v',
        `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
        outputName,
      ]);

      if (exitCode !== 0) {
        setStatus('ready');
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }

      /* Read the result back and create a blob URL */
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);

      /* Clean up virtual FS */
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setStatus('ready');
      return { objectUrl, blob };
    },
    [ensureLoaded],
  );

  /**
   * Convert an H.265 (HEVC) video to H.264 (AVC) using FFmpeg WASM.
   *
   * @param videoUrl   URL (or object-URL) of the source H.265 video
   * @returns          `{ objectUrl, blob }` – object-URL for immediate use
   *                   and the raw Blob for uploading back to the server.
   */
  const convertToH264 = useCallback(
    async (videoUrl: string): Promise<{ objectUrl: string; blob: Blob }> => {
      const ffmpeg = await ensureLoaded();
      setStatus('processing');
      setProgress(0);

      const inputName = 'input_h265.mp4';
      const outputName = 'output_h264.mp4';

      /* Write the source video into the WASM virtual FS */
      await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));

      /* Transcode H.265 → H.264 with libx264, copy audio stream */
      const exitCode = await ffmpeg.exec([
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'copy',
        outputName,
      ]);

      if (exitCode !== 0) {
        setStatus('ready');
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }

      /* Read the result back and create a blob URL */
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);

      /* Clean up virtual FS */
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setStatus('ready');
      return { objectUrl, blob };
    },
    [ensureLoaded],
  );

  /**
   * Detect and remove horizontal black bars (letterboxing) from a video using
   * the `cropdetect` + `crop` filter pipeline — all inside the WASM sandbox.
   *
   * **Pipeline:**
   * 1. Runs `cropdetect` on the full video (capturing FFmpeg log output) to
   *    determine the tightest crop rectangle that excludes black bars.
   * 2. Re-encodes the video with the detected `crop` filter applied; the audio
   *    stream is copied without re-encoding.
   *
   * @param videoUrl  URL (or object-URL) of the source video.
   * @param limit     Black-pixel intensity threshold (0–255). Pixels **above**
   *                  this value are considered non-black. Lower = stricter.
   *                  @default 24
   * @param round     Value that crop dimensions are rounded to. Use `2` for
   *                  4:2:2 content, `16` for most other codecs. @default 16
   * @returns         `{ objectUrl, blob }` – object-URL for immediate use and
   *                  the raw Blob for uploading back to the server.
   */
  const removeBlackBars = useCallback(
    async (
      videoUrl: string,
      limit = 24,
      round = 16,
    ): Promise<{ objectUrl: string; blob: Blob }> => {
      const ffmpeg = await ensureLoaded();
      setStatus('processing');
      setProgress(0);

      const inputName = 'input_bars.mp4';
      const outputName = 'output_cropped.mp4';

      /* Write the source video into the WASM virtual FS */
      await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));

      /* Step 1 – detect crop params via cropdetect.
         cropdetect writes results to stderr which surfaces as 'log' events in
         WASM. Capture every message and parse the last crop=W:H:X:Y token,
         which accumulates the largest (most representative) crop area. */
      let cropLogs = '';
      const logHandler = ({ message }: { message: string }) => {
        cropLogs += message + '\n';
      };
      ffmpeg.on('log', logHandler);

      await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        `cropdetect=limit=${limit}:round=${round}:reset=0`,
        '-f',
        'null',
        '-',
      ]);

      ffmpeg.off('log', logHandler);

      /* Parse the last "crop=W:H:X:Y" token from the accumulated log output */
      const matches = [...cropLogs.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
      if (matches.length === 0) {
        await ffmpeg.deleteFile(inputName);
        setStatus('ready');
        throw new Error(
          'removeBlackBars: no crop parameters detected — the video may have no black bars',
        );
      }
      const last = matches[matches.length - 1]!;
      const [, w, h, x, y] = last;

      /* Step 2 – apply crop filter; copy audio stream unchanged */
      const exitCode = await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        `crop=${w}:${h}:${x}:${y}`,
        '-c:a',
        'copy',
        outputName,
      ]);

      if (exitCode !== 0) {
        setStatus('ready');
        throw new Error(`FFmpeg exited with code ${exitCode}`);
      }

      /* Read the result back and create a blob URL */
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
      const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);

      /* Clean up virtual FS */
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setStatus('ready');
      return { objectUrl, blob };
    },
    [ensureLoaded],
  );

  /**
   * Detect whether a video contains horizontal bars (letterboxing) that can be
   * cropped away.  Supports both **black bars** (`limit` ≤ 24) and **white
   * bars** (`limit` set high, e.g. 230).
   *
   * Runs `cropdetect` inside the WASM sandbox and compares the detected crop
   * rectangle against the original video dimensions.
   *
   * @param videoUrl  URL (or object-URL) of the source video.
   * @param options   Optional overrides:
   *   - `limit`  – pixel intensity threshold (0-255). Pixels **above** this
   *                value are considered non-bar. Default `24` (black bars).
   *                Use a high value like `230` for white bars.
   *   - `round` – crop dimension rounding. @default 16
   * @returns `{ hasBars, crop }` – whether bars were detected and the raw
   *          `W:H:X:Y` crop string for informational use.
   */
  const detectBars = useCallback(
    async (
      videoUrl: string,
      options?: { limit?: number; round?: number },
    ): Promise<{ hasBars: boolean; crop: string | null }> => {
      const { limit = 24, round = 16 } = options ?? {};
      const ffmpeg = await ensureLoaded();

      const inputName = 'detect_bars_input.mp4';

      await ffmpeg.writeFile(inputName, await fetchFile(videoUrl));

      /* Capture cropdetect log output */
      let cropLogs = '';
      const logHandler = ({ message }: { message: string }) => {
        cropLogs += message + '\n';
      };
      ffmpeg.on('log', logHandler);

      await ffmpeg.exec([
        '-i',
        inputName,
        '-vf',
        `cropdetect=limit=${limit}:round=${round}:reset=0`,
        '-f',
        'null',
        '-',
      ]);

      ffmpeg.off('log', logHandler);
      await ffmpeg.deleteFile(inputName);

      /* Parse the last "crop=W:H:X:Y" token */
      const matches = [...cropLogs.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
      if (matches.length === 0) {
        return { hasBars: false, crop: null };
      }

      const last = matches[matches.length - 1]!;
      const [, w, h, x, y] = last;
      const crop = `${w}:${h}:${x}:${y}`;

      /* Determine original dimensions from ffmpeg log (look for "Video: …
         WxH" or the SAR/DAR line).  If the crop rectangle is smaller than
         the source, bars are present. */
      const dimMatch = cropLogs.match(/(\d{2,5})x(\d{2,5})/);
      if (!dimMatch) {
        /* Cannot determine source size – assume bars exist if crop offset
           is non-zero */
        return { hasBars: Number(x) > 0 || Number(y) > 0, crop };
      }

      const srcW = Number(dimMatch[1]);
      const srcH = Number(dimMatch[2]);
      const hasBars = Number(w) < srcW || Number(h) < srcH;

      return { hasBars, crop };
    },
    [ensureLoaded],
  );

  return { status, progress, interpolateFps, convertToH264, removeBlackBars, detectBars } as const;
}
