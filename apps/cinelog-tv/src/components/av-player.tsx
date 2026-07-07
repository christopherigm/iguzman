import { useEffect, useRef } from "react";
import "./av-player.css";

/**
 * Drives the Samsung native player (`webapis.avplay`) for the lifetime of this
 * element. AVPlay decodes onto a hardware video plane *behind* the webview, so
 * any overlay above it must be kept transparent (see each caller's CSS) and the
 * video shows through the rect set here. Calls `onError` when the player is
 * unavailable (e.g. the dev browser, which has no `webapis`) or fails, and
 * `onEnded` on completion.
 *
 * Shared by TrailerOverlay (direct-stream trailers) and StreamOverlay
 * (self-hosted digital copies) - both feed it a direct media URL.
 */
export function AvPlayer({
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
      // Letterbox: keep the source aspect ratio within that rect instead of
      // stretching to fill it (the default), which distorts non-16:9 sources.
      player.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
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
    <object ref={ref} type="application/avplayer" className="av-player" />
  );
}
