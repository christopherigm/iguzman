"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  VideoCropper,
  DEFAULT_CROP_ASPECT_PRESETS,
} from "@repo/ui/core-elements/video-cropper";
import type { CropRect } from "@/lib/types";

export interface CropVideoModalProps {
  /** Playable source for the crop preview (object-URL or `/api/media/...`). */
  videoUrl: string | null;
  /** Called with the crop rectangle in source-video pixels. */
  onConfirm: (rect: CropRect) => void;
  onCancel: () => void;
}

/**
 * Collects a crop rectangle, then hands it back to the card so the pinned item
 * runs the actual FFmpeg pass (locally or on the server).
 */
export function CropVideoModal({
  videoUrl,
  onConfirm,
  onCancel,
}: CropVideoModalProps) {
  const t = useTranslations("VideoGrid");
  const tCommon = useTranslations("Common");
  const [rect, setRect] = useState<CropRect | null>(null);

  // Only the "free" preset carries a word; the ratios are language-neutral.
  const presets = useMemo(
    () =>
      DEFAULT_CROP_ASPECT_PRESETS.map((preset) =>
        preset.ratio == null
          ? { ...preset, label: t("cropAspectFree") }
          : preset,
      ),
    [t],
  );

  return (
    <ConfirmationModal
      title={t("cropVideoTitle")}
      text={t("cropVideoText")}
      okCallback={() => {
        if (rect) onConfirm(rect);
      }}
      cancelCallback={onCancel}
      okDisabled={!rect}
      panelMaxWidth="520px"
      okLabel={tCommon("ok")}
      cancelLabel={tCommon("cancel")}
    >
      {videoUrl ? (
        <VideoCropper
          src={videoUrl}
          onChange={setRect}
          presets={presets}
          labels={{
            aspect: t("cropAspectRatio"),
            scrub: t("cropPreviewFrame"),
            selection: t("cropSelection"),
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

export default CropVideoModal;
