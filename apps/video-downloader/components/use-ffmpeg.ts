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
   * @returns          Object-URL pointing to the processed video blob
   */
  const interpolateFps = useCallback(
    async (videoUrl: string, targetFps: number): Promise<string> => {
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
      return objectUrl;
    },
    [ensureLoaded],
  );

  return { status, progress, interpolateFps } as const;
}
