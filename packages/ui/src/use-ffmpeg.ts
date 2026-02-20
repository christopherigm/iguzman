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

  return { status, progress, interpolateFps, convertToH264 } as const;
}
