import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IS_PRODUCTION =
  (process.env.NODE_ENV?.trim() ?? "localhost") === "production";

const COOKIES_PATH = IS_PRODUCTION
  ? "/app/netscape-cookies.txt"
  : "./netscape-cookies.txt";
const WRITABLE_COOKIES_PATH = IS_PRODUCTION
  ? "/tmp/netscape-cookies.txt"
  : join(tmpdir(), "netscape-cookies.txt");

const EMPTY_COOKIES = "# Netscape HTTP Cookie File\n";

/**
 * TikTok cookies that pin the session to a specific data center (IDC).
 *
 * A browser export made from an account registered outside the cluster's region
 * carries `tt-target-idc=alisg`, which forces every request to TikTok's
 * Singapore edge. That edge intermittently answers a video URL with the bare SPA
 * shell - no `__UNIVERSAL_DATA_FOR_REHYDRATION__` and no WAF challenge markup -
 * and yt-dlp reports the same misleading error it uses for a blocked response:
 *   ERROR: [TikTok] <id>: Unexpected response from webpage request
 * Measured over 15 interleaved runs: 8/15 with these cookies, 15/15 without.
 *
 * Dropping them lets TikTok route by request IP instead. The auth cookies
 * (`sessionid`, `sid_tt`, ...) are kept, so login-gated posts still resolve.
 */
const IDC_STEERING_COOKIES = new Set([
  "tt-target-idc",
  "tt-target-idc-sign",
  "store-idc",
]);

/**
 * Removes TikTok's IDC-steering cookies from Netscape-format cookie text.
 * Comments, blank lines and malformed rows are passed through untouched.
 */
export function stripIdcSteeringCookies(contents: string): string {
  return contents
    .split("\n")
    .filter((line) => {
      if (!line || line.startsWith("#")) return true;
      const fields = line.split("\t");
      if (fields.length < 7) return true;
      const [domain] = fields;
      const name = fields[5];
      return !(
        domain?.includes("tiktok.com") && IDC_STEERING_COOKIES.has(name ?? "")
      );
    })
    .join("\n");
}

let _sanitized = false;

/**
 * Returns a writable path to the cookies file.
 *
 * Two things make the copy necessary:
 *
 * 1. In production the K8s Secret is mounted read-only at
 *    /app/netscape-cookies.txt. yt-dlp writes updated cookies back on exit,
 *    which raises an OSError on a read-only filesystem.
 * 2. The copy is sanitized by {@link stripIdcSteeringCookies}, so the source
 *    file - the Secret in production, the developer's own export locally - is
 *    never mutated.
 *
 * If the source is missing or unreadable, an empty Netscape cookies file is
 * written instead so yt-dlp still has a writable target.
 */
export async function getWritableCookiesPath(): Promise<string> {
  // Re-read on every call in development so refreshing the export takes effect
  // without restarting the dev server; production writes once per process.
  if (IS_PRODUCTION && _sanitized) return WRITABLE_COOKIES_PATH;
  try {
    const contents = await readFile(COOKIES_PATH, "utf8");
    await writeFile(WRITABLE_COOKIES_PATH, stripIdcSteeringCookies(contents));
  } catch {
    await writeFile(WRITABLE_COOKIES_PATH, EMPTY_COOKIES);
  }
  _sanitized = true;
  return WRITABLE_COOKIES_PATH;
}
