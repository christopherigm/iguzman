"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  defaultSize,
  hasSizeChoice,
  resolveChoice,
  resolveSize,
  selectionUpcharge,
  sizeDelta,
  type SelectionOptions,
  type SelectionQuantities,
} from "@/lib/menu-selection";
import { MenuIngredientPicker } from "@/components/menu-ingredient-picker";
import { MenuSizePicker } from "@/components/menu-size-picker";
import { lineKey, type PosCatalogItem, type PosLine } from "@/lib/pos";

interface Props {
  item: PosCatalogItem;
  locale: string;
  onConfirm: (line: PosLine) => void;
  onCancel: () => void;
}

/**
 * The counter-side size and ingredient picker.
 *
 * The same rules as the storefront customiser - and literally the same controls
 * (`MenuSizePicker` above `MenuIngredientPicker`) and the same arithmetic
 * (`lib/menu-selection.ts`), so a pizza configured at the till and the same pizza
 * configured on the site can never quote different numbers. What differs is the
 * shape: both pickers' `lg` size for hit targets a finger can find over a
 * counter, one dish at a time, and a quantity stepper for the dish itself,
 * because an associate rings up "three of these, all with extra seeds" as one
 * action.
 *
 * Nothing here is trusted about money. The rows it emits name ingredients and
 * quantities; the server re-prices them.
 */
export function PosCustomizerModal({
  item,
  locale,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslations("Pos");
  const tCommon = useTranslations("Common");

  const ingredients = useMemo(
    () => customizableIngredients(item.ingredients),
    [item.ingredients],
  );

  // Every group starts where the menu says it does; the associate only moves
  // what the customer asked to change.
  const [quantities, setQuantities] = useState<SelectionQuantities>(() =>
    Object.fromEntries(ingredients.map((ing) => [ing.id, ing.default_units])),
  );
  const [options, setOptions] = useState<SelectionOptions>({});
  const [sizeId, setSizeId] = useState<number | undefined>(
    () => defaultSize(item.sizes)?.id,
  );
  const [quantity, setQuantity] = useState(1);

  // The size's delta rides in `upcharge` with the add-ons, so the basket row can
  // print one "what the customisation added" figure and `lineUnitPrice` needs no
  // third term. It is signed - a small size takes money off - and the unit price
  // is floored at zero exactly as the server floors it.
  const size = resolveSize(item.sizes, sizeId);
  const upcharge =
    sizeDelta(item.sizes, sizeId) +
    selectionUpcharge(item.ingredients, quantities, options);
  const unitPrice = Math.max(0, parseFloat(item.price) + upcharge);

  const label = (name: string | null, enName: string | null) =>
    ((locale === "en" ? enName : name) ?? name ?? "").trim();

  /**
   * The add-on summary shown on the basket row.
   *
   * Only what the customer actually changed: a group left as listed is already
   * implied by the dish's name, and printing every default would bury the one
   * line the person assembling the order needs to read.
   */
  const describeSelection = (): string[] => {
    const parts: string[] = [];
    for (const ing of ingredients) {
      const qty = quantities[ing.id] ?? ing.default_units;
      const chosen = options[ing.id] ?? ing.ingredient;
      const isDefaultOption = chosen === ing.ingredient;
      if (qty === ing.default_units && isDefaultOption) continue;

      const choice = resolveChoice(ing, options[ing.id]);
      const name = label(choice.name, choice.en_name);
      if (qty === 0) {
        parts.push(t("without", { name }));
      } else if (qty === 1) {
        parts.push(name);
      } else {
        parts.push(`${name} ×${qty}`);
      }
    }
    return parts;
  };

  const handleConfirm = () => {
    const customization = buildCustomization(
      item.ingredients,
      quantities,
      options,
    );
    onConfirm({
      key: lineKey(item.kind, item.id, customization, size?.id),
      kind: item.kind,
      id: item.id,
      name: item.name,
      image: item.image,
      basePrice: parseFloat(item.price),
      upcharge,
      currency: item.currency,
      quantity,
      size: size?.id,
      // Only when the dish is actually offered in several: a size name on a row
      // for a dish that comes one way is noise on a busy screen.
      sizeName: hasSizeChoice(item.sizes)
        ? label(size?.name ?? null, size?.en_name ?? null)
        : undefined,
      customization,
      customizationLabels: describeSelection(),
    });
  };

  return (
    <ConfirmationModal
      title={item.name}
      text={t("customizeHint")}
      panelMaxWidth="560px"
      okLabel={t("addToBasket", {
        price: formatPrice((unitPrice * quantity).toFixed(2), item.currency),
      })}
      cancelLabel={tCommon("cancel")}
      okCallback={handleConfirm}
      cancelCallback={onCancel}
    >
      <Box flexDirection="column" gap={14}>
        {/* Size first, as on the storefront: it is what the customer at the
            counter is asked before anything else. */}
        {hasSizeChoice(item.sizes) && (
          <MenuSizePicker
            sizes={item.sizes}
            basePrice={item.price}
            value={sizeId}
            onChange={setSizeId}
            currency={item.currency}
            locale={locale}
            size="lg"
          />
        )}

        <MenuIngredientPicker
          ingredients={item.ingredients}
          quantities={quantities}
          options={options}
          onQuantityChange={(id, quantity) =>
            setQuantities((prev) => ({ ...prev, [id]: quantity }))
          }
          onOptionChange={(id, choiceId) =>
            setOptions((prev) => ({ ...prev, [id]: choiceId }))
          }
          currency={item.currency}
          locale={locale}
          size="lg"
        />

        {/* How many of *this* configuration. Separate from the ingredient
            steppers above, which decide what one of them contains. */}
        <Box alignItems="center" justifyContent="space-between" gap={12}>
          <Typography variant="body" margin={0} fontWeight={600}>
            {t("howMany")}
          </Typography>
          <Box
            alignItems="center"
            gap={6}
            padding={2}
            borderRadius={8}
            border="1px solid var(--border, #e5e7eb)"
          >
            <Button
              text="−"
              size="lg"
              minWidth={48}
              aria-label={t("decrease")}
              disabled={quantity <= 1}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            />
            <Typography
              as="span"
              variant="h4"
              margin={0}
              minWidth={40}
              textAlign="center"
              aria-live="polite"
            >
              {quantity}
            </Typography>
            <Button
              text="+"
              size="lg"
              minWidth={48}
              aria-label={t("increase")}
              onClick={() => setQuantity((q) => q + 1)}
            />
          </Box>
        </Box>
      </Box>
    </ConfirmationModal>
  );
}
