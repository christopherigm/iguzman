import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { CartTotal } from "@/lib/cart";
import { formatPrice } from "@/lib/price";

interface CartSummaryProps {
  totals: CartTotal[];
  /** Total quantity, matching the navbar's count - not the number of lines. */
  count: number;
}

/**
 * The order summary: one subtotal per currency, then the checkout CTA.
 *
 * Totals are grouped by currency rather than added together because
 * `Buyable.currency` is per item - a System can hold a USD product and an MXN
 * one, and a single number across them would be arithmetic on incomparable
 * units. Most carts have exactly one row here.
 *
 * The CTA is deliberately inert: checkout is not built yet, so the button holds
 * its place and says so rather than leading anywhere.
 */
export async function CartSummary({ totals, count }: CartSummaryProps) {
  const t = await getTranslations("Cart");

  return (
    <Card
      gap={14}
      backgroundColor="var(--surface-1)"
      elevation={3}
      border="none"
      styles={{ position: "sticky", top: "calc(var(--ui-navbar-height, 57px) + 16px)" }}
    >
      <Typography as="h2" variant="h5" margin={0} color="var(--on-surface)">
        {t("summary")}
      </Typography>

      <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />

      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Typography
          as="span"
          variant="body"
          color="color-mix(in srgb, var(--foreground) 65%, transparent)"
        >
          {t("itemCount", { count })}
        </Typography>
      </Box>

      {totals.map((total) => (
        <Box
          key={total.currency}
          alignItems="baseline"
          justifyContent="space-between"
          gap={8}
        >
          <Typography as="span" variant="body" color="var(--on-surface)">
            {t("subtotal")}
            {totals.length > 1 ? ` (${total.currency})` : ""}
          </Typography>
          <Typography
            as="span"
            variant="h5"
            fontWeight={700}
            margin={0}
            color="var(--on-surface)"
          >
            {formatPrice(total.subtotal, total.currency)}
          </Typography>
        </Box>
      ))}

      <Typography
        variant="caption"
        margin={0}
        color="color-mix(in srgb, var(--foreground) 55%, transparent)"
      >
        {t("taxesNote")}
      </Typography>

      <Button
        text={t("checkout")}
        kind="primary"
        size="lg"
        width="100%"
        disabled
      />

      <Typography
        variant="caption"
        margin={0}
        color="color-mix(in srgb, var(--foreground) 55%, transparent)"
        styles={{ textAlign: "center" }}
      >
        {t("checkoutComingSoon")}
      </Typography>
    </Card>
  );
}
