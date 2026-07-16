import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { ServiceDetail, ServiceVariantFull } from "@/lib/catalog";
import { VariantSelectorClient } from "./variant-selector-client";
import { ActionButtonsClient } from "./action-buttons-client";

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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function discountPercent(price: string, comparePrice: string): number {
  const p = parseFloat(price);
  const cp = parseFloat(comparePrice);
  if (cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}

interface ServiceDetailProps {
  service: ServiceDetail;
  selectedVariant: ServiceVariantFull | null;
  locale: string;
}

export async function ServiceDetailPanel({
  service,
  selectedVariant,
  locale,
}: ServiceDetailProps) {
  const t = await getTranslations("ItemDetail");

  const name =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    "";

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
    <Box flexDirection="column" gap={20} paddingY={4}>
      {/* Name */}
      {name && (
        <Typography as="h1" variant="h3" styles={{ lineHeight: 1.25 }}>
          {name}
        </Typography>
      )}

      {/* Meta: brand / category */}
      {(service.brand_name || service.category_name) && (
        <Box flexWrap="wrap" gap="8px 20px">
          {service.brand_name && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {t("brand")}: <strong>{service.brand_name}</strong>
            </Typography>
          )}
          {service.category_name && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {t("category")}: <strong>{service.category_name}</strong>
            </Typography>
          )}
        </Box>
      )}

      {/* Service badges: duration + modality */}
      {(effectiveDuration || effectiveModality) && (
        <Box flexWrap="wrap" gap={8}>
          {effectiveDuration && (
            <Badge
              variant="subtle"
              color="var(--accent)"
              style={{
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 8,
                border:
                  "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            >
              ⏱ {formatDuration(effectiveDuration)}
            </Badge>
          )}
          {effectiveModality && (
            <Badge
              variant="subtle"
              color="var(--accent)"
              style={{
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 8,
                border:
                  "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              }}
            >
              {modalityLabels[effectiveModality] ?? effectiveModality}
            </Badge>
          )}
        </Box>
      )}

      {/* Buy box: price, variant selector and CTAs grouped as one unit */}
      <Card gap={18} padding={20}>
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
          <Typography
            as="span"
            variant="caption"
            color="color-mix(in srgb, var(--foreground) 45%, transparent)"
          >
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

        {/* Actions */}
        <ActionButtonsClient
          addToCartLabel={t("addToCart")}
          buyNowLabel={t("buyNow")}
          favoriteLabel={t("addToFavorites")}
        />
      </Card>
    </Box>
  );
}

/**
 * Full-width long-form content for the service detail page: the description and
 * the service-details spec table, laid out side by side below the buy box so
 * neither column of the page is left empty.
 */
export async function ServiceDetailSections({
  service,
  selectedVariant,
  locale,
}: ServiceDetailProps) {
  const t = await getTranslations("ItemDetail");

  const description =
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
    <Grid container spacing={4}>
      {/* Description */}
      {description && (
        <Grid size={{ xs: 12, md: 7 }}>
          <Box flexDirection="column" maxWidth="68ch">
            <Typography as="h2" variant="none" className="item-section-heading">
              {t("description")}
            </Typography>
            <Typography
              variant="body"
              color="color-mix(in srgb, var(--foreground) 80%, transparent)"
              styles={{ lineHeight: 1.7, whiteSpace: "pre-line" }}
            >
              {description}
            </Typography>
          </Box>
        </Grid>
      )}

      {/* Service details */}
      <Grid size={{ xs: 12, md: 5 }}>
        <Box flexDirection="column">
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
        </Box>
      </Grid>
    </Grid>
  );
}
