"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Toast } from "@repo/ui/core-elements/toast";
import type { MenuItemIngredient, MenuSize } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import {
  buildCustomization,
  customizableIngredients,
  hasSizeChoice,
  menuItemTotal,
} from "@/lib/menu-selection";
import { addGuestCartLine, MAX_GUEST_QUANTITY } from "@/lib/guest-cart";
import { MENU_CUSTOMIZER_GAP } from "./menu-customizer-spacing";
import { QuantityStepper } from "./quantity-stepper";
import { MenuIngredientPicker } from "./menu-ingredient-picker";
import { MenuSizePicker } from "./menu-size-picker";
import { useMenuCustomization } from "./menu-customization-context";

interface Props {
  menuItemId: number;
  menuItemName: string;
  basePrice: string;
  comparePrice: string | null;
  discount: number;
  currency: string;
  ingredients: MenuItemIngredient[];
  /** The dish's effective sizes, as the API resolved them. Empty for a dish sold
   *  in one size, in which case no size picker renders and no size is sent. */
  sizes: MenuSize[];
  isAvailable: boolean;
  isLoggedIn: boolean;
  locale: string;
  /**
   * What this dish costs in points, or null when it cannot be redeemed - which
   * is every dish on a tenant not running the program. Printed beside the total.
   *
   * ⚠ It is the dish's **base** points price and does not move with the size or
   * the add-ons the total beside it follows: there is no per-size points column
   * to derive a delta from, and inventing one would quote a number no operator
   * ever typed. The resolved figure arrives from the server half, which is
   * where the tenant's rewards switch is read.
   */
  pointsPrice?: number | null;
}

type ToastKind = "added" | "failed";

/**
 * The customer-facing customiser: base price + the chosen size + add-on deltas.
 *
 * The controls themselves are `MenuSizePicker` and `MenuIngredientPicker`, shared
 * with the catalog card's add-to-cart modal and the POS till; this component owns
 * the page-level parts around them - the heading, the live total, and the two
 * CTAs.
 *
 * **The heading titles the whole customiser**, above both pickers - the question
 * it asks ("Customize your X") is about the dish, not about the add-on list it
 * used to sit on top of. **Size then comes first**, above the add-ons: it is the
 * first thing a customer decides about a dish, and it moves the base the add-ons
 * are added to.
 *
 * Each ingredient starts at its included quantity (1 for a default, 0 for an
 * optional add-on). A portion gauge moves it within `[min, max_quantity]` - defaults
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
  sizes,
  isAvailable,
  isLoggedIn,
  locale,
  pointsPrice = null,
}: Props) {
  const t = useTranslations("Menu");
  // Only for the stepper's labels and the points phrasing - the same namespace
  // the catalog card reads them from, so the two surfaces cannot drift.
  const tCart = useTranslations("Cart");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: ToastKind; id: number } | null>(
    null,
  );
  // How many of the dish, as configured below, the next add puts in the cart.
  // It counts the *next* add and nothing else - so it returns to one once the
  // line is written, and the cart page's own stepper is what changes a line
  // that already exists.
  const [orderQuantity, setOrderQuantity] = useState(1);

  // Size and quantity-per-ingredient live in the shared customisation context so
  // the nutrition label (rendered in a separate page row) mirrors every change.
  const { sizeId, setSizeId, quantities, setQuantity, options, setOption } =
    useMenuCustomization();

  const visibleIngredients = useMemo(
    () => customizableIngredients(ingredients),
    [ingredients],
  );

  // Base, the chosen size's delta, and the selection's up-charge. Every surface
  // reads this figure from `menuItemTotal`, which mirrors the server's own rule -
  // the server still recomputes and stores it, so this is display only.
  const total = useMemo(
    () =>
      menuItemTotal(basePrice, sizes, sizeId, ingredients, quantities, options),
    [basePrice, sizes, sizeId, ingredients, quantities, options],
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
        size: sizeId,
        customization: buildCustomization(ingredients, quantities, options),
        quantity: orderQuantity,
      }),
    });

  /** The same line, straight into localStorage. Synchronous, so callers have
   *  nothing to await and no failure to report. */
  const addToGuestCart = () =>
    addGuestCartLine({
      kind: "menu_item",
      id: menuItemId,
      size: sizeId,
      customization: buildCustomization(ingredients, quantities, options),
      quantity: orderQuantity,
    });

  const handleAdd = () => {
    if (!isLoggedIn) {
      addToGuestCart();
      showToast("added");
      setOrderQuantity(1);
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
        setOrderQuantity(1);
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
      {/* Rendered as one block so an empty one (a dish sold in one size with
          nothing to add) costs no gaps at all - and so the heading titles the
          whole customiser rather than just the add-ons under it. */}
      {(hasSizeChoice(sizes) || visibleIngredients.length > 0) && (
        <Box flexDirection="column" gap={10}>
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("customize", { name: menuItemName })}
          </Typography>

          {/* The two questions, set apart by the shared `MENU_CUSTOMIZER_GAP`
              rather than by this column's own rhythm - the same space the card
              modal and the till put between them. */}
          <Box flexDirection="column" gap={MENU_CUSTOMIZER_GAP}>
            {/* Size before add-ons: the dish is chosen, then configured. A dish
                offered in one size renders nothing. */}
            {hasSizeChoice(sizes) && (
              <MenuSizePicker
                sizes={sizes}
                basePrice={basePrice}
                value={sizeId}
                onChange={setSizeId}
                currency={currency}
                locale={locale}
              />
            )}

            {visibleIngredients.length > 0 && (
              <MenuIngredientPicker
                ingredients={ingredients}
                quantities={quantities}
                options={options}
                onQuantityChange={setQuantity}
                onOptionChange={setOption}
                currency={currency}
                locale={locale}
              />
            )}
          </Box>
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
            {/* The points price, beside the money one - "MX$120 or 1200
              points". Not a conversion of the total to its left: points are
              priced per item, so there is no rate to convert at, and the two
              are independent ways to buy the same dish. It is the dish's base
              figure and so does not follow the size and add-on arithmetic the
              total does - the same number the card printed and the same one the
              cart's points button will offer. */}
            {pointsPrice ? (
              <Typography
                as="span"
                variant="none"
                className="item-points-price"
              >
                {tCart("orPointsPrice", { points: pointsPrice })}
              </Typography>
            ) : null}
          </Box>
        </Box>

        {/* How many, then the decision it applies to; the express path goes on
            its own line beneath the pair. The dish's quantity belongs beside
            the button that puts it in the cart - it is the last thing decided
            about a dish that has just been configured above - and three
            controls on one line is what pushed "Buy now" down. Nothing here is
            measured the way the catalog card's row is: this box is one grid
            cell at 100% width in every breakpoint and every locale. */}
        <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
          {/* No stepper on a dish that cannot be added at all - a number
              counting nothing. */}
          {isAvailable && (
            <QuantityStepper
              value={orderQuantity}
              onChange={setOrderQuantity}
              max={MAX_GUEST_QUANTITY}
              decreaseLabel={tCart("decrease")}
              increaseLabel={tCart("increase")}
              ariaLabel={tCart("quantity")}
            />
          )}
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
        </Box>

        {/* Buy now takes the same count with it, so a customer who asked for
            three and pressed it arrives at checkout with three. */}
        <Button
          text={t("buyNow")}
          kind="success"
          size="lg"
          flex="1"
          disabled={!isAvailable || isPending}
          onClick={handleBuyNow}
        />
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
          primary
          duration={3}
        />
      )}
    </Box>
  );
}
