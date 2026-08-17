import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { getSession } from "@repo/auth/session";
import { getCart } from "@/lib/cart";
import { getSystem } from "@/lib/system";
import { EmptyCatalogState } from "@/components/empty-catalog-state";
import { getRequestOrigin } from "@/lib/metadata";
import { CartLines } from "./cart-lines";
import { CartRecommendations } from "./cart-recommendations";
import { CartSummary } from "./cart-summary";
import { GuestCartView } from "./guest-cart-view";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Cart",
  })) as (key: string) => string;

  return { title: t("heading") };
}

export default async function CartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // An anonymous visitor's cart lives in their browser, so the server has
  // nothing to render for them: `getCart()` returns empty and the page hands off
  // to `GuestCartView`, which resolves localStorage after hydration.
  const [session, cart, system, t, origin] = await Promise.all([
    getSession(),
    getCart(),
    getSystem(),
    getTranslations("Cart"),
    // Only the server knows the request host, and the guest strip's cards need it
    // for their share links - the same reason `guest-favorites.tsx` takes it.
    getRequestOrigin(),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("heading") },
  ];

  return (
    <Container
      size="lg"
      paddingX={10}
      marginTop={16}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Breadcrumbs items={breadcrumbs} />
      <Typography as="h1" variant="h1" marginBottom={32}>
        {t("heading")}
      </Typography>

      {session === null ? (
        <GuestCartView
          locale={locale}
          origin={origin}
          stripeConfigured={system?.stripe_configured ?? false}
          payInStoreEnabled={system?.pay_in_store_enabled ?? false}
          payOnDeliveryEnabled={system?.pay_on_delivery_enabled ?? false}
          // Built here because it is a server component (it renders the async
          // Categories grid) and `GuestCartView` is a client component - it can
          // hold the element and decide when to show it, but not render it.
          emptyState={<EmptyCatalogState message={t("empty")} />}
        />
      ) : cart.items.length > 0 ? (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 7 }}>
            <CartLines lines={cart.items} locale={locale} />
            {/* Under the lines, inside their column: the strip is a nudge about
                this basket, so it belongs beside the list rather than across the
                page under the summary. */}
            <CartRecommendations
              recommendations={cart.recommendations}
              locale={locale}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <CartSummary totals={cart.totals} count={cart.count} />
          </Grid>
        </Grid>
      ) : (
        <EmptyCatalogState message={t("empty")} />
      )}
    </Container>
  );
}
