import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { ProductDetail } from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { AddToCartButton } from "./add-to-cart-button";
import { BuyNowButton } from "./buy-now-button";
import { FavoriteButton } from "./favorite-button";
import { AdminEditButton } from "./admin-edit-button";
import { VariantThumbs } from "./variant-thumbs";
import { ContactFormClient } from "./contact/contact-form-client";

interface ProductDetailProps {
  product: ProductDetail;
  locale: string;
}

/**
 * Full-width page header for a product: the name plus its share / favorite
 * actions and the brand / category meta. Rendered above the gallery-and-buy-box
 * grid so it spans both columns.
 */
export async function ProductDetailHeader({
  product,
  locale,
}: ProductDetailProps) {
  const [t, tAdmin, session, favorite] = await Promise.all([
    getTranslations("ItemDetail"),
    getTranslations("Admin"),
    getSession(),
    isFavorite("product", product.id),
  ]);

  const name =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    "";

  const shareText =
    (locale === "en" ? product.en_description : product.description) ??
    product.description ??
    product.en_description ??
    "";

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
          {session?.isAdmin && (
            <AdminEditButton
              href={`/admin/products/${product.id}`}
              label={tAdmin("edit")}
              size="md"
            />
          )}
          <ShareButton
            title={name}
            text={toShareDescription(shareText)}
            label={t("share")}
            copiedLabel={t("linkCopied")}
            size="md"
          />
          <FavoriteButton
            kind="product"
            id={product.id}
            initialFavorite={favorite}
            isLoggedIn={session !== null}
            size="md"
          />
        </Box>
      </Box>

      {/* Meta: brand / category */}
      {(product.brand_name || product.category_name) && (
        <Box flexWrap="wrap" gap="8px 20px">
          {product.brand_name && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("brand")}: <strong>{product.brand_name}</strong>
            </Typography>
          )}
          {product.category_name && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("category")}: <strong>{product.category_name}</strong>
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export async function ProductDetailPanel({
  product,
  locale,
}: ProductDetailProps) {
  // A sibling variant is its own Product with its own page, so this only ever
  // looks up the line for the product actually being viewed.
  const [t, session, cartLineId] = await Promise.all([
    getTranslations("ItemDetail"),
    getSession(),
    findCartLineId("product", product.id),
  ]);

  const displayName =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    product.slug;

  const discount = product.compare_price
    ? discountPercent(product.price, product.compare_price)
    : 0;

  const { in_stock: inStock, stock_count: stockCount } = product;
  const hasDimensions =
    product.length || product.width || product.height || product.weight;

  return (
    <Box flexDirection="column" gap={18}>
      {/* Buy box: price, stock, variants and CTAs grouped as one unit */}
      <Card gap={18}>
        {/* Pricing */}
        <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
          <Typography as="span" variant="none" className="item-price">
            {formatPrice(product.price, product.currency)}
          </Typography>
          {product.compare_price &&
            parseFloat(product.compare_price) > parseFloat(product.price) && (
              <Typography
                as="span"
                variant="none"
                className="item-compare-price"
              >
                {formatPrice(product.compare_price, product.currency)}
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
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("stockCount", { count: stockCount })}
            </Typography>
          )}
        </Box>

        {/* SKU */}
        {product.sku && (
          <Typography as="span" variant="caption" color="var(--foreground)">
            {t("sku")}: {product.sku}
          </Typography>
        )}

        {/* Sibling variants - each its own product page. */}
        {product.variants.length > 0 && (
          <VariantThumbs
            basePath="/products"
            current={{
              slug: product.slug,
              name: displayName,
              image: product.image,
            }}
            variants={product.variants}
            locale={locale}
          />
        )}

        {/* Actions: secondary + primary CTAs share the width, wrapping on very
            narrow widths so the buttons never get crushed. */}
        <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
          <AddToCartButton
            kind="product"
            id={product.id}
            cartLineId={cartLineId}
            isLoggedIn={session !== null}
            disabled={!inStock}
            display="button"
            buttonKind="warning"
            size="lg"
            flex="1"
            minWidth={140}
          />
          <BuyNowButton
            kind="product"
            id={product.id}
            isLoggedIn={session !== null}
            disabled={!inStock}
            text={t("buyNow")}
            size="lg"
            flex="1"
            minWidth={140}
          />
        </Box>
      </Card>

      {/* Specifications spec table */}
      <Card>
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
            {product.sku && (
              <tr>
                <td>{t("sku")}</td>
                <td>{product.sku}</td>
              </tr>
            )}
            {product.barcode && (
              <tr>
                <td>{t("barcode")}</td>
                <td>{product.barcode}</td>
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
      </Card>

      {/* Physical dimensions spec table */}
      {hasDimensions && (
        <Card>
          <Typography as="h2" variant="none" className="item-section-heading">
            {t("physicalDetails")}
          </Typography>
          <table className="item-specs-table">
            <tbody>
              {product.weight && (
                <tr>
                  <td>{t("weight")}</td>
                  <td>
                    {product.weight} {product.weight_unit ?? ""}
                  </td>
                </tr>
              )}
              {(product.length || product.width || product.height) && (
                <tr>
                  <td>{t("dimensions")}</td>
                  <td>
                    {[product.length, product.width, product.height]
                      .filter(Boolean)
                      .join(" × ")}{" "}
                    {product.dimension_unit ?? ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </Box>
  );
}

/**
 * Full-width long-form content for the product detail page: the description,
 * shown below the buy box across the whole page width.
 */
export async function ProductDetailSections({
  product,
  locale,
}: ProductDetailProps) {
  const t = await getTranslations("ItemDetail");

  const description =
    (locale === "en" ? product.en_description : product.description) ??
    product.description ??
    product.en_description ??
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

/**
 * "Ask a question about this product" - the shared contact form, embedded on the
 * detail page and pre-tagged with this product so the message lands in the inbox
 * with its context. Rendered full-width below the description.
 */
export async function ProductDetailQuestion({
  product,
  locale,
}: ProductDetailProps) {
  const t = await getTranslations("Contact");

  const name =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    "";

  return (
    <Card width="100%">
      <ContactFormClient
        heading={t("askAboutHeading")}
        description={t("askAboutDescription")}
        related={{ kind: "product", id: product.id, name }}
      />
    </Card>
  );
}
