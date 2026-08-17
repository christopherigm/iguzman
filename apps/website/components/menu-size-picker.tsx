"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuSize } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import { hasSizeChoice, priceForSize, resolveSize } from "@/lib/menu-selection";

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

// The selected card is painted in `--accent`, which on this app is the *tenant's*
// brand colour published by the locale layout - it does not change with the
// theme. The palette's `--accent-foreground` does (near-black on the dark
// theme), so it is only the fallback here: taken literally it would put dark
// text on the brand colour for every visitor reading in dark mode.
//
// These are spelled out per line because `.ui-typography` sets
// `color: var(--foreground)`, so nothing inside the card inherits the Button's
// own colour.
const ACTIVE_TEXT = "#fff";
/** The measurement and price lines, a shade down from the name so the card still
 *  has a hierarchy once every line on it is white. */
const ACTIVE_TEXT_MUTED = "rgba(255, 255, 255, 0.86)";

interface Props {
  /** The dish's **effective** sizes, exactly as the API returned them. Never the
   *  category's list re-resolved on the client - the server owns that rule. */
  sizes: MenuSize[];
  /** The item's own list price. Each card prints `base + its delta`, so the
   *  customer compares the prices of the sizes rather than a set of deltas
   *  against a number printed somewhere else on the page. */
  basePrice: string;
  /** The chosen size's id. `undefined` means "whatever the default is", which is
   *  what this renders as selected. */
  value: number | undefined;
  onChange: (sizeId: number) => void;
  /** The dish's currency - every price is quoted in it. */
  currency: string;
  locale: string;
  size?: MenuSizePickerSize;
}

/**
 * The size a dish is ordered in: one row of single-select cards, each carrying
 * the size's picture, its name, its measurement ("12 in") and what the dish
 * costs in it.
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
 * Nothing here names a price that is charged. The figure on each card is the
 * catalog's own base plus that size's delta, and the server re-prices every
 * selection.
 */
export function MenuSizePicker({
  sizes,
  basePrice,
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

      {/* Centred, and spread apart rather than packed left: with two or three
          sizes the row is a set of choices to weigh against each other, which a
          left-ranged clump beside a wide empty gutter does not read as. */}
      <Box
        flexWrap="wrap"
        justifyContent="space-around"
        alignItems="stretch"
        gap={s.gap}
        role="group"
        aria-label={t("chooseSize")}
      >
        {sizes.map((option) => {
          const active = selected?.id === option.id;
          const price = priceForSize(basePrice, option);
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
              color={active ? ACTIVE_TEXT : "var(--foreground)"}
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
                color={active ? ACTIVE_TEXT : "var(--foreground)"}
                styles={{ fontSize: s.nameFontSize }}
              >
                {label(option.name, option.en_name)}
              </Typography>

              {/* The measurement comes pre-composed from the API ("12 in") so the
                  trailing-zero trim lives in one place. Absent for a size that
                  carries none - "Individual" says everything it needs to. */}
              {option.measurement && (
                <Typography
                  as="span"
                  variant="label"
                  margin={0}
                  color={active ? ACTIVE_TEXT_MUTED : "var(--foreground)"}
                >
                  {option.measurement}
                </Typography>
              )}

              {/* What the dish costs in this size, not what the size does to the
                  price: a signed delta is only half a figure, and the customer is
                  choosing between the prices themselves. Printed on every card,
                  including the size sold at the list price - with totals there is
                  no "no change" to leave unsaid. */}
              <Typography
                as="span"
                variant="label"
                margin={0}
                fontWeight={600}
                color={active ? ACTIVE_TEXT_MUTED : "var(--foreground)"}
              >
                {formatPrice(price.toFixed(2), currency)}
              </Typography>
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
