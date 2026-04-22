import { spawn } from 'node:child_process';

export type ProgressCallback = (percent: number) => void;

function runFfmpeg(args: string[], onProgress?: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });

    let durationSec = 0;
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      // Parse total duration on first pass
      if (!durationSec) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (m) {
          durationSec =
            parseInt(m[1]!, 10) * 3600 +
            parseInt(m[2]!, 10) * 60 +
            parseFloat(m[3]!);
        }
      }

      // Parse current position for progress
      if (onProgress && durationSec > 0) {
        const t = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (t) {
          const current =
            parseInt(t[1]!, 10) * 3600 +
            parseInt(t[2]!, 10) * 60 +
            parseFloat(t[3]!);
          onProgress(Math.min(99, Math.round((current / durationSec) * 100)));
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-2000)}`));
      }
    });

    proc.on('error', reject);
  });
}

export async function interpolateFps(
  input: string,
  output: string,
  fps: number,
  onProgress?: ProgressCallback,
): Promise<void> {
  await runFfmpeg(
    [
      '-i', input,
      '-filter:v', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
      '-preset', 'medium',
      output,
    ],
    onProgress,
  );
}

export async function removeBlackBars(
  input: string,
  output: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  // Step 1: detect crop params
  const cropString = await detectCrop(input);

  // Step 2: apply crop
  await runFfmpeg(
    ['-i', input, '-vf', cropString, '-c:a', 'copy', output],
    onProgress,
  );
}

async function detectCrop(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', input,
      '-vf', 'cropdetect=24:16:0',
      '-frames:v', '200',
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let output = '';
    proc.stderr.on('data', (c: Buffer) => { output += c.toString(); });
    proc.on('close', (code) => {
      if (code !== 0 && code !== 1) { reject(new Error('cropdetect failed')); return; }
      // Last cropdetect line wins
      const matches = [...output.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
      const last = matches.at(-1);
      if (!last) { reject(new Error('No crop detected')); return; }
      resolve(`crop=${last[1]!}`);
    });
    proc.on('error', reject);
  });
}

export async function convertToH264(
  input: string,
  output: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  await runFfmpeg(
    ['-i', input, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'copy', output],
    onProgress,
  );
}

export async function burnSubtitles(
  input: string,
  subtitles: string,
  output: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  await runFfmpeg(
    ['-i', input, '-vf', `ass=${subtitles}`, '-c:a', 'copy', output],
    onProgress,
  );
}
