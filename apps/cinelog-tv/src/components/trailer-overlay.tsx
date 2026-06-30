import { useCallback, useEffect, useRef, useState } from "react";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { useT } from "@/i18n/provider";
import { youtubeVideoId } from "@/lib/launch-app";
import "./trailer-overlay.css";

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
 * Fullscreen in-app trailer player with a Close button. Picks the playback path
 * from the URL: a real media stream uses the native AVPlay player; a YouTube (or
 * any other) URL plays in an embedded iframe. Remote Back is handled by the
 * parent screen (it closes this overlay before leaving the detail screen).
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

  const stream = isDirectStream(url);
  const videoId = stream ? null : youtubeVideoId(url);
  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`
    : url;

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
      ) : (
        <iframe
          className="trailer-overlay__frame"
          src={embedSrc}
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
