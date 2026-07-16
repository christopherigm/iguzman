import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { getSession } from "@repo/auth/session";
import type {
  FeaturedProduct,
  FeaturedService,
  BuyableVariant,
} from "@/lib/catalog";
import { isFavorite } from "@/lib/favorites";
import { getRequestOrigin, toShareDescription } from "@/lib/metadata";
import { BuyableCardActions } from "./buyable-card-actions";

export type BuyableItem =
  | { kind: "product"; data: FeaturedProduct }
  | { kind: "service"; data: FeaturedService };

function formatPrice(amount: string, currency: string): string {
  const num = parseFloat(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function discountPercent(price: string, comparePrice: string): number {
  const p = parseFloat(price);
  const cp = parseFloat(comparePrice);
  if (cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}

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
}: {
  item: BuyableItem;
  locale: string;
  productLabel: string;
  serviceLabel: string;
}) {
  const { kind, data } = item;

  // The heart rides on every card, wherever the card is rendered, so it resolves
  // its own state instead of making each grid thread it down. Both reads are
  // `cache()`d per request: a grid of N cards costs one session decode and one
  // ids fetch between them, and an anonymous visitor costs no fetch at all. A
  // logged-out heart is still rendered - clicking it routes to /auth.
  const [session, favorite, origin] = await Promise.all([
    getSession(),
    isFavorite(kind, data.id),
    getRequestOrigin(),
  ]);

  const name =
    (locale === "en" ? data.en_name : data.name) ??
    data.name ??
    data.en_name ??
    "";

  const description =
    (locale === "en" ? data.en_description : data.description) ??
    data.description ??
    data.en_description ??
    "";

  const href =
    kind === "product" ? `/products/${data.slug}` : `/services/${data.slug}`;

  const variant = defaultVariant(data.variants);
  const effectivePrice = variant?.effective_price ?? data.price;
  const effectiveCompare =
    variant?.effective_compare_price ?? data.compare_price;
  const image = variant?.effective_image ?? data.image;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const hasImage = Boolean(image);

  const duration =
    kind === "service" ? (data as FeaturedService).duration : null;

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
              ? "rgba(255,255,255,0.15)"
              : "rgba(99,102,241,0.8)"
          }
          textColor="#fff"
          style={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
        >
          {kind === "product" ? productLabel : serviceLabel}
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
        )}

        {description && (
          <Typography
            variant="caption"
            margin={0}
            color="var(--on-surface-muted, rgba(0, 0, 0, 0.55))"
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
            <Typography
              as="span"
              variant="h6"
              fontWeight={700}
              color="var(--on-surface)"
            >
              {formatPrice(effectivePrice, data.currency)}
            </Typography>
            {effectiveCompare &&
              parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
                <Typography
                  as="span"
                  variant="label"
                  fontWeight={400}
                  color="var(--on-surface-muted, rgba(0, 0, 0, 0.45))"
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
          />
        </Box>
      </Box>
    </Card>
  );
}
