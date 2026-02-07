import { execFile } from 'child_process';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options for {@link cutVideoLength}. */
export interface CutVideoLengthOptions {
  /** Source video path (a leading `media/` prefix is stripped automatically). */
  src: string;
  /** Destination video path (a leading `media/` prefix is stripped automatically). */
  dest: string;
  /** Start time in seconds. @default 0 */
  ss?: number;
  /** End time in seconds. @default 5 */
  to?: number;
  /** When `true`, only the audio stream is copied (video is dropped). @default false */
  justAudio?: boolean;
  /** Folder that contains the media files. */
  outputFolder?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strips a leading `media/` prefix from a path, if present.
 *
 * Only the first occurrence at the start of the string is removed so
 * that nested segments like `some/media/file.mp4` stay intact.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Trims a video (or audio) file to the segment between `ss` and `to`
 * using ffmpeg.
 *
 * `-ss` is placed before `-i` so ffmpeg uses fast input seeking
 * instead of decoding and discarding every frame from the start.
 *
 * Uses `execFile` with an explicit args array to prevent
 * shell-injection risks.
 *
 * @returns The relative media path of the output file
 *          (e.g. `media/trimmed.mp4`).
 */
const cutVideoLength = ({
  src,
  dest,
  ss = 0,
  to = 5,
  justAudio = false,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: CutVideoLengthOptions): Promise<string> => {
  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcPath = `${outputFolder}/${cleanSrc}`;
  const destPath = `${outputFolder}/${cleanDest}`;

  const args = [
    '-y',
    '-ss', String(ss),
    '-to', String(to),
    '-i', srcPath,
    ...(justAudio ? ['-c:a', 'copy'] : ['-c:v', 'libx264', '-c:a', 'copy']),
    destPath,
  ];

  return new Promise<string>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('ffmpeg cut-video error:', error);
        return reject(error);
      }
      return resolve(`media/${cleanDest}`);
    });
  });
};

export default cutVideoLength;
