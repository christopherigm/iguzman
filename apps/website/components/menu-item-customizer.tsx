"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Toast } from "@repo/ui/core-elements/toast";
import type { MenuItemIngredient } from "@/lib/catalog";
import { formatPrice } from "@/lib/price";

interface Props {
  menuItemId: number;
  basePrice: string;
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
  basePrice,
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

  // Quantity per ingredient id, initialised to what the base already includes.
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.included_units])),
  );

  const minFor = (ing: MenuItemIngredient) =>
    ing.is_default && !ing.is_removable ? 1 : 0;

  const setQty = (ing: MenuItemIngredient, next: number) => {
    const clamped = Math.max(minFor(ing), Math.min(next, ing.max_quantity));
    setQuantities((prev) => ({ ...prev, [ing.id]: clamped }));
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

  const showToast = (kind: ToastKind) =>
    setToast((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }));

  const handleAdd = () => {
    if (!isLoggedIn) {
      router.push("/auth");
      return;
    }
    const customization = ingredients
      .map((ing) => ({
        ingredient: ing.id,
        quantity: quantities[ing.id] ?? ing.included_units,
      }))
      .filter((row) => {
        const ing = ingredients.find((i) => i.id === row.ingredient);
        return ing && row.quantity !== ing.included_units;
      });

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "menu_item",
            id: menuItemId,
            customization,
            quantity: 1,
          }),
        });
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

  return (
    <Box flexDirection="column" gap={16}>
      {ingredients.length > 0 && (
        <Box flexDirection="column" gap={10}>
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("customize")}
          </Typography>

          {ingredients.map((ing) => {
            const qty = quantities[ing.id] ?? ing.included_units;
            const min = minFor(ing);
            const name = (locale === "en" ? ing.en_name : ing.name) ?? ing.name;
            const price = parseFloat(ing.price);
            const included = ing.included_units > 0;
            return (
              <Box
                key={ing.id}
                alignItems="center"
                justifyContent="space-between"
                gap={12}
                paddingY={8}
                flexWrap="wrap"
                styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
              >
                <Box flexDirection="column" gap={2} flex="1" minWidth={160}>
                  <Typography variant="body" margin={0}>
                    {name}
                    {ing.quantity &&
                      ` · ${ing.quantity}${ing.unit ? ` ${ing.unit}` : ""}`}
                  </Typography>
                  <Typography
                    variant="caption"
                    margin={0}
                    color="color-mix(in srgb, var(--foreground) 55%, transparent)"
                  >
                    {price > 0
                      ? t("perUnitUpcharge", {
                          price: formatPrice(ing.price, currency),
                        })
                      : included
                        ? t("included")
                        : t("free")}
                  </Typography>
                </Box>

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
              </Box>
            );
          })}
        </Box>
      )}

      <Box
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Box flexDirection="column" gap={2}>
          <Typography
            variant="caption"
            margin={0}
            color="color-mix(in srgb, var(--foreground) 55%, transparent)"
          >
            {t("total")}
          </Typography>
          <Typography as="span" variant="none" className="item-price">
            {formatPrice(total.toFixed(2), currency)}
          </Typography>
        </Box>

        <Button
          text={t("addToCart")}
          icon="/icons/add-to-cart.svg"
          kind="warning"
          size="lg"
          flex="1"
          minWidth={160}
          disabled={!isAvailable || isPending}
          onClick={handleAdd}
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
          duration={3}
        />
      )}
    </Box>
  );
}
