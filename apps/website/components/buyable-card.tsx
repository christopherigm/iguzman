import Image from 'next/image';
import Link from 'next/link';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Badge } from '@repo/ui/core-elements/badge';
import type { FeaturedProduct, FeaturedService, BuyableVariant } from '@/lib/catalog';
import './buyable-card.css';

export type BuyableItem =
  | { kind: 'product'; data: FeaturedProduct }
  | { kind: 'service'; data: FeaturedService };

function formatPrice(amount: string, currency: string): string {
  const num = parseFloat(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
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

function defaultVariant(variants: BuyableVariant[]): BuyableVariant | undefined {
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
    (locale === 'en' ? data.en_name : data.name) ??
    data.name ??
    data.en_name ??
    '';

  const description =
    (locale === 'en' ? data.en_description : data.description) ??
    data.description ??
    data.en_description ??
    '';

  const href =
    kind === 'product' ? `/products/${data.slug}` : `/services/${data.slug}`;

  const variant = defaultVariant(data.variants);
  const effectivePrice = variant?.effective_price ?? data.price;
  const effectiveCompare = variant?.effective_compare_price ?? data.compare_price;
  const image = variant?.effective_image ?? data.image;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const hasImage = Boolean(image);

  const modality =
    kind === 'service' ? (data as FeaturedService).modality : null;
  const duration =
    kind === 'service' ? (data as FeaturedService).duration : null;
  const variantCount = data.variants.length;

  return (
    <Link
      href={href}
      prefetch
      className={`buyable-card elevation-5 zoom-on-hover${hasImage ? ' buyable-card--has-image' : ''}`}
    >
      <Box className="buyable-card__image-wrap">
        {hasImage ? (
          <Image
            fill
            className="buyable-card__image"
            src={image!}
            alt={name}
            sizes="(min-width: 1200px) 16vw, (min-width: 600px) 25vw, 50vw"
          />
        ) : (
          <Box
            className="buyable-card__placeholder"
            styles={{ backgroundColor: data.background_color ?? undefined }}
          />
        )}

        {duration != null && (
          <Typography as="span" variant="none" className="buyable-card__duration">
            {duration >= 60
              ? `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}`
              : `${duration}m`}
          </Typography>
        )}

        <Box className="buyable-card__badges">
          <Badge
            variant="filled"
            size="sm"
            color={
              kind === 'product'
                ? 'rgba(255,255,255,0.15)'
                : 'rgba(99,102,241,0.8)'
            }
            textColor="#fff"
          >
            {kind === 'product' ? productLabel : serviceLabel}
          </Badge>

          {discount > 0 && (
            <Badge variant="filled" size="sm" color="#ef4444" textColor="#fff">
              -{discount}%
            </Badge>
          )}
        </Box>
      </Box>

      <Box className="buyable-card__body card-content">
        {name && (
          <Typography as="h3" variant="h5" className="buyable-card__name">
            {name}
          </Typography>
        )}

        {description && (
          <Typography variant="none" className="buyable-card__description">
            {description}
          </Typography>
        )}

        <Box className="buyable-card__footer">
          <Box className="buyable-card__pricing">
            <Typography as="span" variant="none" className="buyable-card__price">
              {formatPrice(effectivePrice, data.currency)}
            </Typography>
            {effectiveCompare &&
              parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
                <Typography
                  as="span"
                  variant="none"
                  className="buyable-card__compare-price"
                >
                  {formatPrice(effectiveCompare, data.currency)}
                </Typography>
              )}
          </Box>

          {modality && (
            <Typography as="span" variant="none" className="buyable-card__meta">
              {modality}
            </Typography>
          )}
          {!modality && variantCount > 1 && (
            <Typography as="span" variant="none" className="buyable-card__meta">
              {variantCount} variants
            </Typography>
          )}
        </Box>
      </Box>
    </Link>
  );
}
