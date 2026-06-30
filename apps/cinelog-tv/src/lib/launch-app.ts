/**
 * Best-effort launch of a digital-copy URL into the matching Samsung TV app.
 *
 * Launching the target app (YouTube, Prime, etc.) is supported via the Tizen
 * ApplicationControl API. For YouTube we can also deep-link to a *specific*
 * video: the Tizen YouTube app parses a `PAYLOAD` app-control entry of the form
 * `v=<videoId>` passed with the `default` operation. The generic `view`
 * operation with a `url` data key (used before) is ignored by YouTube and only
 * opens its home screen. Falls back to a new tab when not running on Tizen
 * (e.g. browser dev).
 */

// Tizen numeric app IDs (region-dependent; verify on the target fleet).
const HOST_TO_APP_ID: Record<string, string> = {
  'youtube.com': '111299001912',
  'youtu.be': '111299001912',
  'm.youtube.com': '111299001912',
  'primevideo.com': '3201512006785',
  'amazon.com': '3201512006785',
  'netflix.com': '3201907018807',
  'disneyplus.com': '3201901017640',
};

const YOUTUBE_APP_ID = '111299001912';

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

export function launchDigitalCopy(rawUrl: string): void {
  const tizen = window.tizen;
  const appId = appIdForUrl(rawUrl);

  if (!tizen || !appId) {
    // Dev fallback (browser) or unknown host: open in a new tab.
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // YouTube: deep-link straight to the video via the PAYLOAD `v=<id>` contract.
  const videoId = appId === YOUTUBE_APP_ID ? youtubeVideoId(rawUrl) : null;
  const control = videoId
    ? new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/default',
        null,
        null,
        null,
        [new tizen.ApplicationControlData('PAYLOAD', [`v=${videoId}`])],
      )
    : new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        rawUrl,
        null,
        null,
        [new tizen.ApplicationControlData('url', [rawUrl])],
      );

  // If launchAppControl fails, fall back to a plain launch of the app.
  tizen.application.launchAppControl(
    control,
    appId,
    () => undefined,
    () => tizen.application.launch(appId),
  );
}
