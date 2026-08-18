"use client";

import { useId, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { PortionGauge, PortionSlider } from "@/components/portion-picker";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import { formatPortion } from "@/lib/nutrition";
import {
  customizableIngredients,
  ingredientChoices,
  minQuantity,
  resolveChoice,
  type SelectionOptions,
  type SelectionQuantities,
} from "@/lib/menu-selection";

/**
 * `sm` is the storefront's density (detail page, catalog card modal); `lg` grows
 * the touch targets for the POS till, where an associate drives it with a finger
 * over a counter. Only sizes change - every surface shows the same rows, the
 * same portions and the same "Included" / up-charge wording.
 *
 * Shares its names with `PortionPicker`'s own size scale, which is what lets
 * this pass `size` straight through to it.
 */
export type MenuIngredientPickerSize = "sm" | "lg";

const SIZES = {
  sm: {
    image: 44,
    chipPaddingX: 12,
    chipPaddingY: 6,
    chipFontSize: "0.8125rem",
    listGap: 10,
    rowPaddingBottom: 8,
  },
  lg: {
    image: 56,
    chipPaddingX: 14,
    chipPaddingY: 10,
    chipFontSize: "0.875rem",
    listGap: 14,
    rowPaddingBottom: 10,
  },
} as const;

interface Props {
  /** The item's ingredients. Internal (kitchen-only) rows are filtered out here,
   *  so callers pass whatever the API gave them. */
  ingredients: MenuItemIngredient[];
  quantities: SelectionQuantities;
  options: SelectionOptions;
  onQuantityChange: (ingredientId: number, quantity: number) => void;
  onOptionChange: (ingredientId: number, choiceId: number) => void;
  /** The menu item's currency - every up-charge is quoted in it. */
  currency: string;
  locale: string;
  size?: MenuIngredientPickerSize;
}

/**
 * The add-on list a customer configures a dish with: image, name, portion,
 * "Included" or per-unit up-charge, a `PortionGauge`, and the chips of a
 * single-select choice group. Pressing the gauge unfolds a `PortionSlider`
 * beneath the row - one mark per portion the kitchen allows, each labelled with
 * the amount it puts on the dish and what that adds to the price.
 *
 * **One component for all three places a dish is customised** - the menu item
 * detail page, the catalog card's add-to-cart modal, and the POS till - because
 * they are the same question asked of the same data, and the three copies this
 * replaced had already drifted (only the detail page showed the ingredient's
 * photo, only it explained the free-portion allowance). Its arithmetic siblings
 * in `lib/menu-selection.ts` are shared for the same reason: a bread configured
 * at the counter and the same bread configured on the site cannot quote
 * different numbers.
 *
 * It is **fully controlled and owns no state**: the detail page holds the
 * selection in `MenuCustomizationProvider` (so the nutrition label mirrors it),
 * while the two modals hold it locally. Nothing here names a price that is
 * charged - the server re-prices every selection.
 */
export function MenuIngredientPicker({
  ingredients,
  quantities,
  options,
  onQuantityChange,
  onOptionChange,
  currency,
  locale,
  size = "sm",
}: Props) {
  const t = useTranslations("Menu");
  const s = SIZES[size];
  const baseId = useId();
  // Which ingredient's slider is open - one at a time, so a list of add-ons
  // never unfolds into a column of sliders the customer has to scroll past.
  const [openId, setOpenId] = useState<number | null>(null);

  const visible = useMemo(
    () => customizableIngredients(ingredients),
    [ingredients],
  );

  // The up-charge printed on a slider mark, with **no currency**: the row above
  // already quotes the per-unit price in it, and a currency on every one of six
  // marks is noise on a control that has to stay readable at 11px.
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );

  if (visible.length === 0) return null;

  const setQty = (ing: MenuItemIngredient, next: number) =>
    onQuantityChange(
      ing.id,
      Math.max(minQuantity(ing), Math.min(next, ing.max_quantity)),
    );

  const label = (name: string | null, enName: string | null) =>
    ((locale === "en" ? enName : name) ?? name ?? "").trim();

  return (
    <Box flexDirection="column" gap={s.listGap}>
      {/* Rendered in the admin-set `sort_order` the API already returns them in -
          ordering is owned by the admin ingredients editor. */}
      {visible.map((ing) => {
        const qty = quantities[ing.id] ?? ing.default_units;
        const min = minQuantity(ing);
        // A single-select choice group offers alternatives; the customer's pick
        // drives the name, image, portion nutrition and price shown.
        const choices = ingredientChoices(ing);
        const isChoice = choices.length > 1;
        const selectedId = options[ing.id] ?? ing.ingredient;
        const choice = resolveChoice(ing, selectedId);
        const name = label(choice.name, choice.en_name);
        const price = parseFloat(choice.price);
        // Non-removable ingredients are included by default: locked, in the base
        // price, shown as an "Included" line with no gauge (a premium option
        // still shows its up-charge).
        const included = !ing.is_removable;
        const max = ing.max_quantity;
        const panelId = `${baseId}-portion-${ing.id}`;
        const open = openId === ing.id;
        // The amount as a person reads it: the recipe portion scaled by the
        // number of portions chosen, or a bare count where the dish states no
        // portion at all (many ingredients carry neither quantity nor unit).
        const amountLabel = (q: number) =>
          ing.quantity
            ? formatPortion(q * parseFloat(ing.quantity), ing.unit ?? "").trim()
            : t("portionUnits", { count: q });
        // What that many portions adds, mirroring `selectionUpcharge`: the base
        // has already paid for the included units, so only the value the chosen
        // option exceeds them by is charged, and it never goes negative.
        const includedValue = parseFloat(ing.price) * ing.included_units;
        const steps = Array.from(
          { length: Math.max(1, max - min + 1) },
          (_, i) => {
            const q = min + i;
            const upcharge = Math.max(
              0,
              parseFloat(choice.price) * q - includedValue,
            );
            return {
              value: q,
              // Two lines - the amount, and the money it adds beneath it. A mark
              // that costs nothing extra carries no price line: only what is
              // actually charged is printed.
              label:
                upcharge > 0
                  ? `${amountLabel(q)}\n+${money.format(upcharge)}`
                  : amountLabel(q),
            };
          },
        );
        // The admin's label for a choice group (e.g. "Sweetener"), shown as a
        // heading above the options so the customer knows what they're picking.
        const groupLabel = isChoice
          ? label(ing.group_name, ing.group_en_name)
          : null;

        return (
          <Box
            key={ing.id}
            flexDirection="column"
            gap={8}
            paddingBottom={s.rowPaddingBottom}
            styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
          >
            {groupLabel && (
              <Typography
                as="h3"
                variant="label"
                margin={0}
                color="var(--foreground)"
                fontWeight={700}
              >
                {groupLabel}
              </Typography>
            )}

            <Box
              alignItems="center"
              justifyContent="space-between"
              gap={12}
              flexWrap="wrap"
            >
              <Box alignItems="center" gap={10} flex="1" minWidth={160}>
                {choice.image && (
                  <Box
                    width={s.image}
                    height={s.image}
                    flex="0 0 auto"
                    borderRadius={8}
                    backgroundColor="var(--surface-2)"
                    styles={{ position: "relative", overflow: "hidden" }}
                  >
                    <Image
                      src={choice.image}
                      alt={name}
                      fill
                      sizes={`${s.image}px`}
                      style={{ objectFit: "cover" }}
                    />
                  </Box>
                )}
                <Box flexDirection="column" gap={2}>
                  <Typography variant="body" margin={0}>
                    {name}
                    {ing.quantity &&
                      ` · ${
                        ing.unit
                          ? formatPortion(parseFloat(ing.quantity), ing.unit)
                          : formatPortion(parseFloat(ing.quantity), "").trim()
                      }`}
                  </Typography>
                  {/* The price slot: a locked "Included" for a non-removable
                      ingredient, otherwise its per-unit up-charge (or "Included"
                      when it costs nothing); a premium choice-group option shows
                      its up-charge too. */}
                  <Typography
                    variant="caption"
                    margin={0}
                    color="var(--foreground)"
                  >
                    {included
                      ? price > 0
                        ? t("perUnitUpcharge", {
                            price: formatPrice(choice.price, currency),
                          })
                        : t("included")
                      : price > 0
                        ? ing.included_units >= 1
                          ? t("perUnitUpchargeWithIncluded", {
                              count: ing.included_units,
                              price: formatPrice(choice.price, currency),
                            })
                          : t("perUnitUpcharge", {
                              price: formatPrice(choice.price, currency),
                            })
                        : t("included")}
                  </Typography>
                </Box>
              </Box>

              {/* The chosen amount over three circles that grow with it, kept
                  on the right where the stepper was; a non-removable ingredient
                  is locked, so it gets no control at all. */}
              {!included && (
                <PortionGauge
                  value={qty}
                  min={min}
                  max={max}
                  label={amountLabel(qty)}
                  open={open}
                  onToggle={() => setOpenId(open ? null : ing.id)}
                  ariaLabel={name}
                  controls={panelId}
                  size={size}
                />
              )}
            </Box>

            {/* The slider the gauge opens: one mark per portion the kitchen
                allows, each labelled with the amount it puts on the dish and
                what that adds to the price. */}
            {!included && (
              <PortionSlider
                id={panelId}
                steps={steps}
                value={qty}
                onChange={(next) => setQty(ing, next)}
                onApply={() => setOpenId(null)}
                applyLabel={t("applyPortion")}
                open={open}
                size={size}
              />
            )}

            {/* Single-select option chips: pick exactly one; the chosen chip
                drives the name/image/price above and the live nutrition. */}
            {isChoice && (
              <Box
                flexWrap="wrap"
                gap={8}
                role="group"
                aria-label={groupLabel ?? t("chooseOption", { name })}
              >
                {choices.map((c) => {
                  const active = selectedId === c.ingredient;
                  const cName = label(c.name, c.en_name);
                  const cPrice = parseFloat(c.price);
                  return (
                    <Button
                      key={c.ingredient}
                      unstyled
                      text={
                        cPrice > 0
                          ? `${cName} +${formatPrice(c.price, currency)}`
                          : cName
                      }
                      onClick={() => onOptionChange(ing.id, c.ingredient)}
                      aria-pressed={active}
                      paddingX={s.chipPaddingX}
                      paddingY={s.chipPaddingY}
                      borderRadius={999}
                      backgroundColor={
                        active ? "var(--accent)" : "var(--surface-2)"
                      }
                      color={active ? "#fff" : "var(--foreground)"}
                      border={
                        active
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border, #e5e7eb)"
                      }
                      styles={{ fontWeight: 600, fontSize: s.chipFontSize }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
