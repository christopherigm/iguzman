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
import { ingredientChoices, resolveChoice } from "@/lib/menu-selection";
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

  // Internal ingredients are kitchen-only recipe components: hidden from the
  // customiser and excluded from the price (the server does the same in
  // `price_for_selection`). They still reach the nutrition label - which reads
  // the full ingredient list separately - because they are really in the food.
  const visibleIngredients = useMemo(
    () => ingredients.filter((ing) => !ing.is_internal),
    [ingredients],
  );

  // Included (non-removable) ingredients are locked at 1; removable add-ons can
  // go down to 0.
  const minFor = (ing: MenuItemIngredient) => (ing.is_removable ? 0 : 1);

  const setQty = (ing: MenuItemIngredient, next: number) => {
    const clamped = Math.max(minFor(ing), Math.min(next, ing.max_quantity));
    setQuantity(ing.id, clamped);
  };

  // Mirrors the server's `upcharge_for_quantity`: the base already paid for the
  // default option's included units, so only the value the customer's *chosen*
  // option x quantity exceeds that baseline is charged (never negative).
  const total = useMemo(() => {
    let sum = parseFloat(basePrice);
    for (const ing of visibleIngredients) {
      const qty = quantities[ing.id] ?? ing.default_units;
      const choice = resolveChoice(ing, options[ing.id]);
      const includedValue = parseFloat(ing.price) * ing.included_units;
      const selectedValue = parseFloat(choice.price) * qty;
      sum += Math.max(0, selectedValue - includedValue);
    }
    return sum;
  }, [basePrice, visibleIngredients, quantities, options]);

  // Order: included-by-default first (locked essentials), then the free
  // add-ons, then the paid add-ons. A stable sort keeps each group in the
  // admin-set `sort_order` the API already returns them in.
  const sortedIngredients = useMemo(() => {
    const rank = (ing: MenuItemIngredient) => {
      if (!ing.is_removable) return 0;
      return parseFloat(ing.price) === 0 ? 1 : 2;
    };
    return [...visibleIngredients].sort((a, b) => rank(a) - rank(b));
  }, [visibleIngredients]);

  const showToast = (kind: ToastKind) =>
    setToast((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }));

  // Only the deltas from what the base already includes travel to the server;
  // it recomputes and stores the price, so nothing here is trusted about money.
  const addToCart = () => {
    const customization = visibleIngredients
      .map((ing) => {
        const chosen = options[ing.id] ?? ing.ingredient;
        const isDefaultOption = chosen === ing.ingredient;
        const quantity = quantities[ing.id] ?? ing.default_units;
        return {
          ingredient: ing.id,
          quantity,
          // Only carry `option` when the customer swapped in an alternative; the
          // server normalises anyway, this just keeps the payload lean.
          ...(isDefaultOption ? {} : { option: chosen }),
          _isDefaultOption: isDefaultOption,
        };
      })
      // A row travels when the quantity changed OR a non-default option was picked.
      .filter((row) => {
        const ing = visibleIngredients.find((i) => i.id === row.ingredient);
        if (!ing) return false;
        return row.quantity !== ing.default_units || !row._isDefaultOption;
      })
      .map(({ _isDefaultOption, ...row }) => {
        void _isDefaultOption;
        return row;
      });

    return fetch("/api/auth/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "menu_item",
        id: menuItemId,
        customization,
        quantity: 1,
      }),
    });
  };

  const handleAdd = () => {
    if (!isLoggedIn) {
      router.push("/auth");
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
      router.push("/auth");
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

          {sortedIngredients.map((ing) => {
            const qty = quantities[ing.id] ?? ing.default_units;
            const min = minFor(ing);
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
              ? (locale === "en" ? ing.group_en_name : ing.group_name) ??
                ing.group_name
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
                              ? formatPortion(parseFloat(ing.quantity), ing.unit)
                              : formatPortion(
                                  parseFloat(ing.quantity),
                                  "",
                                ).trim()
                          }`}
                      </Typography>
                      {/* The price slot: a locked "Included" for a non-removable
                          ingredient, otherwise its per-unit up-charge (or "Free");
                          a premium choice-group option shows its up-charge too. */}
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
                              ? t("perUnitUpchargeWithFree", {
                                  count: ing.included_units,
                                  price: formatPrice(choice.price, currency),
                                })
                              : t("perUnitUpcharge", {
                                  price: formatPrice(choice.price, currency),
                                })
                            : t("free")}
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
