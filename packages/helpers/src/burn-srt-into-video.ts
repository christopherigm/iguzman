import { execFile } from 'child_process';
import * as fs from 'fs';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/**
 * SSA/ASS subtitle alignment values.
 * @see https://i.sstatic.net/qOmtO.png
 */
type SSAAlignment = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * SSA/ASS border style values.
 * - `1`: Outline + drop shadow (default SSA behaviour).
 * - `3`: Opaque box behind the text.
 */
type SSABorderStyle = 0 | 1 | 3;

interface BurnSRTOptions {
  /** Raw SRT subtitle content to burn into the video. */
  srtContent: string;
  /** Source video path relative to `outputFolder` (without leading `media/`). */
  srcVideo: string;
  /** Destination video path relative to `outputFolder` (without leading `media/`). */
  destVideo: string;
  /** SSA alignment position (numpad layout). @default 6 */
  alignment?: SSAAlignment;
  /** Vertical margin in pixels from the subtitle position. @default 40 */
  marginV?: number;
  /** Font family name used for the subtitles. @default "Roboto Bold" */
  font?: string;
  /** Font size in points for the subtitle text. @default 20 */
  fontSize?: number;
  /** SSA border style value. @default 0 */
  borderStyle?: SSABorderStyle;
  /** SSA BackColour in `&HAABBGGRR` hex format (without the leading `&`). @default "H70000000" */
  backColour?: string;
  /** Folder where source/destination videos and temp files reside. */
  outputFolder?: string;
}

/**
 * Burns SRT subtitles into a video file using ffmpeg.
 *
 * The function writes the SRT content to a temporary `.srt` file, runs ffmpeg
 * to hard-sub the subtitles with the specified style, and cleans up the temp
 * file afterwards (on both success and failure).
 *
 * @returns The relative media path of the output video (e.g. `media/output.mp4`).
 *
 * @example
 * ```ts
 * const output = await burnSRTIntoVideo({
 *   srtContent: srtString,
 *   srcVideo: 'input.mp4',
 *   destVideo: 'output.mp4',
 * });
 * ```
 */
const burnSRTIntoVideo = ({
  srtContent,
  srcVideo,
  destVideo,
  alignment = 6,
  marginV = 40,
  font = 'Roboto Bold',
  fontSize = 20,
  borderStyle = 0,
  backColour = 'H70000000',
  outputFolder = DEFAULT_OUTPUT_FOLDER,
}: BurnSRTOptions): Promise<string> => {
  /** Strip a leading `media/` prefix so paths are relative to outputFolder. */
  const stripMediaPrefix = (path: string): string =>
    path.startsWith('media/') ? path.slice('media/'.length) : path;

  const srcClean = stripMediaPrefix(srcVideo);
  const destClean = stripMediaPrefix(destVideo);

  const srcFile = `${outputFolder}/${srcClean}`;
  const destFile = `${outputFolder}/${destClean}`;
  const srtFilePath = `${outputFolder}/${destClean}.srt`;

  /** Remove the temporary SRT file, logging (not throwing) on failure. */
  const cleanupSrtFile = (): void => {
    try {
      if (fs.existsSync(srtFilePath)) {
        fs.unlinkSync(srtFilePath);
      }
    } catch (err) {
      console.error(`Failed to delete temp SRT file "${srtFilePath}":`, err);
    }
  };

  return new Promise<string>((resolve, reject) => {
    try {
      fs.writeFileSync(srtFilePath, srtContent, 'utf-8');
    } catch (err) {
      return reject(
        new Error(`Failed to write temp SRT file "${srtFilePath}": ${err}`),
      );
    }

    // Build the ASS/SSA force_style string for subtitle rendering.
    const forceStyle = [
      `FontName=${font}`,
      `FontSize=${fontSize}`,
      `BorderStyle=${borderStyle}`,
      `BackColour=&${backColour}`,
      `Alignment=${alignment}`,
      `MarginV=${marginV}`,
    ].join(',');

    const subtitleFilter = `subtitles=${srtFilePath}:force_style='${forceStyle}'`;

    // Use execFile with explicit args to avoid shell-injection risks.
    // @see https://stackoverflow.com/questions/8672809/use-ffmpeg-to-add-text-subtitles
    const args = ['-y', '-i', srcFile, '-vf', subtitleFilter, destFile];

    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('Error burning SRT into video:', error);
        cleanupSrtFile();
        return reject(error);
      }

      cleanupSrtFile();
      resolve(`media/${destClean}`);
    });
  });
};

export default burnSRTIntoVideo;
