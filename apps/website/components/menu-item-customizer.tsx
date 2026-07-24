"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Toast } from "@repo/ui/core-elements/toast";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";
import { formatPortion } from "@/lib/nutrition";
import {
  buildCustomization,
  customizableIngredients,
  ingredientChoices,
  minQuantity,
  resolveChoice,
  selectionUpcharge,
} from "@/lib/menu-selection";
import { addGuestCartLine } from "@/lib/guest-cart";
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

  const setQty = (ing: MenuItemIngredient, next: number) => {
    const clamped = Math.max(minQuantity(ing), Math.min(next, ing.max_quantity));
    setQuantity(ing.id, clamped);
  };

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

          {/* Rendered in the admin-set `sort_order` the API already returns
              them in - ordering is owned by the admin ingredients editor. */}
          {visibleIngredients.map((ing) => {
            const qty = quantities[ing.id] ?? ing.default_units;
            const min = minQuantity(ing);
            // A single-select choice group offers alternatives; the customer's
            // pick drives the name, image, portion nutrition and price shown.
            const choices = ingredientChoices(ing);
            const isChoice = choices.length > 1;
            const selectedId = options[ing.id] ?? ing.ingredient;
            const choice = resolveChoice(ing, selectedId);
            const name =
              (locale === "en" ? choice.en_name : choice.name) ?? choice.name;
            const price = parseFloat(choice.price);
            // Non-removable ingredients are included by default: locked, in the
            // base price, shown as an "Included" line with no stepper (a premium
            // option still shows its up-charge).
            const included = !ing.is_removable;
            // The admin's label for a choice group (e.g. "Sweetener"), shown as a
            // heading above the options so the customer knows what they're picking.
            const groupLabel = isChoice
              ? ((locale === "en" ? ing.group_en_name : ing.group_name) ??
                ing.group_name)
              : null;
            return (
              <Box
                key={ing.id}
                flexDirection="column"
                gap={8}
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
                        width={44}
                        height={44}
                        flex="0 0 auto"
                        borderRadius={8}
                        backgroundColor="var(--surface-2)"
                        styles={{ position: "relative", overflow: "hidden" }}
                      >
                        <Image
                          src={choice.image}
                          alt={name}
                          fill
                          sizes="44px"
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
                              ? formatPortion(
                                  parseFloat(ing.quantity),
                                  ing.unit,
                                )
                              : formatPortion(
                                  parseFloat(ing.quantity),
                                  "",
                                ).trim()
                          }`}
                      </Typography>
                      {/* The price slot: a locked "Included" for a non-removable
                          ingredient, otherwise its per-unit up-charge (or
                          "Included" when it costs nothing); a premium
                          choice-group option shows its up-charge too. */}
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

                  {/* A horizontal stepper (− qty +) kept on the right, with the
                      running portion total beneath it; a non-removable ingredient
                      is locked, so it has no stepper. */}
                  {!included && (
                    <Box flexDirection="column" alignItems="flex-end" gap={4}>
                      <Box
                        alignItems="center"
                        gap={4}
                        padding={2}
                        borderRadius={8}
                        border="1px solid var(--border, #e5e7eb)"
                      >
                        <Button
                          text="−"
                          aria-label={t("decrease")}
                          title={t("decrease")}
                          size="sm"
                          minWidth={30}
                          disabled={qty <= min}
                          onClick={() => setQty(ing, qty - 1)}
                        />
                        <Typography
                          as="span"
                          variant="h6"
                          margin={0}
                          minWidth={28}
                          styles={{ textAlign: "center" }}
                          aria-live="polite"
                        >
                          {qty}
                        </Typography>
                        <Button
                          text="+"
                          aria-label={t("increase")}
                          title={t("increase")}
                          size="sm"
                          minWidth={30}
                          disabled={qty >= ing.max_quantity}
                          onClick={() => setQty(ing, qty + 1)}
                        />
                      </Box>
                      {ing.quantity && ing.unit && (
                        <Typography
                          variant="caption"
                          margin={0}
                          color="var(--foreground)"
                          aria-live="polite"
                        >
                          {formatPortion(
                            qty * parseFloat(ing.quantity),
                            ing.unit,
                          )}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Single-select option chips: pick exactly one; the chosen chip
                    drives the name/image/price above and the live nutrition. */}
                {isChoice && (
                  <Box
                    flexWrap="wrap"
                    gap={8}
                    paddingBottom={8}
                    role="group"
                    aria-label={t("chooseOption", { name })}
                  >
                    {choices.map((c) => {
                      const active = selectedId === c.ingredient;
                      const cName =
                        (locale === "en" ? c.en_name : c.name) ?? c.name;
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
                          onClick={() => setOption(ing.id, c.ingredient)}
                          aria-pressed={active}
                          paddingX={12}
                          paddingY={6}
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
                          styles={{ fontWeight: 600, fontSize: "0.8125rem" }}
                        />
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
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
