/**
 * Digital-copy URL classification for the web app.
 *
 * A digital copy is either a **provider title** we link out to (YouTube, Prime,
 * Netflix, Disney+, …) or a **self-hosted stream** - a direct media file on a
 * personal bucket (e.g. S3). Self-hosted copies play inline in an in-app video
 * player; provider copies open in a new tab / hand off to the native app.
 *
 * This mirrors `apps/cinelog-tv/src/lib/launch-app.ts` (`isSelfHostedCopy`),
 * kept as a separate copy because the two apps don't share a package.
 */

// Provider hosts we deep-link out to rather than play inline.
const PROVIDER_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "primevideo.com",
  "amazon.com",
  "watch.amazon.com",
  "netflix.com",
  "m.netflix.com",
  "disneyplus.com",
]);

/** True when the URL points at a known streaming provider we link out to. */
export function isProviderCopy(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return PROVIDER_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * URLs a browser `<video>` element can play directly (progressive or adaptive
 * media streams). A provider watch URL is *not* one of these.
 */
export function isDirectStream(rawUrl: string): boolean {
  return /\.(m3u8|mpd|mp4|m4v|mov|webm|ts)(?:[?#]|$)/i.test(rawUrl);
}

/**
 * True when the URL is a presigned S3 GET URL (an `X-Amz-Signature` SigV4 query
 * param, or a `Signature`+`Expires` SigV2 pair). These are the signed links the
 * API mints for a user's own bucket files, so we treat them as self-hosted even
 * when the object key has no recognised media extension (e.g. `.mkv`).
 */
export function isPresignedUrl(rawUrl: string): boolean {
  try {
    const params = new URL(rawUrl).searchParams;
    return (
      params.has("X-Amz-Signature") ||
      (params.has("Signature") && params.has("Expires"))
    );
  } catch {
    return false;
  }
}

/**
 * True when a digital-copy URL is a self-hosted media stream (e.g. a personal
 * S3 bucket) rather than an external provider: it matches no known provider
 * host *and* is either a direct media file or a presigned bucket URL. Such
 * copies play inline instead of launching a provider app / new tab.
 */
export function isSelfHostedCopy(rawUrl: string): boolean {
  return (
    !isProviderCopy(rawUrl) && (isDirectStream(rawUrl) || isPresignedUrl(rawUrl))
  );
}
