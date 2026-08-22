"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Link } from "@repo/i18n/navigation";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Toast } from "@repo/ui/core-elements/toast";
import type { CartItem, CartRewards } from "@/lib/cart";
import { formatPrice } from "@/lib/price";
import { menuEtaLabel } from "@/lib/menu-eta";
import { itemHref } from "@/lib/catalog-paths";
import {
  customizableIngredients,
  enabledIngredients,
  hasSizeChoice,
  type CustomizationRow,
} from "@/lib/menu-selection";
import { MenuCustomizeModal } from "@/components/menu-customize-modal";
import "./cart-line.css";

interface CartLineProps {
  line: CartItem;
  locale: string;
  /** Whether this row belongs to a signed-in customer's cart or a guest's -
   *  which is the only thing the customiser cannot work out for itself. */
  isLoggedIn: boolean;
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
  /**
   * Re-configure the dish - a new size and a new ingredient selection, leaving
   * the quantity alone. Owned by the parent for the same reason the two writes
   * above are; a menu row only offers the button when this is given.
   */
  onEditSelection?: (selection: {
    size?: number;
    customization: CustomizationRow[];
  }) => Promise<boolean>;
  /**
   * The whole basket's points position - balance, what is already committed,
   * and whether that fits. Resolved by the API over every line at once, because
   * affordability is a question no single row can answer for itself.
   */
  rewards: CartRewards;
  /**
   * Flip this line between money and points, resolving to whether it stuck.
   * Owned by the parent for the reason the other two writes are - the two carts
   * are addressed differently. Absent for a guest, who has no account to hold a
   * balance and therefore no choice to make.
   */
  onPayWithPointsChange?: (payWithPoints: boolean) => Promise<boolean>;
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
  isLoggedIn,
  onQuantityChange,
  onRemove,
  onEditSelection,
  rewards,
  onPayWithPointsChange,
}: CartLineProps) {
  const t = useTranslations("Cart");
  const tMenu = useTranslations("Menu");
  const [quantity, setQuantity] = useState(line.quantity);
  // Optimistic like the quantity stepper, and for the same reason: the choice
  // repaints on click and rolls back if the write fails, because a pair of
  // buttons that waits for a round-trip before moving reads as broken.
  const [payWithPoints, setPayWithPoints] = useState(line.pay_with_points);
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editFailed, setEditFailed] = useState(0);

  const { item } = line;

  const name =
    (locale === "en" ? item.en_name : item.name) ??
    item.name ??
    item.en_name ??
    "";

  // One shape for all three families, `/<family>/<category>/<slug>`; the cart's
  // own `kind` is already that first segment's family.
  const href = itemHref(
    line.kind === "menu_item" ? "food" : line.kind,
    line.item.category_slug,
    line.item.slug,
  );

  // A dish says how long it will take instead of naming its family: the customer
  // already knows what they put in their basket, and "ready in 20 min" is the
  // thing they cannot read off the row otherwise. Product and service lines
  // simply carry no chip - the item type was never news either.
  const etaLabel =
    line.kind === "menu_item"
      ? menuEtaLabel(tMenu, line.item.eta_minutes)
      : null;

  // Only a dish can be re-configured, and only one that actually offers a
  // choice - a size to pick or an add-on to move. The same test the catalog card
  // makes before asking instead of adding: with nothing to change, a pencil
  // opens a modal that says nothing.
  const canEdit =
    line.kind === "menu_item" &&
    onEditSelection !== undefined &&
    (hasSizeChoice(line.item.sizes) ||
      customizableIngredients(enabledIngredients(line.item.ingredients))
        .length > 0);

  const image = item.image;
  const changeQuantity = (next: number) => {
    if (next < 1 || next > MAX_QUANTITY || next === quantity) return;

    const previous = quantity;
    setQuantity(next);

    startTransition(async () => {
      if (!(await onQuantityChange(next))) setQuantity(previous);
    });
  };

  // The modal owns the write and reports back here; on success the parent's own
  // refresh (or re-resolve) is what repaints the row with its new size, add-ons
  // and price - there is nothing to update optimistically, since every one of
  // those numbers is the server's to recompute.
  const handleEditResult = (ok: boolean) => {
    setEditing(false);
    if (!ok) setEditFailed((count) => count + 1);
  };

  const choosePayment = (next: boolean) => {
    if (!onPayWithPointsChange || next === payWithPoints) return;

    const previous = payWithPoints;
    setPayWithPoints(next);

    startTransition(async () => {
      if (!(await onPayWithPointsChange(next))) setPayWithPoints(previous);
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

  // ── How this line is being paid for ────────────────────────────────────────
  // Only offered when the tenant runs a program, the item has a points price,
  // and the parent gave us a way to write the choice - which is what takes a
  // guest out of it, since they have no account to hold a balance.
  const pointsPrice = line.points_price;
  const canChoosePayment =
    rewards.enabled && !!pointsPrice && onPayWithPointsChange !== undefined;
  const linePoints = (pointsPrice ?? 0) * quantity;

  // ⚠ **What this line would cost *on top of* what the basket already commits.**
  // `rewards.points_used` includes this line when it is already selected, so
  // comparing `linePoints` against the raw balance would ask "can I afford this
  // line alone?" - and three separately affordable lines can add up to a basket
  // the balance cannot cover. Subtracting the other lines' commitment is what
  // makes the button say something true about the basket as a whole.
  const committedElsewhere =
    rewards.points_used - (payWithPoints ? linePoints : 0);
  const affordable = linePoints <= rewards.balance - committedElsewhere;

  return (
    <>
      <Card
        padding={0}
        border="none"
        elevation={3}
        backgroundColor="var(--surface-1)"
        styles={{ opacity: isPending ? 0.7 : 1 }}
      >
        {/* `stretch`, not `flex-start`: the 110px thumbnail is what sets a bare
          line's height, and the text column has to be that tall for the stepper
          row below to have a bottom to sit on. */}
        <Box gap={14} padding={12} alignItems="stretch" width="100%">
          <Link href={href} prefetch className="cart-line__image-link">
            <Box
              width={110}
              height={110}
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
                  sizes="110px"
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

                {(etaLabel || !line.in_stock) && (
                  <Box alignItems="center" gap={6} flexWrap="wrap">
                    {etaLabel && (
                      <Badge
                        variant="subtle"
                        size="sm"
                        color="var(--accent-text)"
                      >
                        {etaLabel}
                      </Badge>
                    )}
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
                )}

                {/* The size, above the add-on list: it is which dish this line is,
                  not a change made to one, and it is already priced into
                  `unit_price` - so no delta is repeated here. */}
                {line.size && (
                  <Typography
                    variant="caption"
                    margin={0}
                    fontWeight={600}
                    color="var(--foreground)"
                  >
                    {(locale === "en" ? line.size.en_name : line.size.name) ??
                      line.size.name}
                    {line.size.measurement ? ` · ${line.size.measurement}` : ""}
                  </Typography>
                )}

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

              <Box alignItems="center" gap={4} flex="0 0 auto">
                {/* Beside remove rather than under the add-on list: the two are
                  what a customer does to a line they got wrong, and one of them
                  should not be the destructive one by default. */}
                {canEdit && (
                  <IconButton
                    icon="/icons/edit.svg"
                    aria-label={t("edit")}
                    title={t("edit")}
                    kind="primary"
                    size="md"
                    disabled={isPending}
                    onClick={() => setEditing(true)}
                  />
                )}

                <IconButton
                  icon="/icons/remove-from-cart.svg"
                  aria-label={t("remove")}
                  title={t("remove")}
                  kind="error"
                  size="md"
                  disabled={isPending}
                  onClick={handleRemove}
                />
              </Box>
            </Box>

            {/* `auto`, not a fixed gap: the stepper and the line total sit on
              the bottom edge of every row, whatever is above them. A dish with
              no size and no add-ons has nothing to fill the thumbnail's height,
              and the row otherwise floated up under the title. Content above
              pushes it back down - the column's own `gap` is the floor. */}
            <Box
              alignItems="center"
              justifyContent="space-between"
              gap={10}
              flexWrap="wrap"
              marginTop="auto"
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

                <Typography
                  as="span"
                  variant="caption"
                  color="var(--foreground)"
                >
                  {formatPrice(line.unit_price, line.currency)} {t("each")}
                </Typography>
              </Box>

              {/* With a choice to make, the two buttons below *are* the line
                  total - printing it a third time here would say the same
                  number twice and make the row harder to read, not easier. */}
              {!canChoosePayment && (
                <Typography
                  as="span"
                  variant="h6"
                  fontWeight={700}
                  margin={0}
                  color="var(--on-surface)"
                >
                  {lineTotal}
                </Typography>
              )}
            </Box>

            {/* How this line is paid for: money (the default) or points.
                Two `Button`s rather than a switch or a radio pair, because each
                one has to *state a price* - the choice is between two amounts,
                not between two settings, and the amounts are what the customer
                is actually comparing.

                ⚠ The points button is disabled, not hidden, when the balance
                cannot cover it: hiding it would leave no way to discover that
                the dish is redeemable at all, which is exactly the thing that
                makes a customer want to earn more. */}
            {canChoosePayment && (
              <Box
                gap={8}
                flexWrap="wrap"
                marginTop={10}
                role="group"
                aria-label={t("payWith")}
              >
                {/* Selected is `kind="primary"`; unselected is the default
                    button, which is the only other kind available here (the
                    scale is primary/success/error/warning - there is no
                    "secondary"). The pair reads as one choice because only one
                    of them is ever filled. */}
                <Button
                  text={lineTotal}
                  kind={payWithPoints ? undefined : "primary"}
                  size="sm"
                  aria-pressed={!payWithPoints}
                  disabled={isPending}
                  onClick={() => choosePayment(false)}
                />
                <Button
                  text={t("pointsPrice", { points: linePoints })}
                  kind={payWithPoints ? "primary" : undefined}
                  size="sm"
                  aria-pressed={payWithPoints}
                  // `isPending` covers the in-flight write; `!affordable` is the
                  // real refusal, and it is measured against the rest of the
                  // basket rather than against this line alone.
                  disabled={isPending || (!payWithPoints && !affordable)}
                  title={
                    !affordable && !payWithPoints ? t("pointsShort") : undefined
                  }
                  onClick={() => choosePayment(true)}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Card>

      {/* Rendered from the cart itself, so changing your mind about the pizza you
          already chose does not mean going back to its page and starting again.
          The line's stored selection seeds the pickers - `line.customization`
          carries only what differs from the dish as listed, which is exactly the
          shape `buildCustomization` produces on the way in. */}
      {editing && line.kind === "menu_item" && onEditSelection && (
        <MenuCustomizeModal
          menuItemId={line.item.id}
          name={name}
          basePrice={line.item.price}
          currency={line.currency}
          ingredients={enabledIngredients(line.item.ingredients)}
          sizes={line.item.sizes}
          isLoggedIn={isLoggedIn}
          locale={locale}
          editing={{
            size: line.size?.id ?? null,
            customization: line.customization.map((row) => ({
              ingredient: row.ingredient,
              quantity: row.quantity,
              ...(row.option !== null ? { option: row.option } : {}),
            })),
            onSave: onEditSelection,
          }}
          onCancel={() => setEditing(false)}
          onResult={handleEditResult}
        />
      )}

      {editFailed > 0 && (
        <Toast
          key={editFailed}
          message={t("editFailed")}
          variant="error"
          position="top-center"
          primary
          duration={3}
        />
      )}
    </>
  );
}
