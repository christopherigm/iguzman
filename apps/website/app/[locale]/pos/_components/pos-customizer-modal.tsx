"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  ingredientChoices,
  minQuantity,
  resolveChoice,
  selectionUpcharge,
  type SelectionOptions,
  type SelectionQuantities,
} from "@/lib/menu-selection";
import { lineKey, type PosCatalogItem, type PosLine } from "@/lib/pos";

interface Props {
  item: PosCatalogItem;
  locale: string;
  onConfirm: (line: PosLine) => void;
  onCancel: () => void;
}

/**
 * The counter-side ingredient picker.
 *
 * The same rules as the storefront customiser - and literally the same
 * arithmetic, from `lib/menu-selection.ts`, so a bread configured at the till
 * and the same bread configured on the site can never quote different numbers.
 * What differs is the shape: bigger hit targets, one dish at a time, and a
 * quantity stepper for the dish itself, because an associate rings up "three of
 * these, all with extra seeds" as one action.
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
  const [quantity, setQuantity] = useState(1);

  const upcharge = selectionUpcharge(item.ingredients, quantities, options);
  const unitPrice = parseFloat(item.price) + upcharge;

  const setQty = (ing: MenuItemIngredient, next: number) => {
    const clamped = Math.max(minQuantity(ing), Math.min(next, ing.max_quantity));
    setQuantities((prev) => ({ ...prev, [ing.id]: clamped }));
  };

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
      key: lineKey(item.kind, item.id, customization),
      kind: item.kind,
      id: item.id,
      name: item.name,
      image: item.image,
      basePrice: parseFloat(item.price),
      upcharge,
      currency: item.currency,
      quantity,
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
        {ingredients.map((ing) => {
          const qty = quantities[ing.id] ?? ing.default_units;
          const min = minQuantity(ing);
          const choices = ingredientChoices(ing);
          const isChoice = choices.length > 1;
          const selectedId = options[ing.id] ?? ing.ingredient;
          const choice = resolveChoice(ing, selectedId);
          const name = label(choice.name, choice.en_name);
          // A non-removable ingredient is in the base price and has no stepper -
          // it is shown so the associate can read back what the dish contains.
          const included = !ing.is_removable;
          const groupLabel = isChoice
            ? label(ing.group_name, ing.group_en_name)
            : null;

          return (
            <Box
              key={ing.id}
              flexDirection="column"
              gap={8}
              paddingBottom={10}
              styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
            >
              {groupLabel && (
                <Typography
                  as="h3"
                  variant="label"
                  margin={0}
                  fontWeight={700}
                  color="var(--foreground)"
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
                <Box flexDirection="column" gap={2} flex="1" minWidth={140}>
                  <Typography variant="body" margin={0}>
                    {name}
                  </Typography>
                  <Typography variant="caption" margin={0}>
                    {parseFloat(choice.price) > 0
                      ? t("perUnit", {
                          price: formatPrice(choice.price, item.currency),
                        })
                      : t("included")}
                  </Typography>
                </Box>

                {!included && (
                  <Box
                    alignItems="center"
                    gap={6}
                    padding={2}
                    borderRadius={8}
                    border="1px solid var(--border, #e5e7eb)"
                  >
                    <Button
                      text="−"
                      size="md"
                      minWidth={44}
                      aria-label={t("decrease")}
                      disabled={qty <= min}
                      onClick={() => setQty(ing, qty - 1)}
                    />
                    <Typography
                      as="span"
                      variant="h5"
                      margin={0}
                      minWidth={32}
                      textAlign="center"
                      aria-live="polite"
                    >
                      {qty}
                    </Typography>
                    <Button
                      text="+"
                      size="md"
                      minWidth={44}
                      aria-label={t("increase")}
                      disabled={qty >= ing.max_quantity}
                      onClick={() => setQty(ing, qty + 1)}
                    />
                  </Box>
                )}
              </Box>

              {isChoice && (
                <Box
                  flexWrap="wrap"
                  gap={8}
                  role="group"
                  aria-label={groupLabel ?? name}
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
                            ? `${cName} +${formatPrice(c.price, item.currency)}`
                            : cName
                        }
                        onClick={() =>
                          setOptions((prev) => ({
                            ...prev,
                            [ing.id]: c.ingredient,
                          }))
                        }
                        aria-pressed={active}
                        paddingX={14}
                        paddingY={10}
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
                        styles={{ fontWeight: 600, fontSize: "0.875rem" }}
                      />
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}

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
