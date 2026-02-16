import { execFile } from 'child_process';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/** Minimum value accepted by ffmpeg's `atempo` filter. */
const ATEMPO_MIN = 0.5;

/** Maximum value accepted by ffmpeg's `atempo` filter. */
const ATEMPO_MAX = 100;

interface ChangeVideoLengthOptions {
  /** Source video path (a leading `media/` prefix is stripped automatically). */
  src: string;
  /** Destination video path (a leading `media/` prefix is stripped automatically). */
  dest: string;
  /**
   * PTS (Presentation Time Stamp) multiplier applied to the video stream.
   *
   * - Values **> 1** slow the video down (e.g. `2` = half speed).
   * - Values **< 1** speed the video up (e.g. `0.5` = double speed).
   *
   * The audio tempo is adjusted automatically as the inverse (`1 / setptsFactor`).
   */
  setptsFactor: number;
  /** Folder where source/destination videos reside. */
  outputFolder?: string;
}

/**
 * Build a chain of `atempo` filters that stays within ffmpeg's accepted range
 * (0.5–100). For extreme speed changes a single `atempo` value would be
 * out-of-range, so multiple filters are chained.
 *
 * @example
 * ```ts
 * buildAtempoChain(4);  // "atempo=4"
 * buildAtempoChain(200); // "atempo=100,atempo=2"  (100 * 2 = 200)
 * buildAtempoChain(0.1); // "atempo=0.5,atempo=0.2" (0.5 * 0.2 = 0.1)
 * ```
 */
const buildAtempoChain = (tempo: number): string => {
  const filters: string[] = [];
  let remaining = tempo;

  while (remaining > ATEMPO_MAX) {
    filters.push(`atempo=${ATEMPO_MAX}`);
    remaining /= ATEMPO_MAX;
  }

  while (remaining < ATEMPO_MIN) {
    filters.push(`atempo=${ATEMPO_MIN}`);
    remaining /= ATEMPO_MIN;
  }

  filters.push(`atempo=${remaining}`);
  return filters.join(',');
};

/**
 * Changes the playback speed of a video (and its audio) using ffmpeg.
 *
 * Applies a `setpts` filter to the video stream and a matching `atempo` filter
 * chain to the audio stream so both stay in sync.
 *
 * @returns The relative media path of the output video (e.g. `media/output.mp4`).
 *
 * @example
 * ```ts
 * // Double the playback speed
 * const output = await changeVideoLength({
 *   src: 'input.mp4',
 *   dest: 'output.mp4',
 *   setptsFactor: 0.5,
 * });
 * ```
 */
const changeVideoLength = ({
  src,
  dest,
  setptsFactor,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: ChangeVideoLengthOptions): Promise<string> => {
  if (setptsFactor <= 0) {
    return Promise.reject(
      new Error(`setptsFactor must be positive, received: ${setptsFactor}`),
    );
  }

  /** Strip a leading `media/` prefix so paths are relative to outputFolder. */
  const stripMediaPrefix = (path: string): string =>
    path.startsWith('media/') ? path.slice('media/'.length) : path;

  const srcClean = stripMediaPrefix(src);
  const destClean = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${srcClean}`;
  const destFile = `${outputFolder}/${destClean}`;

  // Audio tempo is the inverse of the PTS factor:
  // setpts=0.5*PTS → 2x faster video → atempo=2 (2x faster audio).
  const audioTempo = 1 / setptsFactor;
  const atempoFilter = buildAtempoChain(audioTempo);

  // @see https://trac.ffmpeg.org/wiki/How%20to%20speed%20up%20/%20slow%20down%20a%20video
  const args = [
    '-y',
    '-i',
    srcFile,
    '-filter:v',
    `setpts=${setptsFactor}*PTS`,
    '-filter:a',
    atempoFilter,
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('Error changing video length:', error);
        return reject(error);
      }
      resolve(`media/${destClean}`);
    });
  });
};

export default changeVideoLength;
