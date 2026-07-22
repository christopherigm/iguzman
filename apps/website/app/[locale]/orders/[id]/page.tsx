import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { getSession } from "@repo/auth/session";
import { getOrder, orderRef } from "@/lib/orders";
import { formatPrice } from "@/lib/price";
import { OrderStatusBanner } from "./order-status-banner";
import { OrderLineRow } from "./order-line-row";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Orders",
  })) as (key: string, values?: Record<string, string>) => string;

  return { title: t("detailTitle", { id: orderRef(id) }) };
}

/**
 * One order: the confirmation page Stripe returns to, and the permanent record.
 *
 * Both jobs are the same page on purpose. The `session_id` Stripe appends is not
 * treated as proof of anything - it only tells the banner to wait a moment for
 * the webhook, which is the only thing that may mark an order paid. Reloading
 * this page later, with no query, shows the same order in whatever state it
 * really ended up in.
 */
export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // `id` is the order's public UUID. A malformed one is simply not found: the
  // Django lookup is scoped to the caller, so a bad or foreign id is a 404 here.
  const [order, query, session, t] = await Promise.all([
    getOrder(id),
    searchParams,
    getSession(),
    getTranslations("Orders"),
  ]);

  // Django scopes the lookup to the caller, so another user's order id is a 404
  // here rather than a 403 - it does not exist as far as this request is concerned.
  if (!order) notFound();

  // A guest reached this page by its link and has no order history to go back
  // to - `/orders` would only bounce them to /auth - so the crumb is plain text
  // for them and a link for a signed-in customer.
  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    session !== null
      ? { label: t("heading"), href: "/orders" }
      : { label: t("heading") },
    { label: t("breadcrumb", { id: orderRef(order.public_id) }) },
  ];

  const hasShipping = Boolean(order.shipping_line1);

  return (
    <Container
      size="lg"
      paddingX={10}
      marginTop={16}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Breadcrumbs items={breadcrumbs} />
      <Typography as="h1" variant="h1" marginBottom={8}>
        {t("detailTitle", { id: orderRef(order.public_id) })}
      </Typography>
      <Typography variant="body" marginBottom={24} color="var(--foreground)">
        {t("placedOn", {
          date: new Date(order.created_at).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        })}
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Box flexDirection="column" gap={12}>
            <OrderStatusBanner
              status={order.status}
              justPaid={Boolean(query.session_id)}
              paymentMethod={order.payment_method}
              fulfilled={order.fulfilled}
            />
            {order.lines.map((line) => (
              <OrderLineRow key={line.id} line={line} />
            ))}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            gap={14}
            styles={{
              position: "sticky",
              top: "calc(var(--ui-navbar-height, 57px) + 16px)",
            }}
          >
            <Typography
              as="h2"
              variant="h5"
              margin={0}
              color="var(--on-surface)"
            >
              {t("summary")}
            </Typography>

            <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

            <Box alignItems="center" justifyContent="space-between" gap={8}>
              <Typography as="span" variant="body" color="var(--foreground)">
                {t("itemCount", { count: order.item_count })}
              </Typography>
            </Box>

            <Box alignItems="baseline" justifyContent="space-between" gap={8}>
              <Typography as="span" variant="body" color="var(--on-surface)">
                {t("total")}
              </Typography>
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

            {hasShipping ? (
              <>
                <Box
                  height={1}
                  flex="0 0 auto"
                  backgroundColor="var(--border)"
                />
                <Box flexDirection="column" gap={2}>
                  <Typography
                    as="h3"
                    variant="h6"
                    margin={0}
                    marginBottom={4}
                    color="var(--on-surface)"
                  >
                    {t("shippingTo")}
                  </Typography>
                  {[
                    order.shipping_name,
                    order.shipping_line1,
                    order.shipping_line2,
                    [order.shipping_city, order.shipping_state]
                      .filter(Boolean)
                      .join(", "),
                    order.shipping_postal_code,
                    order.shipping_country,
                  ]
                    .filter(Boolean)
                    .map((line) => (
                      <Typography
                        key={line}
                        variant="caption"
                        margin={0}
                        color="var(--foreground)"
                      >
                        {line}
                      </Typography>
                    ))}
                </Box>
              </>
            ) : null}

            {/* A guest has no order history to go back to - send them on to
                the catalog instead of to a page that would bounce them. */}
            <Button
              text={
                session !== null ? t("backToOrders") : t("continueShopping")
              }
              href={session !== null ? "/orders" : "/"}
              kind="primary"
              width="100%"
            />
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
