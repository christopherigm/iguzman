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
 * - Prime Video opens a specific title when handed its canonical
 *   `primevideo.com/detail/<gti>` URL via the `view` operation. The id is a GTI
 *   (`amzn1.dv.gti.<uuid>`); catalog links arrive as Amazon share URLs
 *   (`watch.amazon.com/detail?gti=...`) which we rewrite to that detail URL.
 * - Netflix takes its catalog id via a `PAYLOAD` entry on the `default`
 *   operation. This payload contract is *unverified on the device fleet* -
 *   treat it as best-effort.
 *
 * Whenever the deep-link is ignored (or the id can't be extracted) we fall back
 * to a plain launch of the app's home screen, so a wrong/missing id never
 * breaks "open the app".
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
  // Amazon's canonical share host, e.g. watch.amazon.com/detail?gti=...
  'watch.amazon.com': PRIME_VIDEO_APP_ID,
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
 * Extract the Prime Video GTI (Amazon's Global Title Identifier, shaped
 * `amzn1.dv.gti.<uuid>`) from any common Amazon/Prime URL shape, or accept a
 * value that is already a bare GTI. The full `amzn1.dv.gti.` prefix is part of
 * the id and must be preserved - `primevideo.com/detail/<gti>` only resolves
 * with the prefix intact. Handles:
 *
 * - `watch.amazon.com/detail?gti=amzn1.dv.gti.<uuid>` (catalog share links)
 * - `primevideo.com/detail/<gti>` and `/dp/<gti>`
 * - `amazon.com/gp/video/detail/<gti>`
 */
export function primeVideoGti(rawUrl: string): string | null {
  const GTI = /amzn1\.dv\.gti\.[0-9a-z-]+/i;
  const bare = rawUrl.match(/^amzn1\.dv\.gti\.[0-9a-z-]+$/i);
  if (bare) return bare[0];
  try {
    const url = new URL(rawUrl);
    // Share links carry the GTI in a `gti` query param.
    const fromQuery = url.searchParams.get('gti')?.match(GTI);
    if (fromQuery) return fromQuery[0];
    // Detail pages carry it in the path.
    return url.pathname.match(GTI)?.[0] ?? null;
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
    // Prime Video navigates to a title when handed its canonical
    // primevideo.com detail URL via the `view` operation. Prefer the GTI
    // (amzn1.dv.gti.<uuid>); fall back to an older 10-char ASIN link.
    const gti = primeVideoGti(rawUrl);
    const asin = gti ? null : primeVideoAsin(rawUrl);
    const titleUrl = gti
      ? `https://www.primevideo.com/detail/${gti}`
      : asin
        ? `https://www.amazon.com/dp/${asin}`
        : null;
    if (titleUrl) {
      return new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        titleUrl,
        null,
        null,
        [new tizen.ApplicationControlData('url', [titleUrl])],
      );
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

/** Format a Tizen WebAPI error (or anything thrown) for on-screen debugging. */
function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const e = error as { name?: string; message?: string };
    return `${e.name ?? 'Error'}: ${e.message ?? ''}`;
  }
  return String(error);
}

/**
 * TEMPORARY on-device debug helper. Lists every installed app id/name whose id
 * or name mentions the given needle, via an `alert` (the TV has no console).
 * Wire it to a button to discover the *real* Prime Video app id on the fleet,
 * then remove. e.g. `debugFindApp('amazon')` / `debugFindApp('prime')`.
 */
export function debugFindApp(needle: string): void {
  const tizen = window.tizen;
  if (!tizen) {
    alert('not running on Tizen');
    return;
  }
  const q = needle.toLowerCase();
  tizen.application.getAppsInfo(
    (apps) => {
      const hits = apps
        .filter(
          (a) =>
            a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
        )
        .map((a) => `${a.name} → ${a.id}`);
      alert(hits.length ? hits.join('\n') : `no app matching "${needle}"`);
    },
    (err) => alert(`getAppsInfo failed: ${describeError(err)}`),
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

  // Deep-link straight to the title where we have a known deep-link contract
  // (YouTube / Netflix / Prime Video); otherwise a generic view request.
  const control = buildControl(tizen, appId, rawUrl);

  // If the deep-link is rejected, fall back to a plain launch of the app home.
  // TEMPORARY: every failure path alerts so we can see what the device does
  // (deep-link rejected vs. wrong app id vs. API throwing). Remove once the
  // Prime Video contract is confirmed on the fleet.
  try {
    tizen.application.launchAppControl(
      control,
      appId,
      () => undefined,
      (appControlErr) => {
        tizen.application.launch(
          appId,
          () => alert(`deep-link rejected, opened app home\n${describeError(appControlErr)}`),
          (launchErr) =>
            alert(
              `launch failed for app id ${appId}\n` +
                `appControl: ${describeError(appControlErr)}\n` +
                `launch: ${describeError(launchErr)}`,
            ),
        );
      },
    );
  } catch (thrown) {
    alert(`launchAppControl threw\nappId ${appId}\n${describeError(thrown)}`);
  }
}
