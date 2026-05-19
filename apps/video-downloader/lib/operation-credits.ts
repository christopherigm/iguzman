import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { OperationCredits } from './types';

export type { OperationCredits };

const execFileAsync = promisify(execFile);

export interface VideoMeta {
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

const BASE: Record<keyof OperationCredits, number> = {
  scaleDown: 3,
  removeBlackBars: 2,
  convertToH264: 3,
  convertToH265: 4,
  burnSubtitles: 3,
  interpolateFps2x: 5,
  interpolateFps4x: 7,
  interpolateFps8x: 10,
};

function resolutionFactor(
  width?: number | null,
  height?: number | null,
): number {
  if (!width || !height) return 1.0;
  const short = Math.min(width, height);
  if (short <= 480) return 0.5;
  if (short <= 720) return 1.0;
  if (short <= 1080) return 1.5;
  if (short <= 1440) return 2.0;
  return 3.0;
}

function durationFactor(seconds?: number | null): number {
  if (!seconds) return 1.0;
  if (seconds <= 60) return 0.5;
  if (seconds <= 300) return 1.0;
  if (seconds <= 900) return 1.5;
  if (seconds <= 1800) return 2.0;
  return 2.5;
}

export function calculateOperationCredits(meta: VideoMeta): OperationCredits {
  const rf = resolutionFactor(meta.width, meta.height);
  const df = durationFactor(meta.durationSeconds);
  const calc = (base: number) => Math.ceil(base * rf * df);

  return {
    scaleDown: calc(BASE.scaleDown),
    removeBlackBars: calc(BASE.removeBlackBars),
    convertToH264: calc(BASE.convertToH264),
    convertToH265: calc(BASE.convertToH265),
    burnSubtitles: calc(BASE.burnSubtitles),
    interpolateFps2x: calc(BASE.interpolateFps2x),
    interpolateFps4x: calc(BASE.interpolateFps4x),
    interpolateFps8x: calc(BASE.interpolateFps8x),
  };
}

export async function getVideoMetaFromFile(
  filePath: string,
): Promise<VideoMeta> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);
    const data = JSON.parse(stdout) as {
      streams?: { codec_type: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const vs = data.streams?.find((s) => s.codec_type === 'video');
    return {
      width: vs?.width ?? null,
      height: vs?.height ?? null,
      durationSeconds: data.format?.duration
        ? parseFloat(data.format.duration)
        : null,
    };
  } catch {
    return {};
  }
}

export async function calculateOperationCreditsFromFile(
  filePath: string,
): Promise<OperationCredits> {
  const meta = await getVideoMetaFromFile(filePath);
  return calculateOperationCredits(meta);
}

/**
 * Returns the interpolateFps credit cost for a given target FPS.
 * Determines the multiplier from targetFps / sourceFps, defaulting to 2× when sourceFps is unknown.
 */
export function interpolateFpsCost(
  credits: OperationCredits,
  targetFps: number,
  sourceFps: number | null | undefined,
): number {
  if (!sourceFps || sourceFps <= 0) return credits.interpolateFps2x;
  const ratio = targetFps / sourceFps;
  if (ratio <= 3) return credits.interpolateFps2x;
  if (ratio <= 6) return credits.interpolateFps4x;
  return credits.interpolateFps8x;
}
