import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ShareButton } from "@repo/ui/core-elements/share-button";
import { getSession } from "@repo/auth/session";
import type { ServiceDetail } from "@/lib/catalog";
import { getBranches } from "@/lib/branches";
import { findCartLineId } from "@/lib/cart";
import { isFavorite } from "@/lib/favorites";
import { toShareDescription } from "@/lib/metadata";
import { formatPrice, discountPercent } from "@/lib/price";
import { AddToCartButton } from "./add-to-cart-button";
import { BuyNowButton } from "./buy-now-button";
import { FavoriteButton } from "./favorite-button";
import { AdminEditButton } from "./admin-edit-button";
import { ServiceBookingCta } from "./service-booking-cta";
import { VariantThumbs } from "./variant-thumbs";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface ServiceDetailProps {
  service: ServiceDetail;
  locale: string;
}

/**
 * Full-width page header for a service: the name plus its share / favorite
 * actions, the brand / category meta and the duration / modality badges.
 * Rendered above the gallery-and-buy-box grid so it spans both columns.
 */
export async function ServiceDetailHeader({
  service,
  locale,
}: ServiceDetailProps) {
  const [t, tAdmin, session, favorite] = await Promise.all([
    getTranslations("ItemDetail"),
    getTranslations("Admin"),
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

  const effectiveDuration = service.duration;
  const effectiveModality = service.modality;

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
          {session?.isAdmin && (
            <AdminEditButton
              href={`/admin/services/${service.id}`}
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

/**
 * The sibling-variants card body (no grid wrapper) - each variant is its own
 * service page. Reused in the two responsive placements below: a full-width
 * cell above the gallery on xs, and stacked above the buy box from sm up.
 */
async function ServiceVariantsCard({ service, locale }: ServiceDetailProps) {
  const t = await getTranslations("ItemDetail");

  const displayName =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    service.slug;

  return (
    <Card width="100%">
      <Typography as="h2" variant="none" className="item-section-heading">
        {t("variants")}
      </Typography>
      <VariantThumbs
        hrefFor={(v) => `/services/${v.slug}`}
        current={{
          slug: service.slug,
          name: displayName,
          image: service.image,
          href: `/services/${service.slug}`,
        }}
        variants={service.variants}
        locale={locale}
      />
    </Card>
  );
}

/**
 * Mobile placement of the variants card: a full-width grid cell rendered above
 * the gallery, visible in the xs band only. From sm up the variants instead sit
 * inside the buy-box column (see ServiceDetailPanel), so this cell hides there.
 * Renders nothing when the service has no siblings.
 */
export async function ServiceDetailVariantsMobile({
  service,
  locale,
}: ServiceDetailProps) {
  if (service.variants.length === 0) return null;

  return (
    <Grid size={{ xs: 12 }} hidden={{ sm: true, md: true, lg: true, xl: true }}>
      <ServiceVariantsCard service={service} locale={locale} />
    </Grid>
  );
}

export async function ServiceDetailPanel({
  service,
  locale,
}: ServiceDetailProps) {
  const [t, session, cartLineId, branches] = await Promise.all([
    getTranslations("ItemDetail"),
    getSession(),
    findCartLineId("service", service.id),
    // Only needed to name the locations in the booking picker. Fetched
    // unconditionally because it is `cache()`d per request and the contact
    // footer usually asks for it anyway.
    getBranches(),
  ]);

  // An empty `booking_branches` means "every branch", not "no branch" - see
  // `branches_for` in website-api. A tenant with no Branch rows at all is the
  // home business: no picker, and the booking carries no branch.
  const bookingBranches = branches
    .filter(
      (branch) =>
        service.booking_branches.length === 0 ||
        service.booking_branches.includes(branch.id),
    )
    .map((branch) => ({
      id: branch.id,
      name:
        (locale === "en" ? branch.en_name : branch.name) ??
        branch.name ??
        branch.en_name ??
        "",
    }));

  const discount = service.compare_price
    ? discountPercent(service.price, service.compare_price)
    : 0;

  const effectiveDuration = service.duration;
  const effectiveModality = service.modality;

  const modalityLabels: Record<string, string> = {
    online: t("modalityOnline"),
    in_person: t("modalityInPerson"),
    hybrid: t("modalityHybrid"),
  };

  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <Box flexDirection="column" gap={18}>
        {/* Variants above the buy box - from sm up only; on xs they render
            above the gallery instead (ServiceDetailVariantsMobile). The bare
            `hidden` wrapper (no size/item) stays a plain full-width block in
            this column flex - it only toggles display per breakpoint. */}
        {service.variants.length > 0 && (
          <Grid hidden={{ xs: true }}>
            <ServiceVariantsCard service={service} locale={locale} />
          </Grid>
        )}
        {/* Buy box: price and CTAs grouped as one unit */}
        <Card gap={18}>
          {/* Pricing */}
          <Box alignItems="baseline" flexWrap="wrap" gap="8px 12px">
            <Typography as="span" variant="none" className="item-price">
              {formatPrice(service.price, service.currency)}
            </Typography>
            {service.compare_price &&
              parseFloat(service.compare_price) > parseFloat(service.price) && (
                <Typography
                  as="span"
                  variant="none"
                  className="item-compare-price"
                >
                  {formatPrice(service.compare_price, service.currency)}
                </Typography>
              )}
            {discount > 0 && (
              <Badge variant="filled" color="#ef4444" textColor="#fff">
                -{discount}%
              </Badge>
            )}
          </Box>

          {/* SKU */}
          {service.sku && (
            <Typography as="span" variant="caption" color="var(--foreground)">
              {t("sku")}: {service.sku}
            </Typography>
          )}

          {/* Actions. A bookable service is sold as an appointment, so the two
            cart CTAs are replaced outright rather than joined - a specific hour
            at a specific place is not something a cart line can hold. */}
          {service.booking_enabled ? (
            <ServiceBookingCta
              slug={service.slug}
              fulfillmentOptions={service.booking_fulfillment_options}
              branches={bookingBranches}
            />
          ) : (
            /* Secondary + primary CTAs share the width, wrapping on very narrow
              widths so the buttons never get crushed. */
            <Box alignItems="center" gap={10} width="100%" flexWrap="wrap">
              <AddToCartButton
                kind="service"
                id={service.id}
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
                isLoggedIn={session !== null}
                text={t("buyNow")}
                size="lg"
                flex="1"
                minWidth={140}
              />
            </Box>
          )}
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
              {service.sku && (
                <tr>
                  <td>{t("sku")}</td>
                  <td>{service.sku}</td>
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
    </Grid>
  );
}

/**
 * Full-width long-form content for the service detail page: the "About this
 * item" description, its own size-12 cell spanning the whole detail grid.
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
