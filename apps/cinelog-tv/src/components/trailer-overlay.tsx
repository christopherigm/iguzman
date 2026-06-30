import { useCallback, useEffect, useRef, useState } from "react";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { useT } from "@/i18n/provider";
import { launchDigitalCopy, youtubeVideoId } from "@/lib/launch-app";
import { loadYouTubeApi } from "@/lib/youtube-player";
import "./trailer-overlay.css";

// If the IFrame API's postMessage handshake never completes (the file:// origin
// case where it silently fails), onReady won't fire - bail out after this and
// fall back to the native app rather than sitting on a black screen.
const READY_TIMEOUT_MS = 5000;
// Once ready, give playback a grace window to actually start before assuming a
// config/embedding error the player reported only on screen (not via onError).
const PLAY_TIMEOUT_MS = 6000;

/**
 * URLs the native AVPlay player can open directly (progressive or adaptive
 * media streams). A YouTube watch URL is *not* one of these - AVPlay can't play
 * YouTube, so those fall through to the embedded frame below.
 */
function isDirectStream(url: string): boolean {
  return /\.(m3u8|mpd|mp4|m4v|mov|webm|ts)(?:[?#]|$)/i.test(url);
}

/**
 * Drives the Samsung native player (`webapis.avplay`) for the lifetime of this
 * element. AVPlay decodes onto a hardware video plane *behind* the webview, so
 * the overlay above it is kept transparent (see CSS) and the video shows through
 * the rect set here. Calls `onError` when the player is unavailable (e.g. the
 * dev browser, which has no `webapis`) or fails, and `onEnded` on completion.
 */
function AvPlayer({
  url,
  onError,
  onEnded,
}: {
  url: string;
  onError: () => void;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLObjectElement>(null);

  useEffect(() => {
    const player = window.webapis?.avplay;
    if (!player) {
      onError();
      return;
    }
    let active = true;
    try {
      player.open(url);
      // The TV always treats the screen as 1920x1080, regardless of app res.
      player.setDisplayRect(0, 0, 1920, 1080);
      player.setListener({
        onstreamcompleted: () => onEnded(),
        onerror: () => onError(),
      });
      // prepareAsync (not prepare) - the sync form blocks the UI thread.
      player.prepareAsync(
        () => {
          if (active) player.play();
        },
        () => onError(),
      );
    } catch {
      onError();
    }
    return () => {
      active = false;
      // Stop before close, or the player keeps the final frame on screen.
      try {
        player.stop();
      } catch {
        /* already idle */
      }
      try {
        player.close();
      } catch {
        /* already closed */
      }
    };
  }, [url, onError, onEnded]);

  // An <object> of this type is the AVPlay display placeholder; the decoded
  // video paints on its hardware plane.
  return (
    <object
      ref={ref}
      type="application/avplayer"
      className="trailer-overlay__avplay"
    />
  );
}

/**
 * Plays a YouTube trailer in-app via the IFrame Player API (youtube-nocookie
 * host). On a packaged Tizen app the file:// origin can't satisfy YouTube's
 * embedding check, so playback may fail with "Error 153" - reported either via
 * `onError` or, when the player only shows the message on screen, caught by the
 * ready/play timeouts. Either way `onFail` fires so the caller can fall back to
 * the native YouTube app. In the dev browser (http origin) playback succeeds and
 * `onFail` never fires.
 */
function YouTubeEmbed({
  videoId,
  onFail,
}: {
  videoId: string;
  onFail: () => void;
}) {
  const { t } = useT();
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let player: YTPlayer | null = null;
    let playTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      clearTimeout(readyTimer);
      clearTimeout(playTimer);
      onFail();
    };

    const readyTimer = setTimeout(fail, READY_TIMEOUT_MS);

    // YT.Player replaces its target node with the player <iframe>. Build that
    // target imperatively (not via JSX) so React never tracks the node YouTube
    // swaps out - otherwise unmount throws removeChild on the missing node.
    const target = document.createElement("div");
    frameRef.current?.appendChild(target);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            controls: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              clearTimeout(readyTimer);
              playTimer = setTimeout(fail, PLAY_TIMEOUT_MS);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) clearTimeout(playTimer);
            },
            onError: fail,
          },
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      clearTimeout(playTimer);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      target.remove();
    };
  }, [videoId, onFail]);

  return (
    <>
      {/* Shows through until the iframe paints an opaque video over it. */}
      <div className="trailer-overlay__loading">
        <TvText variant="body">{t("loading")}</TvText>
      </div>
      <div ref={frameRef} className="trailer-overlay__frame" />
    </>
  );
}

/**
 * Fullscreen in-app trailer player with a Close button. Picks the playback path
 * from the URL: a real media stream uses the native AVPlay player; a YouTube URL
 * uses the IFrame Player API and, if it can't play in-app (the Tizen file://
 * "Error 153" case), hands off to the native YouTube app; any other URL plays in
 * a plain iframe. Remote Back is handled by the parent screen (it closes this
 * overlay before leaving the detail screen).
 */
export function TrailerOverlay({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [error, setError] = useState(false);
  const handleError = useCallback(() => setError(true), []);
  const handleEnded = useCallback(() => onClose(), [onClose]);
  // When the in-app YouTube embed can't play (the Tizen file:// "Error 153"
  // case), hand off to the native YouTube app and close this overlay.
  const handleYouTubeFail = useCallback(() => {
    launchDigitalCopy(url);
    onClose();
  }, [url, onClose]);

  const stream = isDirectStream(url);
  const videoId = stream ? null : youtubeVideoId(url);

  // The embed path needs an opaque backdrop; the stream path stays transparent
  // so the AVPlay hardware plane behind the webview shows through.
  const cls = ["trailer-overlay", stream ? "" : "trailer-overlay--embed"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {error ? (
        <div className="trailer-overlay__message">
          <TvText variant="title">{t("trailerUnavailable")}</TvText>
        </div>
      ) : stream ? (
        <AvPlayer url={url} onError={handleError} onEnded={handleEnded} />
      ) : videoId ? (
        <YouTubeEmbed videoId={videoId} onFail={handleYouTubeFail} />
      ) : (
        <iframe
          className="trailer-overlay__frame"
          src={url}
          title={t("trailer")}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      )}

      {/* Grabs D-pad focus on mount so Enter closes; Back closes too (parent). */}
      <Focusable group focusOnMount className="trailer-overlay__close">
        <TvButton kind="error" onPress={onClose}>
          {t("closeTrailer")}
        </TvButton>
      </Focusable>
    </div>
  );
}
