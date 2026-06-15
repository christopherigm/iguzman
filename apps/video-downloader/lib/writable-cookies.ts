import { copyFile, writeFile } from "node:fs/promises";

const IS_PRODUCTION =
  (process.env.NODE_ENV?.trim() ?? "localhost") === "production";

const COOKIES_PATH = IS_PRODUCTION
  ? "/app/netscape-cookies.txt"
  : "./netscape-cookies.txt";
const WRITABLE_COOKIES_PATH = IS_PRODUCTION
  ? "/tmp/netscape-cookies.txt"
  : COOKIES_PATH;

let _cookiesCopied = false;

/**
 * Returns a writable path to the cookies file.
 *
 * In production the K8s Secret is mounted read-only at /app/netscape-cookies.txt.
 * yt-dlp tries to write updated cookies back on exit, which causes an OSError on
 * a read-only filesystem. This copies the file to /tmp once per process so yt-dlp
 * has a writable path. If the copy fails (source missing or unreadable), an empty
 * Netscape cookies file is written to /tmp so yt-dlp still has a writable target.
 */
export async function getWritableCookiesPath(): Promise<string> {
  if (!IS_PRODUCTION) return COOKIES_PATH;
  if (!_cookiesCopied) {
    try {
      await copyFile(COOKIES_PATH, WRITABLE_COOKIES_PATH);
    } catch {
      await writeFile(WRITABLE_COOKIES_PATH, "# Netscape HTTP Cookie File\n");
    }
    _cookiesCopied = true;
  }
  return WRITABLE_COOKIES_PATH;
}
