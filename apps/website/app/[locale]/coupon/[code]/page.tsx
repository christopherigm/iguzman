import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { getCoupon } from "@/lib/coupons";
import { getSystem } from "@/lib/system";
import { couponValueLabel, hasMinOrder } from "@/lib/coupon-shared";
import { formatPrice } from "@/lib/price";
import { MENU_ALL_PATH, MENU_ICON } from "@/lib/menu-paths";
import { CouponClaim, type CouponDestination } from "./coupon-claim";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const coupon = await getCoupon(code);
  if (!coupon) return {};
  const t = await getTranslations("Coupon");
  return {
    title: `${couponValueLabel(coupon.kind, coupon.value, coupon.currency)} — ${t("title")}`,
    description: coupon.description || undefined,
    // Deliberately not indexed. A coupon page is reached by scanning a code the
    // tenant handed out on purpose; letting a search engine list every live
    // campaign turns a targeted offer into a public discount feed, and leaves
    // expired ones ranking long after the campaign ended.
    robots: { index: false, follow: false },
  };
}

/**
 * Where every coupon QR lands.
 *
 * The visitor has just scanned a poster, a flyer or a receipt and may never have
 * seen this site before. So the page does three things in order: says what the
 * offer is worth, says whether it is still good, and gets them into the catalog
 * with the code already applied.
 *
 * ⚠ **Nothing here decides validity.** `coupon.valid` is the API's verdict,
 * re-derived from the row on every request (the fetcher is deliberately
 * uncached), and it is checked a third time inside checkout. This page reports;
 * it does not judge.
 *
 * An unknown code is a 404. An *expired* one is not: it answers 200 with
 * `valid: false` so this page can say the offer has ended, which is a far better
 * answer for someone holding a real flyer than a generic not-found.
 */
export default async function CouponPage({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);

  const [coupon, system, t, catalogT] = await Promise.all([
    getCoupon(code),
    getSystem(),
    getTranslations("Coupon"),
    getTranslations("CatalogItems"),
  ]);
  if (!coupon) notFound();

  const value = couponValueLabel(coupon.kind, coupon.value, coupon.currency);
  const expires = coupon.expires_at ? new Date(coupon.expires_at) : null;

  // Where "Start shopping" leads, decided by what this tenant actually sells -
  // the same three counts `EmptyCatalogState` and the navbar key off. A
  // services-only site must never send a scanned coupon to an empty products
  // page, which is the one moment the customer was most willing to buy.
  const destinations: CouponDestination[] = [
    ...(system?.product_count
      ? [
          {
            label: catalogT("browseProducts"),
            href: "/categories/products",
          },
        ]
      : []),
    ...(system?.service_count
      ? [
          {
            label: catalogT("browseServices"),
            href: "/categories/services",
          },
        ]
      : []),
    ...(system?.menu_item_count
      ? [
          {
            label: catalogT("browseFood"),
            href: MENU_ALL_PATH,
            icon: MENU_ICON,
          },
        ]
      : []),
  ];

  return (
    // The page has no hero, so it clears the fixed navbar itself - the same
    // shape `/cart` and `/orders/[id]` use. `md` because the whole page is one
    // card: at `lg` the offer would stretch across a desktop with nothing beside
    // it to justify the width.
    <Container
      size="md"
      paddingX={10}
      marginTop={16}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Breadcrumbs
        items={[{ label: t("home"), href: "/" }, { label: t("title") }]}
      />

      <Card
        alignItems="center"
        gap={20}
        padding={32}
        borderRadius={16}
        elevation={4}
      >
        <Typography
          as="h1"
          variant="h1"
          margin={0}
          color={coupon.valid ? "var(--accent, #06b6d4)" : "var(--foreground)"}
          styles={{ textAlign: "center" }}
        >
          {value} {t("off")}
        </Typography>

        {coupon.description ? (
          <Typography
            variant="body"
            margin={0}
            color="var(--foreground)"
            styles={{ textAlign: "center", maxWidth: 560 }}
          >
            {coupon.description}
          </Typography>
        ) : null}

        {/* The code in a dashed box - the same "type this in" convention the
            printed flyer uses, so the screen and the paper agree. */}
        <Box
          paddingY={14}
          paddingX={28}
          borderRadius={10}
          border="2px dashed color-mix(in srgb, var(--foreground) 35%, transparent)"
        >
          <Typography
            as="span"
            variant="h3"
            margin={0}
            color="var(--foreground)"
            styles={{
              letterSpacing: 4,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            }}
          >
            {coupon.code}
          </Typography>
        </Box>

        {/* The conditions, before the call to action - a customer should learn
            about a minimum spend here, not when the cart refuses the code. */}
        <Box flexDirection="column" alignItems="center" gap={4}>
          {hasMinOrder(coupon.min_order_amount) ? (
            <Typography variant="caption" margin={0} color="var(--foreground)">
              {t("minOrder", {
                amount: formatPrice(coupon.min_order_amount, coupon.currency),
              })}
            </Typography>
          ) : null}
          {expires ? (
            <Typography variant="caption" margin={0} color="var(--foreground)">
              {t("validUntil", {
                date: expires.toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
              })}
            </Typography>
          ) : null}
        </Box>

        {coupon.valid ? (
          <CouponClaim code={coupon.code} destinations={destinations} />
        ) : (
          <Typography
            variant="body"
            margin={0}
            color="var(--error, #ef4444)"
            styles={{ textAlign: "center" }}
          >
            {t("ended")}
          </Typography>
        )}

        {system?.site_name ? (
          <Typography variant="caption" margin={0} color="var(--foreground)">
            {system.site_name}
          </Typography>
        ) : null}
      </Card>
    </Container>
  );
}
