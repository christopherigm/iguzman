import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { ProductDetail, ProductVariantFull } from "@/lib/catalog";
import { VariantSelectorClient } from "./variant-selector-client";
import { FavoriteButtonClient } from "./favorite-button-client";
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

function discountPercent(price: string, comparePrice: string): number {
  const p = parseFloat(price);
  const cp = parseFloat(comparePrice);
  if (cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}

interface ProductDetailProps {
  product: ProductDetail;
  selectedVariant: ProductVariantFull | null;
  locale: string;
}

export async function ProductDetailPanel({
  product,
  selectedVariant,
  locale,
}: ProductDetailProps) {
  const t = await getTranslations("ItemDetail");

  const name =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    "";

  const description =
    (locale === "en" ? product.en_description : product.description) ??
    product.description ??
    product.en_description ??
    "";

  const effectivePrice = selectedVariant?.effective_price ?? product.price;
  const effectiveCompare =
    selectedVariant?.effective_compare_price ?? product.compare_price;

  const discount = effectiveCompare
    ? discountPercent(effectivePrice, effectiveCompare)
    : 0;

  const inStock = selectedVariant?.in_stock ?? product.in_stock;
  const stockCount = selectedVariant?.stock_count ?? product.stock_count;

  // Dimensions (prefer variant override, fallback to product)
  const length = selectedVariant?.length ?? product.length;
  const width = selectedVariant?.width ?? product.width;
  const height = selectedVariant?.height ?? product.height;
  const weight = selectedVariant?.weight ?? product.weight;
  const hasDimensions = length || width || height || weight;

  return (
    <Box flexDirection="column" gap={20} paddingY={4}>
      {/* Name */}
      {name && (
        <Typography as="h1" variant="h3" styles={{ lineHeight: 1.25 }}>
          {name}
        </Typography>
      )}

      {/* Meta: brand / category */}
      {(product.brand_name || product.category_name) && (
        <Box flexWrap="wrap" gap="8px 20px">
          {product.brand_name && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {t("brand")}: <strong>{product.brand_name}</strong>
            </Typography>
          )}
          {product.category_name && (
            <Typography
              as="span"
              variant="caption"
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {t("category")}: <strong>{product.category_name}</strong>
            </Typography>
          )}
        </Box>
      )}

      {/* Pricing */}
      <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
        <Typography as="span" variant="none" className="item-price">
          {formatPrice(effectivePrice, product.currency)}
        </Typography>
        {effectiveCompare &&
          parseFloat(effectiveCompare) > parseFloat(effectivePrice) && (
            <Typography as="span" variant="none" className="item-compare-price">
              {formatPrice(effectiveCompare, product.currency)}
            </Typography>
          )}
        {discount > 0 && (
          <Badge variant="filled" color="#ef4444" textColor="#fff">
            -{discount}%
          </Badge>
        )}
      </Box>

      {/* Stock status */}
      <Box alignItems="center" gap={8} flexWrap="wrap">
        <Typography
          as="span"
          variant="none"
          className={inStock ? "item-stock-in" : "item-stock-out"}
        >
          {inStock ? t("inStock") : t("outOfStock")}
        </Typography>
        {inStock && stockCount !== null && stockCount <= 10 && (
          <Typography
            as="span"
            variant="caption"
            color="color-mix(in srgb, var(--foreground) 55%, transparent)"
          >
            {t("stockCount", { count: stockCount })}
          </Typography>
        )}
      </Box>

      {/* SKU */}
      {(selectedVariant?.sku ?? product.sku) && (
        <Typography
          as="span"
          variant="caption"
          color="color-mix(in srgb, var(--foreground) 45%, transparent)"
        >
          {t("sku")}: {selectedVariant?.sku ?? product.sku}
        </Typography>
      )}

      {/* Variant selector */}
      {product.variants.length > 0 && (
        <VariantSelectorClient
          variants={product.variants}
          selectedVariantId={selectedVariant?.id ?? null}
          locale={locale}
        />
      )}

      {/* Actions */}
      <Box alignItems="flex-end" gap={10}>
        <ActionButtonsClient
          addToCartLabel={t("addToCart")}
          buyNowLabel={t("buyNow")}
        />
        <FavoriteButtonClient label={t("addToFavorites")} />
      </Box>

      {/* Description */}
      {description && (
        <Box
          flexDirection="column"
          paddingTop={8}
          styles={{
            borderTop:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
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
      )}

      {/* Specifications */}
      <Box
        flexDirection="column"
        paddingTop={8}
        styles={{
          borderTop:
            "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
        }}
      >
        <Typography as="h2" variant="none" className="item-section-heading">
          {t("specifications")}
        </Typography>
        <table className="item-specs-table">
          <tbody>
            {product.brand_name && (
              <tr>
                <td>{t("brand")}</td>
                <td>{product.brand_name}</td>
              </tr>
            )}
            {product.category_name && (
              <tr>
                <td>{t("category")}</td>
                <td>{product.category_name}</td>
              </tr>
            )}
            {(selectedVariant?.sku ?? product.sku) && (
              <tr>
                <td>{t("sku")}</td>
                <td>{selectedVariant?.sku ?? product.sku}</td>
              </tr>
            )}
            {(selectedVariant?.barcode ?? product.barcode) && (
              <tr>
                <td>{t("barcode")}</td>
                <td>{selectedVariant?.barcode ?? product.barcode}</td>
              </tr>
            )}
            {product.currency && (
              <tr>
                <td>{t("currency")}</td>
                <td>{product.currency}</td>
              </tr>
            )}
            {stockCount !== null && (
              <tr>
                <td>{t("stockCount2")}</td>
                <td>{stockCount}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Physical dimensions */}
      {hasDimensions && (
        <Box
          flexDirection="column"
          paddingTop={8}
          styles={{
            borderTop:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("physicalDetails")}
          </Typography>
          <table className="item-specs-table">
            <tbody>
              {weight && (
                <tr>
                  <td>{t("weight")}</td>
                  <td>
                    {weight} {product.weight_unit ?? ""}
                  </td>
                </tr>
              )}
              {(length || width || height) && (
                <tr>
                  <td>{t("dimensions")}</td>
                  <td>
                    {[length, width, height].filter(Boolean).join(" × ")}{" "}
                    {product.dimension_unit ?? ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      )}
    </Box>
  );
}
