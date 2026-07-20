"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { CartItem } from "@/lib/cart";
import { formatPrice } from "@/lib/price";
import "./cart-line.css";

interface CartLineProps {
  line: CartItem;
  locale: string;
  productLabel: string;
  serviceLabel: string;
  menuLabel: string;
  /**
   * Persist a new quantity for this line, resolving to whether it stuck. Owned
   * by the parent because the two carts are addressed differently: a customer's
   * line is a row behind `/api/auth/cart/[id]`, a guest's is an index in
   * localStorage. Everything this component renders is identical either way,
   * which is the point of passing the writes in rather than branching in here.
   */
  onQuantityChange: (quantity: number) => Promise<boolean>;
  /** Drop the line entirely, resolving to whether it stuck. */
  onRemove: () => Promise<boolean>;
}

const MAX_QUANTITY = 99;

/**
 * One row of the cart: image, name, quantity stepper, line total.
 *
 * Optimistic like the heart - the number moves on click and rolls back if the
 * write fails - because a stepper that waits for a round-trip before painting
 * feels broken when you tap it three times. The line total is recomputed locally
 * from the optimistic quantity so the two never disagree mid-flight; the
 * parent's write then refreshes whatever owns the real numbers, which is what
 * corrects the summary and the navbar count.
 */
export function CartLine({
  line,
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  onQuantityChange,
  onRemove,
}: CartLineProps) {
  const t = useTranslations("Cart");
  const [quantity, setQuantity] = useState(line.quantity);
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  const { kind, item } = line;

  const name =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    "";

  const href =
    kind === "product"
      ? `/products/${item.slug}`
      : kind === "service"
        ? `/services/${item.slug}`
        : `/food/${item.slug}`;

  const kindLabel =
    kind === "product"
      ? productLabel
      : kind === "service"
        ? serviceLabel
        : menuLabel;

  const kindColor =
    kind === "product"
      ? "rgb(34, 181, 32)"
      : kind === "service"
        ? "rgba(99,102,241,0.8)"
        : "rgba(234,88,12,0.85)";

  const image = item.image;
  const changeQuantity = (next: number) => {
    if (next < 1 || next > MAX_QUANTITY || next === quantity) return;

    const previous = quantity;
    setQuantity(next);

    startTransition(async () => {
      if (!(await onQuantityChange(next))) setQuantity(previous);
    });
  };

  const handleRemove = () => {
    setRemoved(true);

    startTransition(async () => {
      if (!(await onRemove())) setRemoved(false);
    });
  };

  // The row disappears the moment you click remove; if the request then fails,
  // `removed` flips back and the row returns rather than silently vanishing from
  // a cart that still contains it.
  if (removed) return null;

  const lineTotal = formatPrice(
    (parseFloat(line.unit_price) * quantity).toFixed(2),
    line.currency,
  );

  return (
    <Card
      padding={0}
      border="none"
      elevation={3}
      backgroundColor="var(--surface-1)"
      styles={{ opacity: isPending ? 0.7 : 1 }}
    >
      <Box gap={14} padding={12} alignItems="flex-start" width="100%">
        <Link href={href} prefetch className="cart-line__image-link">
          <Box
            width={88}
            height={88}
            flex="0 0 auto"
            borderRadius={8}
            backgroundColor={
              item.background_color ?? "var(--surface-3, #e5e7eb)"
            }
            styles={{ position: "relative", overflow: "hidden" }}
          >
            {image && (
              <Image
                fill
                src={image}
                alt={name}
                sizes="88px"
                style={{ objectFit: "cover" }}
              />
            )}
          </Box>
        </Link>

        <Box flexDirection="column" gap={6} flex={1} minWidth={0}>
          <Box alignItems="flex-start" justifyContent="space-between" gap={8}>
            <Box flexDirection="column" gap={4} flex={1} minWidth={0}>
              <Link href={href} prefetch className="cart-line__title-link">
                <Typography
                  as="h2"
                  variant="h6"
                  margin={0}
                  color="var(--on-surface)"
                  styles={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {name}
                </Typography>
              </Link>

              <Box alignItems="center" gap={6} flexWrap="wrap">
                <Badge
                  variant="filled"
                  size="sm"
                  color={kindColor}
                  textColor="#fff"
                >
                  {kindLabel}
                </Badge>
                {!line.in_stock && (
                  <Badge
                    variant="filled"
                    size="sm"
                    color="#ef4444"
                    textColor="#fff"
                  >
                    {t("outOfStock")}
                  </Badge>
                )}
              </Box>

              {line.customization.length > 0 && (
                <Box flexDirection="column" gap={2}>
                  {line.customization.map((row) => {
                    const rowName =
                      (locale === "en" ? row.en_name : row.name) ?? row.name;
                    const upcharge = parseFloat(row.line_upcharge);
                    return (
                      <Typography
                        key={row.ingredient}
                        variant="caption"
                        margin={0}
                        color="var(--foreground)"
                      >
                        {row.removed
                          ? `− ${rowName}`
                          : `${row.quantity}× ${rowName}`}
                        {upcharge > 0 &&
                          ` (+${formatPrice(row.line_upcharge, line.currency)})`}
                      </Typography>
                    );
                  })}
                </Box>
              )}
            </Box>

            <IconButton
              icon="/icons/remove-from-cart.svg"
              aria-label={t("remove")}
              title={t("remove")}
              kind="error"
              size="sm"
              disabled={isPending}
              onClick={handleRemove}
            />
          </Box>

          <Box
            alignItems="center"
            justifyContent="space-between"
            gap={10}
            flexWrap="wrap"
            marginTop={4}
          >
            <Box alignItems="center" gap={8}>
              {/* Text rather than icons: there is no plus/minus in public/icons,
                  and the glyphs carry the meaning better than a stand-in would.
                  aria-label gives each button its real name. */}
              <Box
                alignItems="center"
                gap={4}
                padding={2}
                borderRadius={8}
                border="1px solid var(--border)"
              >
                <Button
                  text="−"
                  aria-label={t("decrease")}
                  title={t("decrease")}
                  size="sm"
                  minWidth={30}
                  disabled={isPending || quantity <= 1}
                  onClick={() => changeQuantity(quantity - 1)}
                />
                <Typography
                  as="span"
                  variant="h6"
                  margin={0}
                  minWidth={28}
                  color="var(--on-surface)"
                  styles={{ textAlign: "center" }}
                  aria-live="polite"
                >
                  {quantity}
                </Typography>
                <Button
                  text="+"
                  aria-label={t("increase")}
                  title={t("increase")}
                  size="sm"
                  minWidth={30}
                  disabled={isPending || quantity >= MAX_QUANTITY}
                  onClick={() => changeQuantity(quantity + 1)}
                />
              </Box>

              <Typography as="span" variant="caption" color="var(--foreground)">
                {formatPrice(line.unit_price, line.currency)} {t("each")}
              </Typography>
            </Box>

            <Typography
              as="span"
              variant="h6"
              fontWeight={700}
              margin={0}
              color="var(--on-surface)"
            >
              {lineTotal}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
