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
 * - Netflix takes its catalog id via a `PAYLOAD` entry on the `default`
 *   operation. This payload contract is *unverified on the device fleet* -
 *   treat it as best-effort.
 * - Prime Video has *no* usable deep-link on Tizen: title deep-linking is gated
 *   behind Amazon's partner onboarding, and every public control shape (default
 *   + PAYLOAD carrying the GTI/ASIN, `view` + a primevideo/watch.amazon URL) was
 *   tried on-device and only ever opens the app home screen. So Prime just
 *   launches home via the generic `view` request - see the tester history in git
 *   if you want to re-explore. The app id itself (`org.tizen.primevideo`) is
 *   verified on the fleet.
 *
 * Whenever the deep-link is ignored (or the id can't be extracted) we fall back
 * to a plain launch of the app's home screen, so a wrong/missing id never
 * breaks "open the app".
 *
 * Falls back to a new tab when not running on Tizen (e.g. browser dev).
 */

const YOUTUBE_APP_ID = "111299001912";
const PRIME_VIDEO_APP_ID = "org.tizen.primevideo";
const NETFLIX_APP_ID = "3201907018807";
const DISNEY_PLUS_APP_ID = "3201901017640";

// Tizen numeric app IDs (region-dependent; verify on the target fleet).
const HOST_TO_APP_ID: Record<string, string> = {
  "youtube.com": YOUTUBE_APP_ID,
  "youtu.be": YOUTUBE_APP_ID,
  "m.youtube.com": YOUTUBE_APP_ID,
  "primevideo.com": PRIME_VIDEO_APP_ID,
  "amazon.com": PRIME_VIDEO_APP_ID,
  // Amazon's canonical share host, e.g. watch.amazon.com/detail?gti=...
  "watch.amazon.com": PRIME_VIDEO_APP_ID,
  "netflix.com": NETFLIX_APP_ID,
  "disneyplus.com": DISNEY_PLUS_APP_ID,
};

export function appIdForUrl(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return HOST_TO_APP_ID[host] ?? null;
  } catch {
    return null;
  }
}

/** Extract the YouTube video id from any common YouTube URL shape. */
export function youtubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return url.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const fromQuery = url.searchParams.get("v");
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
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "netflix.com" && host !== "m.netflix.com") return null;
    // /title/<id>, /watch/<id>, optionally locale-prefixed (/<lang>/title/<id>)
    const match = url.pathname.match(/\/(?:title|watch)\/(\d+)/);
    return match?.[1] ?? null;
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
  tizen: NonNullable<Window["tizen"]>,
  appId: string,
  rawUrl: string,
): InstanceType<NonNullable<Window["tizen"]>["ApplicationControl"]> {
  const defaultOp = "http://tizen.org/appcontrol/operation/default";

  if (appId === YOUTUBE_APP_ID) {
    const videoId = youtubeVideoId(rawUrl);
    if (videoId) {
      return new tizen.ApplicationControl(defaultOp, null, null, null, [
        new tizen.ApplicationControlData("PAYLOAD", [`v=${videoId}`]),
      ]);
    }
  } else if (appId === NETFLIX_APP_ID) {
    const titleId = netflixTitleId(rawUrl);
    if (titleId) {
      // Best-effort, unverified: Netflix navigates to the title given its
      // catalog id as PAYLOAD. Falls back to a plain launch if ignored.
      return new tizen.ApplicationControl(defaultOp, null, null, null, [
        new tizen.ApplicationControlData("PAYLOAD", [titleId]),
      ]);
    }
  }
  // Prime Video (org.tizen.primevideo) intentionally has no branch: title
  // deep-linking is partner-gated and no public control shape works, so it
  // falls through to the generic view request below and opens the app home.

  // Unknown app or no extractable id: generic view request.
  return new tizen.ApplicationControl(
    "http://tizen.org/appcontrol/operation/view",
    rawUrl,
    null,
    null,
    [new tizen.ApplicationControlData("url", [rawUrl])],
  );
}

/**
 * Keywords to search the installed-app list with when a launch fails, keyed by
 * the app id we *tried*. Lets a "No matched application found" alert tell us the
 * real installed id for that platform on the fleet (ids are region-dependent).
 */
const APP_ID_TO_NEEDLES: Record<string, string[]> = {
  [YOUTUBE_APP_ID]: ["youtube"],
  [PRIME_VIDEO_APP_ID]: ["prime", "amazon"],
  [NETFLIX_APP_ID]: ["netflix"],
  [DISNEY_PLUS_APP_ID]: ["disney"],
};

/**
 * On-device diagnostic. Given the app id we failed to launch, look up the
 * *actually installed* apps that match that platform's keywords and append their
 * real ids to the failure alert - so a wrong/region-specific id (Netflix and
 * Disney+ are still unverified) can be read straight off the TV and hard-coded.
 */
function alertWithInstalledMatches(
  tizen: NonNullable<Window["tizen"]>,
  failedAppId: string,
  baseMessage: string,
): void {
  const needles = APP_ID_TO_NEEDLES[failedAppId];
  if (!needles) {
    alert(baseMessage);
    return;
  }
  tizen.application.getAppsInfo(
    (apps) => {
      const hits = apps
        .filter((a) => {
          const hay = `${a.id} ${a.name}`.toLowerCase();
          return needles.some((n) => hay.includes(n));
        })
        .map((a) => `${a.name} → ${a.id}`);
      alert(
        `${baseMessage}\n\nInstalled matches:\n` +
          (hits.length ? hits.join("\n") : `none for ${needles.join(", ")}`),
      );
    },
    (err) => alert(`${baseMessage}\n\ngetAppsInfo failed: ${describeError(err)}`),
  );
}

/** Format a Tizen WebAPI error (or anything thrown) for on-screen debugging. */
function describeError(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const e = error as { name?: string; message?: string };
    return `${e.name ?? "Error"}: ${e.message ?? ""}`;
  }
  return String(error);
}

export function launchDigitalCopy(rawUrl: string): void {
  const tizen = window.tizen;
  const appId = appIdForUrl(rawUrl);

  if (!tizen || !appId) {
    // Dev fallback (browser) or unknown host: open in a new tab.
    window.open(rawUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // Deep-link straight to the title where we have a known deep-link contract
  // (YouTube / Netflix); otherwise a generic view request that opens app home.
  const control = buildControl(tizen, appId, rawUrl);

  // If the app control is rejected, fall back to a plain launch of the app home
  // so a deep-link that the app ignores never breaks "open the app". Only a
  // genuine launch failure (wrong/uninstalled id) surfaces to the user - and it
  // lists the real installed ids for that platform to make the fix obvious.
  try {
    tizen.application.launchAppControl(
      control,
      appId,
      () => undefined,
      () => {
        tizen.application.launch(
          appId,
          () => undefined,
          (launchErr) =>
            alertWithInstalledMatches(
              tizen,
              appId,
              `Couldn't open app id ${appId}\n${describeError(launchErr)}`,
            ),
        );
      },
    );
  } catch (thrown) {
    alert(`Couldn't open app id ${appId}\n${describeError(thrown)}`);
  }
}
