import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { getSession } from "@repo/auth/session";
import type {
  FeaturedProduct,
  FeaturedService,
  MenuItemDetail,
  BuyableVariant,
} from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { BuyableCardActions } from "./buyable-card-actions";

export type BuyableItem =
  | { kind: "product"; data: FeaturedProduct }
  | { kind: "service"; data: FeaturedService }
  | { kind: "food"; data: MenuItemDetail };

function defaultVariant(
  variants: BuyableVariant[],
): BuyableVariant | undefined {
  return variants.find((v) => v.is_default) ?? variants[0];
}

export async function BuyableCard({
  item,
  locale,
  productLabel,
  serviceLabel,
  menuLabel,
  fromLabel,
}: {
  item: BuyableItem;
  locale: string;
  productLabel: string;
  serviceLabel: string;
  /** Corner badge label for a `food` item; required when a food card renders. */
  menuLabel?: string;
  /**
   * "from" prefix for a `food` item's price - add-ons raise it, so the card
   * price is a starting point. Required when a food card renders.
   */
  fromLabel?: string;
}) {
  const { kind, data } = item;

  // The favorites API knows a menu item as `menu_item`; product/service keep
  // their own kind. This is the only place the two names diverge.
  const favoriteKind = kind === "food" ? "menu_item" : kind;

  // The heart rides on every card, wherever the card is rendered, so it resolves
  // its own state instead of making each grid thread it down. Both reads are
  // `cache()`d per request: a grid of N cards costs one session decode and one
  // ids fetch between them, and an anonymous visitor costs no fetch at all. A
  // logged-out heart is still rendered - clicking it routes to /auth.
  const [session, favorite, origin] = await Promise.all([
    getSession(),
    isFavorite(favoriteKind, data.id),
    getRequestOrigin(),
  ]);

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

  // Only product/service carry variants; a menu item is priced whole and
  // customised on its detail page, so it has no card-level variant.
  const variant =
    item.kind === "food" ? undefined : defaultVariant(item.data.variants);
  const effectivePrice = variant?.effective_price ?? data.price;
  const effectiveCompare =
    variant?.effective_compare_price ?? data.compare_price;
  const image =
    item.kind === "food"
      ? (item.data.image ??
        item.data.images.find((i) => i.image)?.image ??
        null)
      : (variant?.effective_image ?? data.image);

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const hasImage = Boolean(image);

  // A service is always orderable and food follows its own availability flag;
  // only products carry stock, where a variant's own flag wins over the
  // product's. Mirrors the API's per-line stock check.
  const inStock =
    item.kind === "food"
      ? item.data.is_available
      : item.kind === "service"
        ? true
        : (variant?.in_stock ?? item.data.in_stock);

  const duration = item.kind === "service" ? item.data.duration : null;

  // Whether the card's own variant is already a line, and which line it is - the
  // button turns into "remove" and needs the row's id to delete it. A food card
  // adds the base (default-ingredients) line, so it resolves the uncustomised
  // menu line. Read after `variant` resolves because the variant is half the
  // line's identity; the lookup is `cache()`d per request, so the grid still
  // costs one fetch.
  const cartLineId =
    item.kind === "food"
      ? await findCartLineId("menu_item", data.id, null)
      : await findCartLineId(item.kind, data.id, variant?.id ?? null);

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

        <Badge
          variant="filled"
          size="sm"
          color={
            kind === "product"
              ? "rgb(34, 181, 32)"
              : kind === "service"
                ? "rgba(99,102,241,0.8)"
                : "rgba(234,88,12,0.85)"
          }
          textColor="#fff"
          style={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
        >
          {kind === "product"
            ? productLabel
            : kind === "service"
              ? serviceLabel
              : menuLabel}
        </Badge>

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
                size="sm"
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
                size="sm"
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
            variant="h5"
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
            variant="caption"
            margin={0}
            color="color-mix(in srgb, var(--foreground) 85%, transparent)"
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
              <Typography
                as="span"
                variant="caption"
                color="color-mix(in srgb, var(--foreground) 75%, transparent)"
              >
                {fromLabel}
              </Typography>
            )}
            <Typography
              as="span"
              variant="h6"
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
                  color="color-mix(in srgb, var(--foreground) 65%, transparent)"
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
            initialFavorite={favorite}
            isLoggedIn={session !== null}
            variantId={variant?.id ?? null}
            cartLineId={cartLineId}
            inStock={inStock}
          />
        </Box>
      </Box>
    </Card>
  );
}
