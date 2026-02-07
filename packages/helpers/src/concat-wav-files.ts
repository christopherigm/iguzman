import { execFile } from 'child_process';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

interface ConcatWavFilesOptions {
  /** List of source WAV file paths to concatenate (a leading `media/` prefix is stripped automatically). */
  files: string[];
  /** Destination file path for the concatenated output (a leading `media/` prefix is stripped automatically). */
  dest: string;
  /** Folder where source/destination audio files reside. */
  outputFolder?: string;
}

/**
 * Concatenates multiple WAV audio files into a single file using ffmpeg's
 * `concat` audio filter.
 *
 * The files are joined sequentially in the order provided. All source files
 * should share the same sample rate and channel layout for seamless output.
 *
 * @returns The relative media path of the output file (e.g. `media/output.wav`).
 *
 * @example
 * ```ts
 * const output = await concatWavFiles({
 *   files: ['intro.wav', 'speech.wav', 'outro.wav'],
 *   dest: 'combined.wav',
 * });
 * ```
 */
const concatWavFiles = ({
  files,
  dest,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: ConcatWavFilesOptions): Promise<string> => {
  if (files.length === 0) {
    return Promise.reject(new Error('files array must not be empty'));
  }

  /** Strip a leading `media/` prefix so paths are relative to outputFolder. */
  const stripMediaPrefix = (path: string): string =>
    path.startsWith('media/') ? path.slice('media/'.length) : path;

  const destClean = stripMediaPrefix(dest);
  const destFile = `${outputFolder}/${destClean}`;

  // Build the input args and filter stream labels for each source file.
  const inputArgs: string[] = [];
  const streamLabels: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const srcFile = `${outputFolder}/${stripMediaPrefix(files[i])}`;
    inputArgs.push('-i', srcFile);
    streamLabels.push(`[${i}:a]`);
  }

  // Concat filter: join all audio streams sequentially.
  // @see https://trac.ffmpeg.org/wiki/Concatenate#filterdemuxer
  const filterComplex =
    `${streamLabels.join('')}concat=n=${files.length}:v=0:a=1[out]`;

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
        console.error('Error concatenating WAV files:', error);
        return reject(error);
      }
      resolve(`media/${destClean}`);
    });
  });
};

export default concatWavFiles;
