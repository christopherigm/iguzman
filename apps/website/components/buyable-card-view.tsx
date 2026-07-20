"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { toShareDescription } from "@/lib/share";
import { formatPrice, discountPercent } from "@/lib/price";
import { BuyableCardActions } from "./buyable-card-actions";
import { AdminEditButton } from "./admin-edit-button";
import type { BuyableItem } from "./buyable-card";

export interface BuyableCardViewProps {
  item: BuyableItem;
  locale: string;
  productLabel: string;
  serviceLabel: string;
  menuLabel?: string;
  fromLabel?: string;
  /** Absolute origin, for the share link. Only the server knows the request
   *  host, so it is always passed in. */
  origin: string;
  /** Show the admin edit shortcut, and its localized label. */
  isAdmin: boolean;
  editLabel: string;
  /** Drives which cart the buttons write to - rows, or localStorage. */
  isLoggedIn: boolean;
  /** The signed-in customer's saved/in-cart state. Both are false/null for a
   *  guest, whose state the buttons read from localStorage themselves. */
  initialFavorite: boolean;
  cartLineId: number | null;
}

/**
 * The catalog card, as pure rendering.
 *
 * Split out of `BuyableCard` so it can also be rendered on the client, which the
 * guest favorites grid needs: those items are only known after localStorage has
 * been resolved in the browser, and an async server component cannot be called
 * from there. Every fact the server used to resolve inline - the session, the
 * heart, the cart line, the request origin - arrives as a prop instead.
 */
export function BuyableCardView({
  item,
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  fromLabel,
  origin,
  isAdmin,
  editLabel,
  isLoggedIn,
  initialFavorite,
  cartLineId,
}: BuyableCardViewProps) {
  const { kind, data } = item;
  const tMenu = useTranslations("Menu");

  // A food card advertises its dietary flags instead of the generic kind badge,
  // since "which of these can I eat" is the only question a diner scanning a
  // grid is asking. Vegan is the stronger claim, so it supersedes vegetarian
  // rather than both showing for the same dish - same rule as `menu-detail`.
  // With no flag set the kind badge stays, so the corner is never empty.
  const dietary: { label: string; color: string }[] = [];
  if (item.kind === "food") {
    const food = item.data;
    if (food.is_organic)
      dietary.push({ label: tMenu("organic"), color: "rgba(101,163,13)" });
    if (food.is_vegan)
      dietary.push({ label: tMenu("vegan"), color: "rgba(22,163,74)" });
    else if (food.is_vegetarian)
      dietary.push({
        label: tMenu("vegetarian"),
        color: "rgba(5,150,105)",
      });
    if (food.is_gluten_free)
      dietary.push({
        label: tMenu("glutenFree"),
        color: "rgba(202,138,4)",
      });
  }

  // Admin edit shortcut, keyed to the same table the admin CMS uses per kind
  // (a food item is a `menu_item` there). Only rendered for an admin viewer.
  const adminEditHref =
    kind === "product"
      ? `/admin/products/${data.id}`
      : kind === "service"
        ? `/admin/services/${data.id}`
        : `/admin/menu-items/${data.id}`;

  const name =
    (locale === "en" ? data.en_name : data.name) ??
    data.name ??
    data.en_name ??
    "";

  // Food prefers its short blurb (the card's line), falling back to the full
  // description; product/service have one description field.
  const description =
    item.kind === "food"
      ? ((locale === "en"
          ? item.data.en_short_description
          : item.data.short_description) ??
        (locale === "en" ? item.data.en_description : item.data.description) ??
        item.data.description ??
        "")
      : ((locale === "en" ? data.en_description : data.description) ??
        data.description ??
        data.en_description ??
        "");

  const href =
    kind === "product"
      ? `/products/${data.slug}`
      : kind === "service"
        ? `/services/${data.slug}`
        : `/food/${data.slug}`;

  // A sibling variant is its own catalog item with its own card, so a card only
  // ever prices and pictures the item it is for.
  const effectivePrice = data.price;
  const effectiveCompare = data.compare_price;
  const image =
    item.kind === "food"
      ? (item.data.image ??
        item.data.images.find((i) => i.image)?.image ??
        null)
      : data.image;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const hasImage = Boolean(image);

  // A service is always orderable and food follows its own availability flag;
  // only products carry stock. Mirrors the API's per-line stock check.
  const inStock =
    item.kind === "food"
      ? item.data.is_available
      : item.kind === "service"
        ? true
        : item.data.in_stock;

  const duration = item.kind === "service" ? item.data.duration : null;

  return (
    <Card
      href={href}
      prefetch
      padding={0}
      border="none"
      elevation={5}
      height="100%"
      backgroundColor="var(--surface-1)"
      className="zoom-on-hover"
      styles={{ position: "relative", textDecoration: "none" }}
    >
      <Box
        width="100%"
        backgroundColor="var(--surface-3, #e5e7eb)"
        flex="0 0 auto"
        styles={{
          position: "relative",
          aspectRatio: "1 / 1",
          overflow: "hidden",
        }}
      >
        {hasImage ? (
          <Image
            fill
            src={image!}
            alt={name}
            sizes="(min-width: 1200px) 16vw, (min-width: 600px) 25vw, 50vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <Box
            backgroundColor={
              data.background_color ?? "var(--surface-3, #e5e7eb)"
            }
            styles={{ position: "absolute", inset: 0 }}
          />
        )}

        <Box
          alignItems="flex-start"
          flexWrap="wrap"
          gap={4}
          // Leave the top-right corner clear when the admin edit button is there.
          maxWidth={isAdmin ? "calc(100% - 60px)" : "calc(100% - 16px)"}
          styles={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
        >
          {dietary.length > 0 ? (
            dietary.map((d) => (
              <Badge
                key={d.label}
                variant="filled"
                size="md"
                color={d.color}
                textColor="#fff"
              >
                {d.label}
              </Badge>
            ))
          ) : (
            <Badge
              variant="filled"
              size="md"
              color={
                kind === "product"
                  ? "rgb(34, 181, 32)"
                  : kind === "service"
                    ? "rgba(99,102,241)"
                    : "rgba(234,88,12)"
              }
              textColor="#fff"
            >
              {kind === "product"
                ? productLabel
                : kind === "service"
                  ? serviceLabel
                  : menuLabel}
            </Badge>
          )}
        </Box>

        {/* Admin-only edit shortcut, riding the top-right of the image. */}
        {isAdmin && (
          <Box styles={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
            <AdminEditButton
              href={adminEditHref}
              label={editLabel}
              size="sm"
              solid
            />
          </Box>
        )}

        {/* Duration and discount share the bottom-left corner. Only services
            carry a duration, so on a product the discount sits there alone. */}
        {(duration != null || discount > 0) && (
          <Box
            alignItems="center"
            flexWrap="wrap"
            gap={4}
            styles={{ position: "absolute", bottom: 8, left: 8, zIndex: 1 }}
          >
            {duration != null && (
              <Badge
                variant="filled"
                size="md"
                color="rgba(0,0,0,0.6)"
                textColor="#fff"
              >
                {duration >= 60
                  ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ""}`
                  : `${duration}m`}
              </Badge>
            )}

            {discount > 0 && (
              <Badge
                variant="filled"
                size="md"
                color="#ef4444"
                textColor="#fff"
              >
                -{discount}%
              </Badge>
            )}
          </Box>
        )}
      </Box>

      <Box flexDirection="column" gap={6} flex={1} className="card-content">
        {name && (
          <Typography
            as="h3"
            variant="h4"
            margin={0}
            color="var(--foreground)"
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {name}
          </Typography>
        )}

        {description && (
          <Typography
            variant="body"
            margin={0}
            color="var(--foreground)"
            styles={{
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </Typography>
        )}

        <Box flexDirection="column" gap={8} marginTop="auto" paddingTop={4}>
          <Box alignItems="baseline" gap={6} flexWrap="wrap">
            {kind === "food" && fromLabel && (
              <Typography as="span" variant="caption" color="var(--foreground)">
                {fromLabel}
              </Typography>
            )}
            <Typography
              as="span"
              variant="h4"
              fontWeight={700}
              color="var(--foreground)"
            >
              {formatPrice(effectivePrice, data.currency)}
            </Typography>
            {effectiveCompare &&
              parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
                <Typography
                  as="span"
                  variant="label"
                  fontWeight={400}
                  color="var(--foreground)"
                  // 11px sub-scale: compare price sits below the label (12px) tier
                  styles={{ fontSize: 11, textDecoration: "line-through" }}
                >
                  {formatPrice(effectiveCompare, data.currency)}
                </Typography>
              )}
          </Box>

          {/* Divider. A 1px filled Box rather than a border, so the rule is
              expressed in props; `flex` keeps the column from collapsing it. */}
          <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

          <BuyableCardActions
            kind={kind}
            id={data.id}
            name={name}
            shareText={toShareDescription(description)}
            shareUrl={`${origin}${href}`}
            initialFavorite={initialFavorite}
            isLoggedIn={isLoggedIn}
            cartLineId={cartLineId}
            inStock={inStock}
          />
        </Box>
      </Box>
    </Card>
  );
}
