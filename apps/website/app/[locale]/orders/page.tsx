import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { getSession } from "@repo/auth/session";
import { redirect } from "@repo/i18n/navigation";
import { getOrders } from "@/lib/orders";
import { EmptyCatalogState } from "@/components/empty-catalog-state";
import { OrderCard } from "./order-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Orders",
  })) as (key: string) => string;

  return { title: t("heading") };
}

export default async function OrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Guarded here rather than in `proxy.ts`: `/orders/<public_id>` underneath
  // this route is public (a guest order's only handle is its link), so a path
  // prefix cannot protect the history list without also locking that out.
  const [session, orders, t] = await Promise.all([
    getSession(),
    getOrders(),
    getTranslations("Orders"),
  ]);

  if (session === null) redirect({ href: "/auth", locale });

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

      {orders.length > 0 ? (
        <Grid container spacing={2}>
          {orders.map((order) => (
            <Grid key={order.public_id} size={{ xs: 12, sm: 6, md: 4 }}>
              <OrderCard order={order} locale={locale} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <EmptyCatalogState message={t("empty")} />
      )}
    </Container>
  );
}
