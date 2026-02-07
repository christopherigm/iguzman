import { execFile } from 'child_process';
import getRandomNumber from '@iguzman/helpers/random-number';

const nodeEnv = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Options for downloading an image via `wget`. */
interface DownloadImageOptions {
  /** The remote URL of the image to download. */
  url: string;
  /** The desired file name (without extension). A `media/` prefix is stripped automatically. */
  name: string;
  /** Directory where the image will be saved. Defaults based on `NODE_ENV`. */
  outputFolder?: string;
  /** Path to a Netscape-format cookies file for authenticated requests. Defaults based on `NODE_ENV`. */
  cookies?: string;
}

/**
 * Downloads an image from a remote URL using `wget` and saves it as a JPEG file.
 *
 * When {@link DownloadImageOptions.name | name} is empty or contains only `media/`,
 * a random numeric name is generated as a fallback.
 *
 * @param options - The download configuration
 * @returns The relative media path of the downloaded file (e.g. `media/photo.jpg`)
 */
const downloadImage = ({
  url,
  name,
  outputFolder = nodeEnv === 'production' ? '/app/media' : 'public/media',
  cookies = nodeEnv === 'production'
    ? '/app/netscape-cookies.txt'
    : './netscape-cookies.txt',
}: DownloadImageOptions): Promise<string> => {
  /** Strip the `media/` prefix, falling back to a random ID for empty names. */
  const baseName =
    name.replaceAll('media/', '') || getRandomNumber(1, 19999).toString();
  const file = `${outputFolder}/${baseName}.jpg`;

  return new Promise((resolve, reject) => {
    execFile(
      'wget',
      ['--load-cookies', cookies, url, '-O', file],
      { maxBuffer: 1024 * 2048 },
      (error) => {
        if (error) {
          console.error('Failed to download image:', error);
          return reject(error);
        }
        return resolve(`media/${baseName}.jpg`);
      },
    );
  });
};

export default downloadImage;
