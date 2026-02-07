import { execFile } from 'child_process';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

interface ChangeVolumeWavOptions {
  /** Source audio file path (a leading `media/` prefix is stripped automatically). */
  src: string;
  /** Destination audio file path (a leading `media/` prefix is stripped automatically). */
  dest: string;
  /**
   * Volume multiplier applied to the audio.
   *
   * - `1.0` keeps the original volume.
   * - Values **> 1** amplify (e.g. `2.0` = twice as loud).
   * - Values **< 1** attenuate (e.g. `0.5` = half as loud).
   * - `0` produces silence.
   */
  volume?: number;
  /** Folder where source/destination audio files reside. */
  outputFolder?: string;
}

/**
 * Changes the volume of a WAV audio file using ffmpeg's `volume` audio filter.
 *
 * @returns The relative media path of the output file (e.g. `media/output.wav`).
 *
 * @example
 * ```ts
 * // Reduce volume to 50%
 * const output = await changeVolumeWav({
 *   src: 'input.wav',
 *   dest: 'output.wav',
 *   volume: 0.5,
 * });
 * ```
 */
const changeVolumeWav = ({
  src,
  dest,
  volume = 1.0,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: ChangeVolumeWavOptions): Promise<string> => {
  if (volume < 0) {
    return Promise.reject(
      new Error(`volume must be non-negative, received: ${volume}`),
    );
  }

  /** Strip a leading `media/` prefix so paths are relative to outputFolder. */
  const stripMediaPrefix = (path: string): string =>
    path.startsWith('media/') ? path.slice('media/'.length) : path;

  const srcClean = stripMediaPrefix(src);
  const destClean = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${srcClean}`;
  const destFile = `${outputFolder}/${destClean}`;

  // @see https://trac.ffmpeg.org/wiki/AudioVolume
  const args = ['-y', '-i', srcFile, '-af', `volume=${volume}`, destFile];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('Error changing WAV volume:', error);
        return reject(error);
      }
      resolve(`media/${destClean}`);
    });
  });
};

export default changeVolumeWav;
