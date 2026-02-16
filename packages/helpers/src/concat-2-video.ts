import { execFile } from 'child_process';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

interface Concat2VideosOptions {
  /** First source video path (a leading `media/` prefix is stripped automatically). */
  src1: string;
  /** Second source video path (a leading `media/` prefix is stripped automatically). */
  src2: string;
  /** Destination video path (a leading `media/` prefix is stripped automatically). */
  dest: string;
  /** Folder where source/destination video files reside. */
  outputFolder?: string;
}

/**
 * Concatenates two video files sequentially using ffmpeg's `concat` filter.
 *
 * Both videos must share the same resolution, codec, and frame rate for a
 * seamless concatenation. The audio streams are also concatenated.
 *
 * @returns The relative media path of the output video (e.g. `media/output.mp4`).
 *
 * @example
 * ```ts
 * const output = await concat2Videos({
 *   src1: 'part1.mp4',
 *   src2: 'part2.mp4',
 *   dest: 'combined.mp4',
 * });
 * ```
 */
const concat2Videos = ({
  src1,
  src2,
  dest,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: Concat2VideosOptions): Promise<string> => {
  /** Strip a leading `media/` prefix so paths are relative to outputFolder. */
  const stripMediaPrefix = (path: string): string =>
    path.startsWith('media/') ? path.slice('media/'.length) : path;

  const src1Clean = stripMediaPrefix(src1);
  const src2Clean = stripMediaPrefix(src2);
  const destClean = stripMediaPrefix(dest);

  const src1File = `${outputFolder}/${src1Clean}`;
  const src2File = `${outputFolder}/${src2Clean}`;
  const destFile = `${outputFolder}/${destClean}`;

  // Concat filter: take video+audio from both inputs, produce single output.
  // @see https://trac.ffmpeg.org/wiki/Concatenate#filterdemuxer
  const filterComplex =
    '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]';

  const args = [
    '-y',
    '-i',
    src1File,
    '-i',
    src2File,
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]',
    '-map',
    '[outa]',
    destFile,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('Error concatenating videos:', error);
        return reject(error);
      }
      resolve(`media/${destClean}`);
    });
  });
};

export default concat2Videos;
