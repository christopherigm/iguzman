import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { getCart } from "@/lib/cart";
import { CartLine } from "./cart-line";
import { CartSummary } from "./cart-summary";

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

  const [cart, t, itemT] = await Promise.all([
    getCart(),
    getTranslations("Cart"),
    getTranslations("CatalogItems"),
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

      {cart.items.length > 0 ? (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Box flexDirection="column" gap={12}>
              {cart.items.map((line) => (
                <CartLine
                  key={line.id}
                  line={line}
                  locale={locale}
                  productLabel={itemT("productLabel")}
                  serviceLabel={itemT("serviceLabel")}
                />
              ))}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <CartSummary totals={cart.totals} count={cart.count} />
          </Grid>
        </Grid>
      ) : (
        <Box flexDirection="column" alignItems="flex-start" gap={20}>
          <Typography variant="body">{t("empty")}</Typography>
          <Button
            text={t("browseProducts")}
            href="/categories/products"
            kind="primary"
          />
        </Box>
      )}
    </Container>
  );
}
