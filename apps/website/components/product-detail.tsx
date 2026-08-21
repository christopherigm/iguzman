import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { ProductDetail } from "@/lib/catalog";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { getSystem } from "@/lib/system";
import { ItemBuyActions } from "./item-buy-actions";
import { FavoriteButton } from "./favorite-button";
import { AdminEditButton } from "./admin-edit-button";
import { VariantThumbs } from "./variant-thumbs";

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

/**
 * The sibling-variants card body (no grid wrapper) - each variant is its own
 * product page. Reused in the two responsive placements below: a full-width
 * cell above the gallery on xs, and stacked above the buy box from sm up.
 */
async function ProductVariantsCard({ product, locale }: ProductDetailProps) {
  const t = await getTranslations("ItemDetail");

  const displayName =
    (locale === "en" ? product.en_name : product.name) ??
    product.name ??
    product.en_name ??
    product.slug;

  return (
    <Card width="100%">
      <Typography as="h2" variant="none" className="item-section-heading">
        {t("variants")}
      </Typography>
      <VariantThumbs
        hrefFor={(v) => `/products/${v.slug}`}
        current={{
          slug: product.slug,
          name: displayName,
          image: product.image,
          href: `/products/${product.slug}`,
        }}
        variants={product.variants}
        locale={locale}
      />
    </Card>
  );
}

/**
 * Mobile placement of the variants card: a full-width grid cell rendered above
 * the gallery, visible in the xs band only. From sm up the variants instead sit
 * inside the buy-box column (see ProductDetailPanel), so this cell hides there.
 * Renders nothing when the product has no siblings.
 */
export async function ProductDetailVariantsMobile({
  product,
  locale,
}: ProductDetailProps) {
  if (product.variants.length === 0) return null;

  return (
    <Grid size={{ xs: 12 }} hidden={{ sm: true, md: true, lg: true, xl: true }}>
      <ProductVariantsCard product={product} locale={locale} />
    </Grid>
  );
}

export async function ProductDetailPanel({
  product,
  locale,
}: ProductDetailProps) {
  const [t, tCart, session, cartLineId, system] = await Promise.all([
    getTranslations("ItemDetail"),
    // Only for the points price beside the money one - the same phrasing the
    // catalog card prints, from the same namespace, so an item reads the same
    // on the grid it was clicked from and on the page it opens.
    getTranslations("Cart"),
    getSession(),
    findCartLineId("product", product.id),
    // The global rewards switch. `getSystem` is `cache()`d per request and the
    // layout has already asked for it on every page.
    getSystem(),
  ]);

  const discount = product.compare_price
    ? discountPercent(product.price, product.compare_price)
    : 0;

  const { in_stock: inStock, stock_count: stockCount } = product;
  const hasDimensions =
    product.length || product.width || product.height || product.weight;

  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Box flexDirection="column" gap={18}>
        {/* Variants above the buy box - from sm up only; on xs they render
            above the gallery instead (ProductDetailVariantsMobile). The bare
            `hidden` wrapper (no size/item) stays a plain full-width block in
            this column flex - it only toggles display per breakpoint. */}
        {product.variants.length > 0 && (
          <Grid hidden={{ xs: true }}>
            <ProductVariantsCard product={product} locale={locale} />
          </Grid>
        )}
        {/* Buy box: price, stock and CTAs grouped as one unit */}
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
            {/* The points price, beside the money one - "MX$120 or 1200
              points". It is the item's own `points_price`, not a conversion of
              the figure to its left: points are priced per item, so there is no
              rate to convert at, and the two numbers are two independent ways
              to buy the same thing. Absent whenever the item cannot be
              redeemed, which is every item on a tenant not running the program
              - so nothing on the page moved for them. It trails the compare
              price and its discount chip, which belong to the money price
              between them. */}
            {system?.rewards_enabled && product.points_price ? (
              <Typography
                as="span"
                variant="none"
                className="item-points-price"
              >
                {tCart("orPointsPrice", { points: product.points_price })}
              </Typography>
            ) : null}
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

          {/* Actions: how many and "add to cart" on one row, "buy now" beneath
            them. See `ItemBuyActions`. */}
          <ItemBuyActions
            kind="product"
            id={product.id}
            cartLineId={cartLineId}
            isLoggedIn={session !== null}
            inStock={inStock}
            buyNowText={t("buyNow")}
          />
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
    </Grid>
  );
}

/**
 * Full-width long-form content for the product detail page: the "About this
 * item" description, its own size-12 cell spanning the whole detail grid.
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
    <Grid size={{ xs: 12 }}>
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
    </Grid>
  );
}
