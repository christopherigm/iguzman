"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The `#rrggbb` the native picker opens on when `value` is not one. */
  fallback: string;
  /**
   * Whether this is the color currently on screen (the CMS's own theme). Drawn
   * as an accent outline so it is obvious which of the two the preview shows.
   */
  active?: boolean;
};

/**
 * A brand-kit color: the hex, editable, with a swatch that opens the browser's
 * own picker.
 *
 * It is a thin wrapper over `TextInput`'s `swatch`, which is the one color
 * control the CMS has - the same one `AdminForm`'s `type: "color"` fields and
 * the rewards tiers wear. It used to be a hand-rolled swatch tile with the hex
 * beside it as a *readout*, which meant a value the native control cannot show
 * (a `var()`, a named color, a blank) could only be corrected by picking a
 * different one. Everything left here is the `active` outline, which is the
 * only thing about this field that is not a color field.
 */
export function ColorField({
  id,
  label,
  value,
  onChange,
  fallback,
  active = false,
}: Props) {
  const t = useTranslations("Admin");

  return (
    // The border is transparent rather than absent when inactive, so marking
    // the on-screen theme does not move the field it is drawn around.
    <Box
      padding={4}
      borderRadius={12}
      border={`1px solid ${active ? "var(--accent)" : "transparent"}`}
    >
      <TextInput
        id={id}
        label={label}
        swatch
        swatchFallback={fallback}
        swatchLabel={t("colorPick")}
        value={value}
        onChange={onChange}
      />
    </Box>
  );
}
