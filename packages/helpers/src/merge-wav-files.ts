import { execFile } from 'child_process';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

interface MixWavFilesOptions {
  /** List of WAV file paths to mix together simultaneously. */
  files: string[];
  /** Destination file path for the mixed output. */
  dest: string;
  /** Folder where source/destination audio files reside. */
  outputFolder?: string;
}

/**
 * Mixes multiple WAV audio files into a single file using ffmpeg's
 * `amix` filter. All input tracks are overlaid simultaneously and the
 * output duration matches the shortest input.
 *
 * For sequential concatenation, use `concatWavFiles` instead.
 *
 * @returns The relative media path of the output file (e.g. `media/output.wav`).
 *
 * @example
 * ```ts
 * const output = await mixWavFiles({
 *   files: ['vocals.wav', 'background.wav'],
 *   dest: 'mixed.wav',
 * });
 * ```
 */
const mixWavFiles = ({
  files,
  dest,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: MixWavFilesOptions): Promise<string> => {
  if (files.length === 0) {
    return Promise.reject(new Error('files array must not be empty'));
  }

  const destFile = `${outputFolder}/${dest}`;

  // Build the input args and filter stream labels for each source file.
  const inputArgs: string[] = [];
  const streamLabels: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const srcFile = `${outputFolder}/${files[i]}`;
    inputArgs.push('-i', srcFile);
    streamLabels.push(`[${i}:a]`);
  }

  // amix filter: overlay all audio streams simultaneously.
  // `duration=shortest` ends the output when the shortest input finishes.
  // @see https://ffmpeg.org/ffmpeg-filters.html#amix
  const filterComplex =
    `${streamLabels.join('')}amix=inputs=${files.length}:duration=shortest[out]`;

  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[out]',
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('Error mixing WAV files:', error);
        return reject(error);
      }
      resolve(`media/${dest}`);
    });
  });
};

export default mixWavFiles;
