import { useCallback, useState } from "react";
import { TvText } from "@repo/ui-tv/tv-typography";
import { useT } from "@/i18n/provider";
import { AvPlayer } from "./av-player";
import "./stream-overlay.css";

/**
 * Fullscreen in-app player for a self-hosted digital copy - a direct media
 * stream on a personal bucket (e.g. S3), not an external provider we deep-link
 * into. Decodes through the Samsung native AVPlay hardware plane behind the
 * transparent webview, the same path TrailerOverlay uses for direct streams.
 *
 * There is no on-screen Close button (unlike TrailerOverlay): the viewer exits
 * with the remote Back key, which the parent screen handles to close this
 * overlay before leaving the detail screen.
 */
export function StreamOverlay({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [error, setError] = useState<{ detail?: string } | null>(null);
  const handleError = useCallback(
    (detail?: string) => setError({ detail }),
    [],
  );
  const handleEnded = useCallback(() => onClose(), [onClose]);

  return (
    <div className="stream-overlay">
      {error ? (
        <div className="stream-overlay__message">
          <TvText variant="title">{t("digitalCopyUnavailable")}</TvText>
          {/* Raw AVPlay error string - identifies which fix the file needs
              (unsupported codec vs container vs network/Content-Type). */}
          {error.detail ? (
            <TvText variant="body">{error.detail}</TvText>
          ) : null}
        </div>
      ) : (
        <AvPlayer url={url} onError={handleError} onEnded={handleEnded} />
      )}
    </div>
  );
}
