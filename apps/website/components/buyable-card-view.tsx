"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { toShareDescription } from "@/lib/share";
import { menuItemHref } from "@/lib/menu-paths";
import { formatPrice, discountPercent } from "@/lib/price";
import { enabledIngredients, lowestPrice } from "@/lib/menu-selection";
import { BuyableCardActions } from "./buyable-card-actions";
import { FavoriteButton } from "./favorite-button";
import { AdminEditButton } from "./admin-edit-button";
import type { BuyableItem } from "./buyable-card";
import "./buyable-card-view.css";

export interface BuyableCardViewProps {
  item: BuyableItem;
  locale: string;
  fromLabel?: string;
  /**
   * The card as it renders in a narrow column - a flyer's copy column, at a
   * third of its width. It squares the photograph, drops the blurb and leaves
   * the add button alone in the middle of the action row.
   *
   * It is a *reduction*, not a second card: the price, the badges, the admin
   * shortcut and both links to the item are exactly what they are on a catalog
   * grid, so a card in either mode is recognisably the same object. What goes
   * is what cannot be read at that width - two lines of description - and what
   * the surrounding block is already saying, which is why the share and heart
   * tab goes with it, the quantity stepper with it, and the one decision on the
   * row is left.
   */
  compact?: boolean;
  /**
   * A caller-supplied chip for the photograph's top-left corner, painted in the
   * tenant's primary colour - the landing's catalog grid puts the item's own
   * category in it, so a shuffled grid of products, services and dishes says
   * what each card is without the visitor having to open it.
   *
   * It leads the corner the dietary flags share, and is dropped when blank: a
   * caller passing an unset category name must not produce an empty chip.
   */
  badge?: string | null;
  /** "per person" suffix for a service whose booking is priced per head. The
   *  symmetric case to `fromLabel`: the number on the card is not the whole
   *  story, and saying nothing would quote a family of four one quarter of what
   *  they will actually pay. */
  perPersonLabel?: string;
  /**
   * Whether this tenant runs a rewards program, so the card may print an item's
   * points price beside its money one.
   *
   * ⚠ Resolved by the **server** half and passed down, never read from a client
   * hook: it comes off the System payload, and a card that fetched it would do
   * so once per card in a grid of twenty.
   */
  rewardsEnabled?: boolean;
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
  fromLabel,
  compact = false,
  badge,
  perPersonLabel,
  rewardsEnabled = false,
  origin,
  isAdmin,
  editLabel,
  isLoggedIn,
  initialFavorite,
  cartLineId,
}: BuyableCardViewProps) {
  const { kind, data } = item;
  const tMenu = useTranslations("Menu");
  const tCart = useTranslations("Cart");
  const tItem = useTranslations("ItemDetail");

  // A food card advertises its dietary flags, since "which of these can I eat"
  // is the only question a diner scanning a grid is asking. Vegan is the
  // stronger claim, so it supersedes vegetarian rather than both showing for the
  // same dish - same rule as `menu-detail`. With no flag set the corner is
  // simply empty: the grid a card sits in already says what family it belongs
  // to, so a "Product"/"Service"/"Menu" badge only repeated the page's own title.
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

  // `kind` here is the buyable *family*; a menu item's own kind (drink, dessert,
  // ...) picks which detail route it links to.
  const href =
    item.kind === "product"
      ? `/products/${item.data.slug}`
      : item.kind === "service"
        ? `/services/${item.data.slug}`
        : menuItemHref(item.data.category_slug, item.data.slug);

  // A sibling variant is its own catalog item with its own card, so a card only
  // ever prices and pictures the item it is for.
  const effectivePrice = data.price;
  const effectiveCompare = data.compare_price;
  // What the card *prints*, which is not always the list price: a dish offered in
  // several sizes shows the cheapest one it can be had at, since a small size
  // discounts the base and a "from" prefix over the base alone would name a price
  // the customer can beat. The list price stays `effectivePrice` - it is what the
  // compare-price discount is measured against and what the modal applies its
  // deltas to.
  const displayPrice =
    item.kind === "food"
      ? lowestPrice(effectivePrice, item.data.sizes).toFixed(2)
      : effectivePrice;
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

  // A bookable service is sold as an appointment, which a cart line has no way
  // to hold - so its card leads to the booking page instead of offering to add
  // it, exactly as the detail page's buy box replaces its two cart CTAs.
  const bookingSlug =
    item.kind === "service" && item.data.booking_enabled
      ? item.data.slug
      : null;

  // The card itself is *not* a link: only the photo and the name lead to the
  // item, so the badges, the admin shortcut and the whole action row below sit
  // outside any anchor rather than each having to swallow its own click.
  return (
    <Card
      padding={0}
      border="none"
      elevation={5}
      height="100%"
      backgroundColor="var(--surface-1)"
      className="zoom-on-hover"
      styles={{ position: "relative" }}
    >
      <Box
        width="100%"
        backgroundColor="var(--surface-3, #e5e7eb)"
        flex="0 0 auto"
        styles={{
          // Portrait 4:5, the frame the detail-page gallery uses - a catalog
          // photograph is nearly always taller than it is wide. A compact card
          // squares it instead: in a narrow column the tall frame is most of
          // the card's height, and the name and price it exists to sell get
          // pushed off the bottom of whatever the card sits beside.
          position: "relative",
          aspectRatio: compact ? "1 / 1" : "4 / 5",
          overflow: "hidden",
        }}
      >
        {/* The photo is one half of the link to the item. It fills the frame as
            its own anchor, so the badges and the admin button remain siblings
            rather than links nested inside a link. */}
        <Box
          href={href}
          prefetch
          aria-label={name}
          backgroundColor={
            hasImage
              ? undefined
              : (data.background_color ?? "var(--surface-3, #e5e7eb)")
          }
          styles={{ position: "absolute", inset: 0 }}
        >
          {hasImage && (
            <Image
              fill
              src={image!}
              alt={name}
              sizes="(min-width: 1200px) 16vw, (min-width: 600px) 25vw, 50vw"
              style={{ objectFit: "cover" }}
            />
          )}
        </Box>

        {(badge || dietary.length > 0) && (
          <Box
            alignItems="flex-start"
            flexWrap="wrap"
            gap={4}
            // Leave the top-right corner clear when the admin edit button is there.
            maxWidth={isAdmin ? "calc(100% - 60px)" : "calc(100% - 16px)"}
            styles={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
          >
            {/* The caller's chip leads the corner - it says what the card *is*,
                where a dietary flag qualifies it. Painted like a `primary`
                Button: `--accent` (which this app overrides per tenant) under a
                literal white, since `--accent-foreground` is the palette's own
                and the two come apart on a tenant-branded accent. */}
            {badge && (
              <Badge
                variant="filled"
                size="md"
                color="var(--accent, #06b6d4)"
                textColor="#fff"
              >
                {badge}
              </Badge>
            )}

            {dietary.map((d) => (
              <Badge
                key={d.label}
                variant="filled"
                size="md"
                color={d.color}
                textColor="#fff"
              >
                {d.label}
              </Badge>
            ))}
          </Box>
        )}

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
            // Keep clear of the share/heart tab in the opposite corner, the way
            // the dietary row keeps clear of the admin button - a service card
            // carrying both a duration and a discount is wider than half a
            // phone's column, and would otherwise run under it. They wrap
            // upwards instead, since the row is anchored to the bottom.
            maxWidth={compact ? "calc(100% - 16px)" : "calc(100% - 108px)"}
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

        {/* Share and heart, on a tab of the card's own surface bleeding up out
            of the photograph's bottom-right corner (the concave sweep on its
            left is the CSS file's one rule).

            They sit here rather than beside the cart button because they are
            *about the picture* - the thing a customer shares and the thing they
            save is the dish they are looking at - and because the action row
            below now has a quantity to hold as well as its one decision. Three
            circles and a stepper on one line at a card's width read as four
            equal controls, which is what made the primary action invisible the
            last time they shared a row.

            Dropped on a compact card, exactly as they were when they lived in
            the action row: at a third of a column the photograph has no corner
            to spare. */}
        {!compact && (
          <Box
            className="buyable-card__tab"
            alignItems="center"
            gap={6}
            paddingY={6}
            paddingX={8}
            backgroundColor="var(--surface-1)"
            borderRadius="14px 0 0 0"
            styles={{ position: "absolute", bottom: 0, right: 0, zIndex: 2 }}
          >
            <ShareButton
              title={name}
              text={toShareDescription(description)}
              label={tItem("share")}
              copiedLabel={tItem("linkCopied")}
              url={`${origin}${href}`}
              size="sm"
            />
            <FavoriteButton
              kind={kind === "food" ? "menu_item" : kind}
              id={data.id}
              initialFavorite={initialFavorite}
              isLoggedIn={isLoggedIn}
              size="sm"
            />
          </Box>
        )}
      </Box>

      <Box flexDirection="column" gap={6} flex={1} className="card-content">
        {name && (
          <Box
            href={href}
            prefetch
            display="block"
            styles={{ textDecoration: "none" }}
          >
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
          </Box>
        )}

        {!compact && description && (
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
          {/* The price group is its own column so the "from" line sits tight
              against the number it qualifies, rather than at the 8px rhythm
              this column holds between the price, the rule and the actions. */}
          <Box flexDirection="column" gap={2} minWidth={0}>
            {/* "from" is its own line *above* the number rather than a word in
              front of it: the row below is a single unbreakable line (see
              next), and a prefix inside it would be the first thing squeezed
              out of a narrow card - on the one card whose price is only a
              starting point. */}
            {kind === "food" && fromLabel && (
              <Typography
                as="span"
                variant="caption"
                margin={0}
                color="var(--foreground)"
              >
                {fromLabel}
              </Typography>
            )}

            {/* The money price and the points price are one line and stay one
              line: they are two ways to buy the same thing, and wrapped onto
              two rows the "or" reads as a second, separate offer. So nothing
              here wraps, and the points half is the one element allowed to
              shrink - it ellipsises inside a narrow column while the money
              price, which is never negotiable, keeps its full width. */}
            <Box alignItems="baseline" gap={6} flexWrap="nowrap" minWidth={0}>
              <Typography
                as="span"
                variant="h4"
                fontWeight={700}
                color="var(--foreground)"
                flex="0 0 auto"
              >
                {formatPrice(displayPrice, data.currency)}
              </Typography>
              {kind === "service" &&
                perPersonLabel &&
                "booking_party_enabled" in data &&
                data.booking_party_enabled && (
                  <Typography
                    as="span"
                    variant="caption"
                    color="var(--foreground)"
                    flex="0 0 auto"
                  >
                    {perPersonLabel}
                  </Typography>
                )}
              {effectiveCompare &&
                parseFloat(effectiveCompare) > parseFloat(displayPrice) && (
                  <Typography
                    as="span"
                    variant="label"
                    fontWeight={400}
                    color="var(--foreground)"
                    flex="0 0 auto"
                    // 11px sub-scale: compare price sits below the label (12px) tier
                    styles={{ fontSize: 11, textDecoration: "line-through" }}
                  >
                    {formatPrice(effectiveCompare, data.currency)}
                  </Typography>
                )}
              {/* The points price, beside the money one - "MX$120 or 1200
                points". It is the item's own `points_price`, not a conversion
                of the price to its left: points are priced per item, so there
                is no rate to convert at, and the two numbers are two
                independent ways to buy the same thing - which is what the "or"
                says out loud, and why it is set in the price's own face rather
                than as a caption hanging off it. Absent whenever the item
                cannot be redeemed, which is every item on a tenant not running
                the program - so nothing on the card moved for them. */}
              {rewardsEnabled && data.points_price ? (
                <Typography
                  as="span"
                  variant="h4"
                  fontWeight={700}
                  color="var(--accent)"
                  flex="0 1 auto"
                  minWidth={0}
                  styles={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tCart("orPointsPrice", { points: data.points_price })}
                </Typography>
              ) : null}
            </Box>
          </Box>

          {/* Divider. A 1px filled Box rather than a border, so the rule is
              expressed in props; `flex` keeps the column from collapsing it. */}
          <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

          <BuyableCardActions
            compact={compact}
            kind={kind}
            id={data.id}
            isLoggedIn={isLoggedIn}
            cartLineId={cartLineId}
            inStock={inStock}
            bookingSlug={bookingSlug}
            // Only a food card can be configured, and only its live ingredients
            // are offered - a disabled row is an admin's "not right now".
            customize={
              item.kind === "food"
                ? {
                    name,
                    price: effectivePrice,
                    currency: data.currency,
                    ingredients: enabledIngredients(item.data.ingredients),
                    sizes: item.data.sizes,
                    locale,
                  }
                : undefined
            }
          />
        </Box>
      </Box>
    </Card>
  );
}
