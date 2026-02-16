import { execFile } from 'child_process';

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Follows all HTTP redirects for a URL and returns the final
 * (effective) URL that curl lands on.
 *
 * Uses `curl -Ls` to silently follow redirects without downloading
 * the response body, then reads the effective URL via
 * `-w '%{url_effective}'`.
 *
 * Falls back to the original URL when the request fails (e.g. network
 * error, invalid URL).
 *
 * Uses `execFile` with an explicit args array to prevent
 * shell-injection risks.
 *
 * @param url - The URL to resolve.
 * @returns The final URL after all redirects.
 */
const getFinalURL = (url: string): Promise<string> =>
  new Promise((resolve) => {
    const args = [
      '-Ls',
      '-o', '/dev/null',
      '-w', '%{url_effective}',
      url,
    ];

    execFile('curl', args, (error, stdout) => {
      if (error) {
        console.error('getFinalURL error:', error);
        resolve(url);
        return;
      }

      resolve(stdout.trim() || url);
    });
  });

export default getFinalURL;
