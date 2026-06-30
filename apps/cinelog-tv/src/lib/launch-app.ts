/**
 * Best-effort launch of a digital-copy URL into the matching Samsung TV app.
 *
 * Launching the target app (YouTube, Prime, Netflix, etc.) is supported via the
 * Tizen ApplicationControl API. For some apps we can also deep-link to a
 * *specific* title rather than just opening the home screen:
 *
 * - YouTube parses a `PAYLOAD` app-control entry of the form `v=<videoId>`
 *   passed with the `default` operation. The generic `view` operation with a
 *   `url` data key is ignored by YouTube and only opens its home screen.
 * - Prime Video and Netflix likewise take their title id (ASIN / catalog id)
 *   via a `PAYLOAD` entry on the `default` operation. These payload contracts
 *   are *unverified on the device fleet* - treat them as best-effort. Whenever
 *   the deep-link is ignored (or the id can't be extracted) we fall back to a
 *   plain launch of the app's home screen, so a wrong payload never breaks
 *   "open the app".
 *
 * Falls back to a new tab when not running on Tizen (e.g. browser dev).
 */

const YOUTUBE_APP_ID = '111299001912';
const PRIME_VIDEO_APP_ID = '3201512006785';
const NETFLIX_APP_ID = '3201907018807';
const DISNEY_PLUS_APP_ID = '3201901017640';

// Tizen numeric app IDs (region-dependent; verify on the target fleet).
const HOST_TO_APP_ID: Record<string, string> = {
  'youtube.com': YOUTUBE_APP_ID,
  'youtu.be': YOUTUBE_APP_ID,
  'm.youtube.com': YOUTUBE_APP_ID,
  'primevideo.com': PRIME_VIDEO_APP_ID,
  'amazon.com': PRIME_VIDEO_APP_ID,
  'netflix.com': NETFLIX_APP_ID,
  'disneyplus.com': DISNEY_PLUS_APP_ID,
};

export function appIdForUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '');
    return HOST_TO_APP_ID[host] ?? null;
  } catch {
    return null;
  }
}

/** Extract the YouTube video id from any common YouTube URL shape. */
export function youtubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery) return fromQuery;
      // /embed/<id>, /shorts/<id>, /v/<id>
      const match = url.pathname.match(/^\/(?:embed|shorts|v)\/([^/?]+)/);
      return match?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the Netflix catalog id from any common Netflix URL shape, or accept a
 * value that is already a bare catalog id. Netflix catalog ids are all-digits.
 */
export function netflixTitleId(rawUrl: string): string | null {
  if (/^\d+$/.test(rawUrl)) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'netflix.com' && host !== 'm.netflix.com') return null;
    // /title/<id>, /watch/<id>, optionally locale-prefixed (/<lang>/title/<id>)
    const match = url.pathname.match(/\/(?:title|watch)\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the Prime Video ASIN from any common Prime/Amazon URL shape, or accept
 * a value that is already a bare ASIN (10-char alphanumeric, e.g. `B0ABCD1234`).
 */
export function primeVideoAsin(rawUrl: string): string | null {
  if (/^[A-Z0-9]{10}$/i.test(rawUrl)) return rawUrl.toUpperCase();
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host !== 'primevideo.com' && host !== 'amazon.com') return null;
    // /detail/<asin>, /dp/<asin>, /gp/video/detail/<asin>
    const match = url.pathname.match(
      /\/(?:detail|dp|gp\/video\/detail)\/([A-Z0-9]{10})/i,
    );
    return match?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the best deep-link ApplicationControl for the resolved app, or a generic
 * `view` control when the app has no known deep-link contract / no id could be
 * extracted. A null deep-link id is fine - the caller falls back to a plain app
 * launch if launchAppControl errors.
 */
function buildControl(
  tizen: NonNullable<Window['tizen']>,
  appId: string,
  rawUrl: string,
): InstanceType<NonNullable<Window['tizen']>['ApplicationControl']> {
  const defaultOp = 'http://tizen.org/appcontrol/operation/default';

  if (appId === YOUTUBE_APP_ID) {
    const videoId = youtubeVideoId(rawUrl);
    if (videoId) {
      return new tizen.ApplicationControl(defaultOp, null, null, null, [
        new tizen.ApplicationControlData('PAYLOAD', [`v=${videoId}`]),
      ]);
    }
  } else if (appId === NETFLIX_APP_ID) {
    const titleId = netflixTitleId(rawUrl);
    if (titleId) {
      // Best-effort, unverified: Netflix navigates to the title given its
      // catalog id as PAYLOAD. Falls back to a plain launch if ignored.
      return new tizen.ApplicationControl(defaultOp, null, null, null, [
        new tizen.ApplicationControlData('PAYLOAD', [titleId]),
      ]);
    }
  } else if (appId === PRIME_VIDEO_APP_ID) {
    const asin = primeVideoAsin(rawUrl);
    if (asin) {
      // Best-effort, unverified: Prime Video opens the title given its ASIN as
      // PAYLOAD. Falls back to a plain launch if ignored.
      return new tizen.ApplicationControl(defaultOp, null, null, null, [
        new tizen.ApplicationControlData('PAYLOAD', [`asin=${asin}`]),
      ]);
    }
  }

  // Unknown app or no extractable id: generic view request.
  return new tizen.ApplicationControl(
    'http://tizen.org/appcontrol/operation/view',
    rawUrl,
    null,
    null,
    [new tizen.ApplicationControlData('url', [rawUrl])],
  );
}

export function launchDigitalCopy(rawUrl: string): void {
  const tizen = window.tizen;
  const appId = appIdForUrl(rawUrl);

  if (!tizen || !appId) {
    // Dev fallback (browser) or unknown host: open in a new tab.
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // Deep-link straight to the title where we have a known PAYLOAD contract
  // (YouTube / Netflix / Prime Video); otherwise a generic view request.
  const control = buildControl(tizen, appId, rawUrl);

  // If launchAppControl fails, fall back to a plain launch of the app.
  tizen.application.launchAppControl(
    control,
    appId,
    () => undefined,
    () => tizen.application.launch(appId),
  );
}
