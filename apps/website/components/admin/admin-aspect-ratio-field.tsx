"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Select } from "@repo/ui/core-elements/select";
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_LABEL_KEY,
  type AspectRatio,
} from "@/lib/aspect-ratio";
import "./admin-aspect-ratio-field.css";

type Props = {
  /** The record's stored `aspect_ratio` - blank is "auto". */
  value: unknown;
  onChange: (value: string) => void;
  /**
   * Names what the frame applies to on this form: the gallery ("its photos"),
   * or the one image the record is drawn as. Defaults to the gallery wording.
   */
  scope?: "gallery" | "image";
};

/**
 * The frame a record's photographs are drawn in, as one select under the image
 * controls it describes.
 *
 * It sits in `imagesSlot` beside the uploader rather than among the record's
 * own fields, because it is a fact about the pictures and not about the thing
 * they are pictures of - an operator who has just been told the photo is too
 * tall is already looking at this corner of the form. Within that slot it goes
 * directly under the field's own label and *above* the drop zone: the frame is
 * a heading-level statement about the whole field, where below a ten-slot
 * uploader and its stock picker it reads as a footnote to the last thumbnail.
 *
 * ⚠ **Auto is a real choice, not an empty field.** Blank means "let the photos
 * decide" - on a gallery, the 4:5 / 5:4 frame derived from the most-portrait
 * one - so the helper line says so; a select that merely looked unset would
 * invite an operator to "fix" it by picking a ratio the site never needed.
 *
 * Its width is capped in CSS to one column of `.af__grid`, so it matches every
 * other select on the form - the images slot spans both columns, which would
 * otherwise draw this one twice as wide as the Category select above it.
 */
export function AdminAspectRatioField({
  value,
  onChange,
  scope = "gallery",
}: Props) {
  const t = useTranslations("Admin");

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap="6px"
      className="admin-aspect-ratio-field"
    >
      <Select
        label={t("aspectRatio")}
        value={String(value ?? "")}
        onChange={onChange}
        options={ASPECT_RATIOS.map((ratio: AspectRatio) => ({
          value: ratio,
          label: t(ASPECT_RATIO_LABEL_KEY[ratio]),
        }))}
      />
      <Typography
        variant="caption"
        color="color-mix(in srgb, var(--foreground) 65%, transparent)"
      >
        {scope === "gallery" ? t("aspectRatioHint") : t("aspectRatioHintImage")}
      </Typography>
    </Box>
  );
}
