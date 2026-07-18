import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { ServiceDetail, ServiceVariantFull } from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { AddToCartButton } from "./add-to-cart-button";
import { BuyNowButton } from "./buy-now-button";
import { FavoriteButton } from "./favorite-button";
import { VariantSelectorClient } from "./variant-selector-client";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface ServiceDetailProps {
  service: ServiceDetail;
  selectedVariant: ServiceVariantFull | null;
  locale: string;
}

/**
 * Full-width page header for a service: the name plus its share / favorite
 * actions, the brand / category meta and the duration / modality badges.
 * Rendered above the gallery-and-buy-box grid so it spans both columns.
 */
export async function ServiceDetailHeader({
  service,
  selectedVariant,
  locale,
}: ServiceDetailProps) {
  const [t, session, favorite] = await Promise.all([
    getTranslations("ItemDetail"),
    getSession(),
    isFavorite("service", service.id),
  ]);

  const name =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    "";

  const shareText =
    (locale === "en" ? service.en_description : service.description) ??
    service.description ??
    service.en_description ??
    "";

  const effectiveDuration =
    selectedVariant?.effective_duration ?? service.duration;
  const effectiveModality =
    selectedVariant?.effective_modality ?? service.modality;

  const modalityLabels: Record<string, string> = {
    online: t("modalityOnline"),
    in_person: t("modalityInPerson"),
    hybrid: t("modalityHybrid"),
  };

  return (
    <Box flexDirection="column" gap={8} marginBottom={18}>
      {/* Name + share / favorite actions */}
      <Box alignItems="flex-start" justifyContent="space-between" gap={12}>
        {name && (
          <Typography
            as="h1"
            variant="h2"
            flex="1"
            minWidth={0}
            styles={{ lineHeight: 1.25 }}
          >
            {name}
          </Typography>
        )}
        <Box alignItems="center" gap={8}>
          <ShareButton
            title={name}
            text={toShareDescription(shareText)}
            label={t("share")}
            copiedLabel={t("linkCopied")}
            size="md"
          />
          <FavoriteButton
            kind="service"
            id={service.id}
            initialFavorite={favorite}
            isLoggedIn={session !== null}
            size="md"
          />
        </Box>
      </Box>

      {/* Meta: brand / category */}
      {(service.brand_name || service.category_name) && (
        <Box flexWrap="wrap" gap="8px 20px">
          {service.brand_name && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("brand")}: <strong>{service.brand_name}</strong>
            </Typography>
          )}
          {service.category_name && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("category")}: <strong>{service.category_name}</strong>
            </Typography>
          )}
        </Box>
      )}

      {/* Service badges: duration + modality */}
      {(effectiveDuration || effectiveModality) && (
        <Box flexWrap="wrap" gap={8}>
          {effectiveDuration && (
            <Badge variant="filled" color="var(--accent)" size="lg">
              ⏱ {formatDuration(effectiveDuration)}
            </Badge>
          )}
          {effectiveModality && (
            <Badge variant="filled" color="var(--accent)" size="lg">
              {modalityLabels[effectiveModality] ?? effectiveModality}
            </Badge>
          )}
        </Box>
      )}
    </Box>
  );
}

export async function ServiceDetailPanel({
  service,
  selectedVariant,
  locale,
}: ServiceDetailProps) {
  // Looked up for the *selected* variant - see the note in ProductDetailPanel.
  const [t, session, cartLineId] = await Promise.all([
    getTranslations("ItemDetail"),
    getSession(),
    findCartLineId("service", service.id, selectedVariant?.id ?? null),
  ]);

  const effectivePrice = selectedVariant?.effective_price ?? service.price;
  const effectiveCompare =
    selectedVariant?.effective_compare_price ?? service.compare_price;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const effectiveDuration =
    selectedVariant?.effective_duration ?? service.duration;
  const effectiveModality =
    selectedVariant?.effective_modality ?? service.modality;

  const modalityLabels: Record<string, string> = {
    online: t("modalityOnline"),
    in_person: t("modalityInPerson"),
    hybrid: t("modalityHybrid"),
  };

  return (
    <Box flexDirection="column" gap={18} paddingY={4}>
      {/* Buy box: price, variant selector and CTAs grouped as one unit */}
      <Card gap={18}>
        {/* Pricing */}
        <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
          <Typography as="span" variant="none" className="item-price">
            {formatPrice(effectivePrice, service.currency)}
          </Typography>
          {effectiveCompare &&
            parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
              <Typography
                as="span"
                variant="none"
                className="item-compare-price"
              >
                {formatPrice(effectiveCompare, service.currency)}
              </Typography>
            )}
          {discount > 0 && (
            <Badge variant="filled" color="#ef4444" textColor="#fff">
              -{discount}%
            </Badge>
          )}
        </Box>

        {/* SKU */}
        {(selectedVariant?.sku ?? service.sku) && (
          <Typography as="span" variant="caption" color="var(--foreground)">
            {t("sku")}: {selectedVariant?.sku ?? service.sku}
          </Typography>
        )}

        {/* Variant selector */}
        {service.variants.length > 0 && (
          <VariantSelectorClient
            variants={service.variants}
            selectedVariantId={selectedVariant?.id ?? null}
            locale={locale}
          />
        )}

        {/* Actions: secondary + primary CTAs share the width, wrapping on very
            narrow widths so the buttons never get crushed. */}
        <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
          <AddToCartButton
            kind="service"
            id={service.id}
            variantId={selectedVariant?.id ?? null}
            cartLineId={cartLineId}
            isLoggedIn={session !== null}
            display="button"
            buttonKind="warning"
            size="lg"
            flex="1"
            minWidth={140}
          />
          <BuyNowButton
            kind="service"
            id={service.id}
            variantId={selectedVariant?.id ?? null}
            isLoggedIn={session !== null}
            text={t("buyNow")}
            size="lg"
            flex="1"
            minWidth={140}
          />
        </Box>
      </Card>

      {/* Service details spec table */}
      <Card>
        <Typography as="h2" variant="none" className="item-section-heading">
          {t("serviceDetails")}
        </Typography>
        <table className="item-specs-table">
          <tbody>
            {service.brand_name && (
              <tr>
                <td>{t("brand")}</td>
                <td>{service.brand_name}</td>
              </tr>
            )}
            {service.category_name && (
              <tr>
                <td>{t("category")}</td>
                <td>{service.category_name}</td>
              </tr>
            )}
            {effectiveModality && (
              <tr>
                <td>{t("modality")}</td>
                <td>
                  {modalityLabels[effectiveModality] ?? effectiveModality}
                </td>
              </tr>
            )}
            {effectiveDuration && (
              <tr>
                <td>{t("duration")}</td>
                <td>{formatDuration(effectiveDuration)}</td>
              </tr>
            )}
            {(selectedVariant?.sku ?? service.sku) && (
              <tr>
                <td>{t("sku")}</td>
                <td>{selectedVariant?.sku ?? service.sku}</td>
              </tr>
            )}
            {service.currency && (
              <tr>
                <td>{t("currency")}</td>
                <td>{service.currency}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </Box>
  );
}

/**
 * Full-width long-form content for the service detail page: the description,
 * shown below the buy box across the whole page width.
 */
export async function ServiceDetailSections({
  service,
  locale,
}: ServiceDetailProps) {
  const t = await getTranslations("ItemDetail");

  const description =
    (locale === "en" ? service.en_description : service.description) ??
    service.description ??
    service.en_description ??
    "";

  if (!description) return null;

  return (
    <Card width="100%">
      <Typography as="h2" variant="none" className="item-section-heading">
        {t("description")}
      </Typography>
      <Typography
        variant="body"
        color="var(--foreground)"
        styles={{ lineHeight: 1.7, whiteSpace: "pre-line" }}
      >
        {description}
      </Typography>
    </Card>
  );
}
