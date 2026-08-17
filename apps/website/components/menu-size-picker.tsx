"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuSize } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import { hasSizeChoice, resolveSize } from "@/lib/menu-selection";

/**
 * `sm` is the storefront's density (detail page, catalog card modal); `lg` grows
 * the touch targets for the POS till, where an associate drives it with a finger
 * over a counter. Shares its names with `MenuIngredientPicker`'s scale, so a
 * surface passes one `size` through to both.
 */
export type MenuSizePickerSize = "sm" | "lg";

const SIZES = {
  sm: { image: 44, paddingX: 12, paddingY: 8, nameFontSize: "0.875rem", gap: 8 },
  lg: { image: 64, paddingX: 16, paddingY: 12, nameFontSize: "1rem", gap: 12 },
} as const;

interface Props {
  /** The dish's **effective** sizes, exactly as the API returned them. Never the
   *  category's list re-resolved on the client - the server owns that rule. */
  sizes: MenuSize[];
  /** The chosen size's id. `undefined` means "whatever the default is", which is
   *  what this renders as selected. */
  value: number | undefined;
  onChange: (sizeId: number) => void;
  /** The dish's currency - every delta is quoted in it. */
  currency: string;
  locale: string;
  size?: MenuSizePickerSize;
}

/**
 * The size a dish is ordered in: one row of single-select cards, each carrying
 * the size's picture, its name, its measurement ("12 in") and what it does to the
 * price.
 *
 * **One component for every place a dish is configured** - the detail page, the
 * catalog card's add-to-cart modal and the POS till - for the reason
 * `MenuIngredientPicker` is one component: they ask the same question of the same
 * data, and three copies would drift. It renders **above** the add-ons on all
 * three, because size is the first thing a customer decides and it moves the
 * price the add-ons are added to.
 *
 * Fully controlled and owns no state: the detail page keeps the selection in the
 * shared customisation context (so the live total and nutrition label mirror it)
 * while the two modals hold it locally.
 *
 * Nothing here names a price that is charged. The delta shown comes off the
 * catalog and the server re-prices every selection.
 */
export function MenuSizePicker({
  sizes,
  value,
  onChange,
  currency,
  locale,
  size = "sm",
}: Props) {
  const t = useTranslations("Menu");
  const s = SIZES[size];

  // A single size is not a choice - the dish simply comes that way, and one
  // locked card would be a control that does nothing.
  if (!hasSizeChoice(sizes)) return null;

  const selected = resolveSize(sizes, value);

  const label = (name: string, enName: string | null) =>
    ((locale === "en" ? enName : name) ?? name ?? "").trim();

  return (
    <Box flexDirection="column" gap={s.gap}>
      <Typography
        as="h3"
        variant="label"
        margin={0}
        color="var(--foreground)"
        fontWeight={700}
      >
        {t("chooseSize")}
      </Typography>

      <Box flexWrap="wrap" gap={s.gap} role="group" aria-label={t("chooseSize")}>
        {sizes.map((option) => {
          const active = selected?.id === option.id;
          const delta = parseFloat(option.price_delta);
          return (
            <Button
              key={option.id}
              unstyled
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              // `unstyled` drops Button's own defaults, so the card's own box
              // model is spelled out here - including `display`, without which
              // `flexDirection` has nothing to act on.
              display="flex"
              flexDirection="column"
              alignItems="center"
              gap={6}
              paddingX={s.paddingX}
              paddingY={s.paddingY}
              borderRadius={12}
              minWidth={96}
              backgroundColor={active ? "var(--accent)" : "var(--surface-2)"}
              color={active ? "var(--accent-foreground, #fff)" : "var(--foreground)"}
              border={
                active
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border, #e5e7eb)"
              }
              styles={{ cursor: "pointer" }}
            >
              {option.image && (
                <Box
                  width={s.image}
                  height={s.image}
                  flex="0 0 auto"
                  borderRadius={8}
                  styles={{ position: "relative", overflow: "hidden" }}
                >
                  <Image
                    src={option.image}
                    alt={label(option.name, option.en_name)}
                    fill
                    sizes={`${s.image}px`}
                    style={{ objectFit: "cover" }}
                  />
                </Box>
              )}

              <Typography
                as="span"
                variant="none"
                margin={0}
                fontWeight={600}
                styles={{ fontSize: s.nameFontSize }}
              >
                {label(option.name, option.en_name)}
              </Typography>

              {/* The measurement comes pre-composed from the API ("12 in") so the
                  trailing-zero trim lives in one place. Absent for a size that
                  carries none - "Individual" says everything it needs to. */}
              {option.measurement && (
                <Typography as="span" variant="label" margin={0}>
                  {option.measurement}
                </Typography>
              )}

              {/* A signed delta, printed as one: the smallest size usually
                  discounts the base, and showing "-40" as "40" would read as a
                  surcharge on the cheapest option. Zero prints nothing - the size
                  that costs the list price should not shout about it. */}
              {delta !== 0 && (
                <Typography as="span" variant="label" margin={0} fontWeight={600}>
                  {delta > 0 ? "+" : "−"}
                  {formatPrice(Math.abs(delta).toFixed(2), currency)}
                </Typography>
              )}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
