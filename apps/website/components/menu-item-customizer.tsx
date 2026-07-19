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
  const { quantities, setQuantity } = useMenuCustomization();

  // Included (non-removable) ingredients are locked at 1; removable add-ons can
  // go down to 0.
  const minFor = (ing: MenuItemIngredient) => (ing.is_removable ? 0 : 1);

  const setQty = (ing: MenuItemIngredient, next: number) => {
    const clamped = Math.max(minFor(ing), Math.min(next, ing.max_quantity));
    setQuantity(ing.id, clamped);
  };

  const total = useMemo(() => {
    let sum = parseFloat(basePrice);
    for (const ing of ingredients) {
      const qty = quantities[ing.id] ?? ing.included_units;
      const chargeable = Math.max(0, qty - ing.included_units);
      sum += chargeable * parseFloat(ing.price);
    }
    return sum;
  }, [basePrice, ingredients, quantities]);

  // Order: included-by-default first (locked essentials), then the free
  // add-ons, then the paid add-ons. A stable sort keeps each group in the
  // admin-set `sort_order` the API already returns them in.
  const sortedIngredients = useMemo(() => {
    const rank = (ing: MenuItemIngredient) => {
      if (!ing.is_removable) return 0;
      return parseFloat(ing.price) === 0 ? 1 : 2;
    };
    return [...ingredients].sort((a, b) => rank(a) - rank(b));
  }, [ingredients]);

  const showToast = (kind: ToastKind) =>
    setToast((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }));

  // Only the deltas from what the base already includes travel to the server;
  // it recomputes and stores the price, so nothing here is trusted about money.
  const addToCart = () => {
    const customization = ingredients
      .map((ing) => ({
        ingredient: ing.id,
        quantity: quantities[ing.id] ?? ing.included_units,
      }))
      .filter((row) => {
        const ing = ingredients.find((i) => i.id === row.ingredient);
        return ing && row.quantity !== ing.included_units;
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
      {ingredients.length > 0 && (
        <Box flexDirection="column" gap={10}>
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("customize", { name: menuItemName })}
          </Typography>

          {sortedIngredients.map((ing) => {
            const qty = quantities[ing.id] ?? ing.included_units;
            const min = minFor(ing);
            const name = (locale === "en" ? ing.en_name : ing.name) ?? ing.name;
            const price = parseFloat(ing.price);
            // Non-removable ingredients are included by default: locked, in the
            // base price, shown as an "Included" line with no price or stepper.
            const included = !ing.is_removable;
            return (
              <Box
                key={ing.id}
                alignItems="center"
                justifyContent="space-between"
                gap={12}
                flexWrap="wrap"
                styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
              >
                <Box alignItems="center" gap={10} flex="1" minWidth={160}>
                  {ing.image && (
                    <Box
                      width={44}
                      height={44}
                      flex="0 0 auto"
                      borderRadius={8}
                      backgroundColor="var(--surface-2)"
                      styles={{ position: "relative", overflow: "hidden" }}
                    >
                      <Image
                        src={ing.image}
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
                        ` · ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}`}
                    </Typography>
                    {!included && (
                      <Typography
                        variant="caption"
                        margin={0}
                        color="var(--foreground)"
                      >
                        {price > 0
                          ? t("perUnitUpcharge", {
                              price: formatPrice(ing.price, currency),
                            })
                          : t("free")}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {included ? (
                  <Typography
                    as="span"
                    variant="label"
                    margin={0}
                    color="var(--foreground)"
                  >
                    {t("included")}
                  </Typography>
                ) : (
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
