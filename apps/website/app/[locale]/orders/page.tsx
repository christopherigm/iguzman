import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { getOrders, type OrderStatus } from "@/lib/orders";
import { formatPrice } from "@/lib/price";

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

const STATUS_COLORS: Record<OrderStatus, string> = {
  paid: "#22c55e",
  pending: "#f59e0b",
  failed: "#ef4444",
  canceled: "#ef4444",
  refunded: "#6b7280",
};

export default async function OrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [orders, t] = await Promise.all([getOrders(), getTranslations("Orders")]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("heading") },
  ];

  return (
    <Container
      size="lg"
      paddingX={10}
      marginTop={32}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Breadcrumbs items={breadcrumbs} />
      <Typography as="h1" variant="h1" marginTop={24} marginBottom={32}>
        {t("heading")}
      </Typography>

      {orders.length > 0 ? (
        <Box flexDirection="column" gap={12}>
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/${locale}/orders/${order.id}`}
              prefetch
              style={{ textDecoration: "none" }}
            >
              <Card
                border="none"
                elevation={3}
                backgroundColor="var(--surface-1)"
                className="zoom-on-hover"
              >
                <Box
                  alignItems="center"
                  justifyContent="space-between"
                  gap={12}
                  flexWrap="wrap"
                  width="100%"
                >
                  <Box flexDirection="column" gap={6} minWidth={0}>
                    <Box alignItems="center" gap={8} flexWrap="wrap">
                      <Typography
                        as="h2"
                        variant="h6"
                        margin={0}
                        color="var(--on-surface)"
                      >
                        {t("breadcrumb", { id: order.id })}
                      </Typography>
                      <Badge
                        variant="filled"
                        size="sm"
                        color={STATUS_COLORS[order.status]}
                        textColor="#fff"
                      >
                        {t(`status_${order.status}`)}
                      </Badge>
                    </Box>
                    <Typography
                      variant="caption"
                      margin={0}
                      color="color-mix(in srgb, var(--foreground) 55%, transparent)"
                    >
                      {t("placedOn", {
                        date: new Date(order.created_at).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }),
                      })}
                      {" · "}
                      {t("itemCount", { count: order.item_count })}
                    </Typography>
                  </Box>

                  <Typography
                    as="span"
                    variant="h5"
                    fontWeight={700}
                    margin={0}
                    color="var(--on-surface)"
                  >
                    {formatPrice(order.total, order.currency)}
                  </Typography>
                </Box>
              </Card>
            </Link>
          ))}
        </Box>
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
