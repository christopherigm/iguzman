"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Typography } from "@repo/ui/core-elements/typography";
import { VideoTrimmer } from "@repo/ui/core-elements/video-trimmer";
import type { TrimRange } from "@/lib/types";

export interface TrimVideoModalProps {
  /** Playable source for the trim preview (object-URL or `/api/media/...`). */
  videoUrl: string | null;
  /** Known duration in seconds; the trimmer re-reads it from the media anyway. */
  duration: number | null;
  /** Called with the selected range in seconds. */
  onConfirm: (range: TrimRange) => void;
  onCancel: () => void;
}

/**
 * Collects a trim range, then hands it back to the card so the pinned item
 * runs the actual FFmpeg pass (locally or on the server).
 */
export function TrimVideoModal({
  videoUrl,
  duration,
  onConfirm,
  onCancel,
}: TrimVideoModalProps) {
  const t = useTranslations("VideoGrid");
  const tCommon = useTranslations("Common");
  const [range, setRange] = useState<TrimRange | null>(null);

  // A selection that still covers the whole clip would re-encode for nothing.
  const isFullClip =
    range != null &&
    duration != null &&
    range.start <= 0.05 &&
    range.end >= duration - 0.05;

  return (
    <ConfirmationModal
      title={t("trimVideoTitle")}
      text={t("trimVideoText")}
      okCallback={() => {
        if (range && !isFullClip) onConfirm(range);
      }}
      cancelCallback={onCancel}
      okDisabled={!range || isFullClip}
      panelMaxWidth="520px"
      okLabel={tCommon("ok")}
      cancelLabel={tCommon("cancel")}
    >
      {videoUrl ? (
        <VideoTrimmer
          src={videoUrl}
          duration={duration}
          onChange={setRange}
          labels={{
            play: t("trimPlaySelection"),
            pause: t("trimPause"),
            start: t("trimSelectionStart"),
            end: t("trimSelectionEnd"),
            selected: t("trimSelected"),
          }}
        />
      ) : (
        <Typography variant="body" color="var(--foreground-muted, #999)">
          {t("videoNotAvailableOffline")}
        </Typography>
      )}
    </ConfirmationModal>
  );
}

export default TrimVideoModal;
