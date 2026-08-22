"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { stashCoupon } from "@/lib/coupon-stash";

/** One place this coupon can be spent, resolved by the page from what the
 *  tenant actually sells. Locale-less hrefs - the router applies the prefix. */
export type CouponDestination = {
  label: string;
  href: string;
  /** The glyph this family's button wears, where it has one - only the menu
   *  does (`MENU_ICON`), so a coupon that leads to the menu is marked the way
   *  every other "go to the menu" button on the site is. */
  icon?: string;
};

/**
 * The call to action on a scanned coupon: keep the code, then go shopping.
 *
 * A client component for one reason - `sessionStorage` - so the rest of the
 * landing stays a server component. The code is stashed on the way out rather
 * than pushed into the URL; see `lib/coupon-stash.ts` for why.
 *
 * It leads to the **catalog**, not straight to the cart. Someone who just
 * scanned a poster has an empty cart, and a cart page telling them so is a dead
 * end at the exact moment they were most willing to buy something.
 *
 * ⚠ **Which catalog is not a constant.** It used to be `/products`
 * for everyone, which sent the customer of a services-only or food-only tenant
 * to an empty page. The page hands down whichever of the three families this
 * tenant sells - the same three counts `EmptyCatalogState` and the navbar key
 * off - and with exactly one there is nothing to choose, so the single button
 * keeps the stronger "Start shopping" wording.
 */
export function CouponClaim({
  code,
  destinations,
}: {
  code: string;
  destinations: CouponDestination[];
}) {
  const t = useTranslations("Coupon");
  const router = useRouter();

  const start = useCallback(
    (href: string) => {
      stashCoupon(code);
      // `useRouter` from @repo/i18n/navigation, so the locale prefix is applied
      // for us and the href stays locale-less.
      router.push(href);
    },
    [code, router],
  );

  // A tenant with nothing sellable still gets a way in: the code is kept and the
  // landing page is the one page that always exists.
  const targets: CouponDestination[] =
    destinations.length > 0
      ? destinations
      : [{ label: t("startShopping"), href: "/" }];

  return (
    <Box flexDirection="column" alignItems="center" gap={8}>
      <Box flexWrap="wrap" justifyContent="center" gap={12}>
        {targets.map((target, index) => (
          <Button
            key={target.href}
            text={targets.length === 1 ? t("startShopping") : target.label}
            // Only the first is the primary action; the rest stay neutral -
            // the same rule the empty-catalog state's browse row follows.
            icon={target.icon}
            kind={index === 0 ? "primary" : undefined}
            size="lg"
            onClick={() => start(target.href)}
          />
        ))}
      </Box>
      <Typography
        variant="caption"
        margin={0}
        color="var(--foreground)"
        styles={{ textAlign: "center" }}
      >
        {t("appliedAtCheckout")}
      </Typography>
    </Box>
  );
}
