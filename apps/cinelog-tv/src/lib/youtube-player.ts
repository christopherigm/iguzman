/**
 * Loads the YouTube IFrame Player API (https://www.youtube.com/iframe_api) once
 * and resolves with the `window.YT` namespace. The script must be served from
 * youtube.com even when the player itself uses the youtube-nocookie.com host.
 *
 * Why the API (vs. a bare <iframe>): on a packaged Tizen app the webview runs
 * from a file:// origin, so YouTube can't verify the embedding context and the
 * in-iframe player shows "Error 153 - Video player configuration error". A bare
 * iframe element loads fine (its onError never fires for that in-content error),
 * so the only way to *detect* the failure - and fall back to the native YouTube
 * app - is the IFrame API's onError/onStateChange events.
 */

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    // The API calls this global when ready; chain any pre-existing handler.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API loaded without YT.Player"));
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiPromise = null; // allow a later retry
      reject(new Error("Failed to load the YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
