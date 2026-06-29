/**
 * Best-effort launch of a digital-copy URL into the matching Samsung TV app.
 *
 * Launching the target app (YouTube, Prime, etc.) is supported via the Tizen
 * ApplicationControl API; deep-linking to a *specific* video is NOT a documented
 * contract and most apps just open to their home screen. Falls back to a new tab
 * when not running on Tizen (e.g. browser dev).
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

export function appIdForUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '');
    return HOST_TO_APP_ID[host] ?? null;
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

  const control = new tizen.ApplicationControl(
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
