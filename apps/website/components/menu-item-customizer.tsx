"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Toast } from "@repo/ui/core-elements/toast";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  selectionUpcharge,
} from "@/lib/menu-selection";
import { addGuestCartLine } from "@/lib/guest-cart";
import { MenuIngredientPicker } from "./menu-ingredient-picker";
import { useMenuCustomization } from "./menu-customization-context";

interface Props {
  menuItemId: number;
  menuItemName: string;
  basePrice: string;
  comparePrice: string | null;
  discount: number;
  currency: string;
  ingredients: MenuItemIngredient[];
  isAvailable: boolean;
  isLoggedIn: boolean;
  locale: string;
}

type ToastKind = "added" | "failed";

/**
 * The customer-facing ingredient customiser: base price + add-on deltas.
 *
 * The rows themselves are `MenuIngredientPicker`, shared with the catalog card's
 * add-to-cart modal and the POS till; this component owns the page-level parts
 * around them - the heading, the live total, and the two CTAs.
 *
 * Each ingredient starts at its included quantity (1 for a default, 0 for an
 * optional add-on). A stepper moves it within `[min, max_quantity]` - defaults
 * that can't be removed start at 1, everything else can go to 0. The live total
 * mirrors the server's `price_for_selection`: only units beyond what the base
 * includes are charged, so removing a default never refunds. On add-to-cart the
 * chosen quantities travel as the `customization` payload; the server recomputes
 * and stores the price, so nothing here is trusted about money.
 */
export function MenuItemCustomizer({
  menuItemId,
  menuItemName,
  basePrice,
  comparePrice,
  discount,
  currency,
  ingredients,
  isAvailable,
  isLoggedIn,
  locale,
}: Props) {
  const t = useTranslations("Menu");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: ToastKind; id: number } | null>(
    null,
  );

  // Quantity per ingredient id lives in the shared customisation context so the
  // nutrition label (rendered in a separate page row) mirrors every change.
  const { quantities, setQuantity, options, setOption } =
    useMenuCustomization();

  const visibleIngredients = useMemo(
    () => customizableIngredients(ingredients),
    [ingredients],
  );

  // Base plus the selection's up-charge. Both this and the POS read the figure
  // from `selectionUpcharge`, which mirrors the server's own rule - the server
  // still recomputes and stores it, so this is display only.
  const total = useMemo(
    () =>
      parseFloat(basePrice) +
      selectionUpcharge(ingredients, quantities, options),
    [basePrice, ingredients, quantities, options],
  );

  const showToast = (kind: ToastKind) =>
    setToast((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }));

  const addToCart = () =>
    fetch("/api/auth/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "menu_item",
        id: menuItemId,
        customization: buildCustomization(ingredients, quantities, options),
        quantity: 1,
      }),
    });

  /** The same line, straight into localStorage. Synchronous, so callers have
   *  nothing to await and no failure to report. */
  const addToGuestCart = () =>
    addGuestCartLine({
      kind: "menu_item",
      id: menuItemId,
      customization: buildCustomization(ingredients, quantities, options),
      quantity: 1,
    });

  const handleAdd = () => {
    if (!isLoggedIn) {
      addToGuestCart();
      showToast("added");
      return;
    }
    startTransition(async () => {
      try {
        const res = await addToCart();
        if (!res.ok) {
          showToast("failed");
          return;
        }
        showToast("added");
        router.refresh();
      } catch {
        showToast("failed");
      }
    });
  };

  // The express path: add the configured dish, then go straight to checkout.
  // A failed add stays put with a toast rather than sending the customer to a
  // cart the dish never reached.
  const handleBuyNow = () => {
    if (!isLoggedIn) {
      addToGuestCart();
      router.push("/cart");
      return;
    }
    startTransition(async () => {
      try {
        const res = await addToCart();
        if (!res.ok) {
          showToast("failed");
          return;
        }
        router.push("/cart");
      } catch {
        showToast("failed");
      }
    });
  };

  return (
    <Box flexDirection="column" gap={16}>
      {visibleIngredients.length > 0 && (
        <Box flexDirection="column" gap={10}>
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("customize", { name: menuItemName })}
          </Typography>

          <MenuIngredientPicker
            ingredients={ingredients}
            quantities={quantities}
            options={options}
            onQuantityChange={setQuantity}
            onOptionChange={setOption}
            currency={currency}
            locale={locale}
          />
        </Box>
      )}

      <Box flexDirection="column" gap={12}>
        <Box flexDirection="column" gap={2}>
          <Typography variant="caption" margin={0} color="var(--foreground)">
            {t("total")}
          </Typography>
          <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
            <Typography as="span" variant="none" className="item-price">
              {formatPrice(total.toFixed(2), currency)}
            </Typography>
            {comparePrice &&
              parseFloat(comparePrice) > parseFloat(basePrice) && (
                <Typography
                  as="span"
                  variant="none"
                  className="item-compare-price"
                >
                  {formatPrice(comparePrice, currency)}
                </Typography>
              )}
            {discount > 0 && (
              <Badge variant="filled" color="#ef4444" textColor="#fff">
                -{discount}%
              </Badge>
            )}
          </Box>
        </Box>

        {/* Add to cart + Buy now share the width, wrapping on very narrow
            widths so the buttons never get crushed. */}
        <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
          <Button
            text={t("addToCart")}
            icon="/icons/add-to-cart.svg"
            kind="warning"
            size="lg"
            flex="1"
            minWidth={140}
            disabled={!isAvailable || isPending}
            onClick={handleAdd}
          />
          <Button
            text={t("buyNow")}
            icon="/icons/happy-heart-eyes.svg"
            kind="success"
            size="lg"
            flex="1"
            minWidth={140}
            disabled={!isAvailable || isPending}
            onClick={handleBuyNow}
          />
        </Box>
      </Box>

      {!isAvailable && (
        <Typography as="span" variant="none" className="item-stock-out">
          {t("unavailable")}
        </Typography>
      )}

      {toast && (
        <Toast
          key={toast.id}
          message={toast.kind === "added" ? t("addedToCart") : t("addFailed")}
          variant={toast.kind === "added" ? "success" : "error"}
          position="top-center"
          duration={3}
        />
      )}
    </Box>
  );
}
