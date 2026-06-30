// Minimal ambient typings for the subset of the YouTube IFrame Player API the
// trailer overlay uses. The full API is loaded at runtime from
// https://www.youtube.com/iframe_api (see lib/youtube-player.ts).
export {};

declare global {
  interface YTPlayerVars {
    autoplay?: 0 | 1;
    rel?: 0 | 1;
    playsinline?: 0 | 1;
    controls?: 0 | 1;
    // Must match the embedding page's origin for the postMessage handshake.
    origin?: string;
  }

  interface YTPlayerEvent {
    target: YTPlayer;
    // Present on state-change/error events: a PlayerState value or error code.
    data?: number;
  }

  interface YTPlayerOptions {
    // Defaults to youtube.com; we pass the youtube-nocookie.com host.
    host?: string;
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: YTPlayerVars;
    events?: {
      onReady?: (event: YTPlayerEvent) => void;
      onStateChange?: (event: YTPlayerEvent) => void;
      onError?: (event: YTPlayerEvent) => void;
    };
  }

  interface YTPlayer {
    playVideo(): void;
    destroy(): void;
  }

  interface YTNamespace {
    Player: new (
      element: HTMLElement | string,
      options: YTPlayerOptions,
    ) => YTPlayer;
    PlayerState: {
      UNSTARTED: number;
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
      BUFFERING: number;
      CUED: number;
    };
  }

  interface Window {
    YT?: YTNamespace;
    // The API invokes this global once the script has finished loading.
    onYouTubeIframeAPIReady?: () => void;
  }
}
