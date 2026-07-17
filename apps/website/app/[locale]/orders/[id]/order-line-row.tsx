import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { OrderLine } from "@/lib/orders";
import { formatPrice } from "@/lib/price";
import { BuyNowButton } from "@/components/buy-now-button";

interface OrderLineRowProps {
  line: OrderLine;
}

/**
 * One purchased line, rendered entirely from the order's own snapshot.
 *
 * Shaped like `CartLine` but static - there is nothing to change about a line
 * that has been paid for. Note that `name`, `variant_label` and `unit_price`
 * come off the line itself, not the catalog, which is what keeps this row
 * showing what was actually charged after the item is re-priced or renamed.
 *
 * The image and the link are the only things read through the catalog, so both
 * are optional here: once the item is deleted the row still renders in full,
 * just without a picture to click.
 */
export async function OrderLineRow({ line }: OrderLineRowProps) {
  const [t, itemT] = await Promise.all([
    getTranslations("Orders"),
    getTranslations("CatalogItems"),
  ]);

  const kindLabel =
    line.kind === "product"
      ? itemT("productLabel")
      : line.kind === "service"
        ? itemT("serviceLabel")
        : itemT("menuLabel");

  const kindColor =
    line.kind === "product"
      ? "rgb(34, 181, 32)"
      : line.kind === "service"
        ? "rgba(99,102,241,0.8)"
        : "rgba(234,88,12,0.85)";

  const href =
    line.item_slug === null
      ? null
      : line.kind === "product"
        ? `/products/${line.item_slug}`
        : line.kind === "service"
          ? `/services/${line.item_slug}`
          : `/menu/${line.item_slug}`;

  const image = line.image ? (
    <Box
      width={72}
      height={72}
      flex="0 0 auto"
      borderRadius={8}
      backgroundColor="var(--surface-3, #e5e7eb)"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      <Image
        fill
        src={line.image}
        alt={line.name}
        sizes="72px"
        style={{ objectFit: "cover" }}
      />
    </Box>
  ) : (
    <Box
      width={72}
      height={72}
      flex="0 0 auto"
      borderRadius={8}
      backgroundColor="var(--surface-3, #e5e7eb)"
    />
  );

  return (
    <Card padding={0}>
      <Box gap={14} padding={8} alignItems="center" width="100%">
        {href ? (
          <Link href={href} prefetch>
            {image}
          </Link>
        ) : (
          image
        )}

        <Box flexDirection="column" gap={4} flex={1} minWidth={0}>
          <Typography as="h3" variant="h6" margin={0} color="var(--on-surface)">
            {href ? (
              <Link
                href={href}
                prefetch
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {line.name}
              </Link>
            ) : (
              line.name
            )}
          </Typography>
          <Box alignItems="center" gap={6} flexWrap="wrap">
            <Badge
              variant="filled"
              size="sm"
              color={kindColor}
              textColor="#fff"
            >
              {kindLabel}
            </Badge>
          </Box>
          {line.variant_label ? (
            <Typography
              variant="caption"
              margin={0}
              color="color-mix(in srgb, var(--foreground) 60%, transparent)"
            >
              {line.variant_label}
            </Typography>
          ) : null}
          {line.customization.length > 0 && (
            <Box flexDirection="column" gap={2}>
              {line.customization.map((row, idx) => {
                const upcharge = parseFloat(row.line_upcharge);
                return (
                  <Typography
                    key={idx}
                    variant="caption"
                    margin={0}
                    color="color-mix(in srgb, var(--foreground) 60%, transparent)"
                  >
                    {row.removed
                      ? `− ${row.name}`
                      : `${row.quantity}× ${row.name}`}
                    {upcharge > 0 &&
                      ` (+${formatPrice(row.line_upcharge, line.currency)})`}
                  </Typography>
                );
              })}
            </Box>
          )}
          <Typography
            variant="caption"
            margin={0}
            color="color-mix(in srgb, var(--foreground) 55%, transparent)"
          >
            {t("quantityTimesPrice", {
              quantity: line.quantity,
              price: formatPrice(line.unit_price, line.currency),
            })}
          </Typography>
        </Box>

        <Box
          flexDirection="column"
          alignItems="flex-end"
          gap={10}
          flex="0 0 auto"
        >
          <Typography
            as="span"
            variant="h6"
            fontWeight={700}
            margin={0}
            color="var(--on-surface)"
          >
            {formatPrice(line.line_total, line.currency)}
          </Typography>
          {line.item_id !== null &&
            (line.kind === "menu_item" ? (
              // A menu item is re-ordered by re-customising it, so link back to
              // its detail page rather than one-click re-adding the base dish.
              href && (
                <Link
                  href={href}
                  prefetch
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <Badge variant="outlined" size="sm">
                    {t("buyAgain")}
                  </Badge>
                </Link>
              )
            ) : (
              // The order page is auth-gated (`getOrder` is scoped to the caller),
              // so a rendered line always belongs to a signed-in customer.
              <BuyNowButton
                kind={line.kind}
                id={line.item_id}
                isLoggedIn
                text={t("buyAgain")}
                size="sm"
              />
            ))}
        </Box>
      </Box>
    </Card>
  );
}
