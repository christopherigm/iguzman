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
 *
 * `onError` receives the raw AVPlay error string when the device reports one
 * (e.g. `PLAYER_ERROR_NOT_SUPPORTED_AUDIO_CODEC` for a disc-rip MKV whose audio
 * the TV can't decode, vs `..._NOT_SUPPORTED_FORMAT` for the container, vs
 * `..._CONNECTION_FAILED` for a network/Content-Type problem). Callers can show
 * it to distinguish "this file's codec is unplayable" from a transient failure.
 */
export function AvPlayer({
  url,
  onError,
  onEnded,
}: {
  url: string;
  onError: (detail?: string) => void;
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
        onerror: (eventType) => onError(eventType),
      });
      // prepareAsync (not prepare) - the sync form blocks the UI thread.
      player.prepareAsync(
        () => {
          if (active) player.play();
        },
        (error) => onError(String(error)),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
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
