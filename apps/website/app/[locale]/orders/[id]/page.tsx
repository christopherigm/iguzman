import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { redirect } from "@repo/i18n/navigation";
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
import { getSystem } from "@/lib/system";
import { formatPrice } from "@/lib/price";
import { CompletePaymentButton } from "./complete-payment-button";
import { OrderStatusBanner } from "./order-status-banner";
import { BookingDetails } from "./booking-details";
import { BookingLocation } from "./booking-location";
import { OrderLineRow } from "./order-line-row";
import { ReorderButton } from "./reorder-button";

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
 *
 * **It is also where the order's QR code leads**, which is why an admin of the
 * tenant may open it for any of their customers' orders (`_may_read` in
 * website-api). A QR carries exactly one URL and it is printed on a receipt the
 * customer keeps, so it has to be the address that works for whoever holds it;
 * an admin who scans one lands here and takes the "See in admin" button through
 * to the management view.
 */
export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // `id` is the order's public UUID. A malformed one is simply not found: the
  // Django lookup is scoped to the caller, so a bad or foreign id is a 404 here.
  const [order, query, session, system, t, tCart] = await Promise.all([
    getOrder(id),
    searchParams,
    getSession(),
    // Only for the map pin's brandmark. `getSystem` is request-cached and the
    // layout above has already asked for it, so this costs nothing.
    getSystem(),
    getTranslations("Orders"),
    // The two points lines below. Reused from `Cart` rather than copied into
    // `Orders`, the same call `OrderBoard` makes for the status labels it shares
    // with `AdminOrders`: one wording for one thing, and two copies could only
    // drift.
    getTranslations("Cart"),
  ]);

  // Django scopes the lookup to the caller, so another user's order id is a 404
  // here rather than a 403 - it does not exist as far as this request is concerned.
  //
  // ⚠ **For a signed-out visitor that 404 is usually wrong, and this is the one
  // place it can be told.** A guest order is readable by whoever holds its link,
  // so the only way an anonymous request gets nothing back is that the order has
  // an *owner* - which is exactly what happens when someone checks out as a guest
  // on an address this site already has an account for (`link_order_to_account`
  // in website-api). Their receipt then leads to a page saying their order does
  // not exist, which is the one thing it is not. Send them to sign in instead,
  // carrying the order they were trying to reach so they land on it rather than
  // on the home page.
  //
  // A signed-in reader keeps the 404: at that point "not yours" and "not there"
  // are genuinely the same answer, and offering them a login form they are
  // already past would be a loop.
  if (!order && session === null) {
    redirect({
      href: { pathname: "/auth", query: { next: `/orders/${id}` } },
      locale,
    });
  }
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

  // Only an online order still waiting on its payment can be paid, which is the
  // same window the API accepts (`OrderPayView`); this just decides what is
  // worth rendering. Suppressed right after a return from Stripe - see below.
  const canPay =
    order.status === "pending" &&
    order.payment_method === "online" &&
    !query.session_id;

  // Whether anything in this order can go back in a cart. `item_reorderable` is
  // the API's own answer, run over the same rows and by the same predicate the
  // reorder endpoint uses - deriving it here from `item_id` and
  // `item_booking_enabled` would be a near-miss, and the miss is a button that
  // offers what the endpoint then refuses. A booking's single service line is
  // false for exactly that reason, so an appointment carries no button and its
  // line keeps its own "Book again".
  const canReorder = order.lines.some((line) => line.item_reorderable);

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

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Box flexDirection="column" gap={12}>
            <OrderStatusBanner
              status={order.status}
              justPaid={Boolean(query.session_id)}
              paymentMethod={order.payment_method}
              fulfilled={order.fulfilled}
            />
            {/* For a booking this is what the customer came for - above the
                lines, which for an appointment are a single receipt row. */}
            {order.booking && (
              <BookingDetails
                booking={order.booking}
                currency={order.currency}
                locale={locale}
              />
            )}
            {order.lines.map((line) => (
              <OrderLineRow key={line.id} line={line} />
            ))}
            {/* Where to turn up, under the line that was booked. Null for an
                order that is not an appointment, for one the tenant travels to
                (the address is the customer's own, on the card above), and for
                a location nobody ever pinned - see `BookingLocation` in
                `lib/booking-shared.ts`. */}
            {order.booking?.branch_location && (
              <BookingLocation
                location={order.booking.branch_location}
                name={order.booking.branch_name ?? ""}
                pinIcon={system?.img_brandmark ?? null}
              />
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 5 }}>
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

            {/* Only on a discounted order, and then both lines are needed: with
                the total alone, an order placed with a coupon shows a number
                that does not add up from its own lines. `discount_amount` is the
                frozen amount that was actually taken off - never the coupon's
                percentage re-applied, which would drift from what was charged. */}
            {Number(order.discount_amount) > 0 || order.points_spent > 0 ? (
              <>
                <Box
                  alignItems="baseline"
                  justifyContent="space-between"
                  gap={8}
                >
                  <Typography
                    as="span"
                    variant="body"
                    color="var(--foreground)"
                  >
                    {t("subtotal")}
                  </Typography>
                  <Typography
                    as="span"
                    variant="body"
                    color="var(--foreground)"
                  >
                    {formatPrice(order.subtotal, order.currency)}
                  </Typography>
                </Box>
                <Box
                  alignItems="baseline"
                  justifyContent="space-between"
                  gap={8}
                >
                  <Typography
                    as="span"
                    variant="body"
                    color="var(--primary, #16a34a)"
                  >
                    {order.coupon_code || t("discount")}
                  </Typography>
                  <Typography
                    as="span"
                    variant="body"
                    color="var(--primary, #16a34a)"
                  >
                    −{formatPrice(order.discount_amount, order.currency)}
                  </Typography>
                </Box>
              </>
            ) : null}

            {/* ⚠ A **statement**, not a deduction: a redeemed line's money never
                entered `subtotal`, so this says what the points covered rather
                than naming an amount still to come off. Printing it as a
                negative would invite exactly that subtraction. */}
            {order.points_spent > 0 ? (
              <Box alignItems="baseline" justifyContent="space-between" gap={8}>
                <Typography as="span" variant="body" color="var(--accent-text)">
                  {tCart("paidWithPoints", { points: order.points_spent })}
                </Typography>
              </Box>
            ) : null}

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

            {/* Written when the order became real - payment for an online order,
                placement for an offline one - so it is absent on a `pending` one
                rather than promising points nothing has paid for yet. */}
            {order.points_earned > 0 ? (
              <Typography
                variant="caption"
                margin={0}
                color="var(--accent-text)"
                styles={{ textAlign: "right" }}
              >
                {tCart("pointsEarned", { points: order.points_earned })}
              </Typography>
            ) : null}

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

            {/* The order's own QR code: the customer pulls their order up on a
                phone with it, and a store admin scans it at the counter to
                validate the order. Absent on any order placed before the field
                existed, so the whole block is conditional rather than reserving
                a slot that would render as a broken image. */}
            {order.qr_code ? (
              <>
                <Box
                  height={1}
                  flex="0 0 auto"
                  backgroundColor="var(--border)"
                />
                <Box flexDirection="column" alignItems="center" gap={8}>
                  <Typography
                    as="h3"
                    variant="h6"
                    margin={0}
                    color="var(--on-surface)"
                  >
                    {t("qrTitle")}
                  </Typography>
                  {/* An explicit white plate under the code, not the card's own
                      surface: a QR needs a light quiet zone to scan, and the
                      card is dark in every dark palette. */}
                  <Box
                    flex="0 0 auto"
                    backgroundColor="#ffffff"
                    padding={2}
                    borderRadius={8}
                  >
                    <Image
                      src={order.qr_code}
                      alt={t("qrAlt", { id: orderRef(order.public_id) })}
                      width={190}
                      height={190}
                      style={{ display: "block" }}
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    margin={0}
                    color="var(--foreground)"
                    styles={{ textAlign: "center" }}
                  >
                    {t("qrHint")}
                  </Typography>
                </Box>
              </>
            ) : null}

            {/* The customer who reached Stripe and came back without paying.
                Hidden while `session_id` is present: they have just returned
                from a payment and the banner above is waiting on the webhook, so
                offering to charge them again would be alarming and wrong. If the
                webhook genuinely never lands, a plain reload (no query) brings
                the button back. */}
            {canPay && <CompletePaymentButton publicId={order.public_id} />}

            {/* Everything on this receipt, straight back into the basket and on
                to checkout - the whole-order counterpart of each line's own
                "Buy again". Above the two navigation buttons because it is the
                one thing here that *does* something; a customer who opened a
                past order to repeat it should not have to read past "Back to
                orders" to find it. A guest gets it too: the API hands back the
                references and the browser keeps them, exactly as it keeps every
                other line a logged-out visitor adds. */}
            {canReorder && (
              <ReorderButton
                publicId={order.public_id}
                isLoggedIn={session !== null}
              />
            )}

            {/* A guest has no order history to go back to - send them on to
                the catalog instead of to a page that would bounce them. */}
            <Button
              text={
                session !== null ? t("backToOrders") : t("continueShopping")
              }
              href={session !== null ? "/orders" : "/"}
              kind="primary"
              width="100%"
              size="md"
            />

            {/* The other half of scanning an order's QR: an admin lands on this
                customer-facing page and needs one tap through to the controls
                (mark paid, mark fulfilled) that live in the CMS.

                `isAdmin` is a claim on the access token, so this renders in the
                first HTML with no extra request. Presentation only - the admin
                route is guarded by `proxy.ts` and Django re-derives the claim on
                every call, so a customer who forged it would land on a page that
                refuses to load. */}
            {session?.isAdmin ? (
              <Button
                text={t("seeInAdmin")}
                href={`/admin/orders/${order.public_id}`}
                width="100%"
                size="md"
              />
            ) : null}
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
