import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type {
  FeaturedProduct,
  FeaturedService,
  BuyableVariant,
} from "@/lib/catalog";

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

export function BuyableCard({
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

  const modality =
    kind === "service" ? (data as FeaturedService).modality : null;
  const duration =
    kind === "service" ? (data as FeaturedService).duration : null;
  const variantCount = data.variants.length;

  return (
    <Card
      href={href}
      prefetch
      padding={0}
      border="none"
      borderRadius={8}
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

        {duration != null && (
          <Badge
            variant="filled"
            size="sm"
            color="rgba(0,0,0,0.6)"
            textColor="#fff"
            style={{ position: "absolute", bottom: 8, left: 8, zIndex: 1 }}
          >
            {duration >= 60
              ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ""}`
              : `${duration}m`}
          </Badge>
        )}

        <Box
          flexWrap="wrap"
          gap={4}
          styles={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}
        >
          <Badge
            variant="filled"
            size="sm"
            color={
              kind === "product"
                ? "rgba(255,255,255,0.15)"
                : "rgba(99,102,241,0.8)"
            }
            textColor="#fff"
          >
            {kind === "product" ? productLabel : serviceLabel}
          </Badge>

          {discount > 0 && (
            <Badge variant="filled" size="sm" color="#ef4444" textColor="#fff">
              -{discount}%
            </Badge>
          )}
        </Box>
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

        <Box
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          marginTop="auto"
          paddingTop={4}
        >
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

          {modality && (
            <Typography
              as="span"
              variant="label"
              fontWeight={500}
              textAlign="right"
              color="var(--on-surface-muted, rgba(0, 0, 0, 0.45))"
              // 11px sub-scale metadata, below the label (12px) tier
              styles={{ fontSize: 11, whiteSpace: "nowrap" }}
            >
              {modality}
            </Typography>
          )}
          {!modality && variantCount > 1 && (
            <Typography
              as="span"
              variant="label"
              fontWeight={500}
              textAlign="right"
              color="var(--on-surface-muted, rgba(0, 0, 0, 0.45))"
              // 11px sub-scale metadata, below the label (12px) tier
              styles={{ fontSize: 11, whiteSpace: "nowrap" }}
            >
              {variantCount} variants
            </Typography>
          )}
        </Box>
      </Box>
    </Card>
  );
}
