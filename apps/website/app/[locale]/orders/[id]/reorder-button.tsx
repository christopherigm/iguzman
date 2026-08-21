"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { addGuestCartLine } from "@/lib/guest-cart";
import type { GuestCartLine } from "@/lib/guest-cart";

interface ReorderButtonProps {
  /** The order's `public_id` - the only handle a guest's order has. */
  publicId: string;
  /**
   * Whether there is an account to write a cart into. A guest takes the same
   * path into localStorage rather than being bounced to /auth: the API answers
   * with the references and the browser keeps them, exactly as every other
   * guest cart line is kept.
   */
  isLoggedIn: boolean;
}

/**
 * Re-order everything in a past order, then go to the cart to check out.
 *
 * **The server decides what goes in.** The button sends nothing but the order's
 * id; `OrderReorderView` walks that order's own frozen lines, drops what can no
 * longer be bought (a deleted or unavailable item, a service that is now sold as
 * an appointment) and rebuilds the rest - the chosen size and the ingredient
 * edits included, from the ids the line snapshotted. Re-deriving any of that here
 * is how the button comes to offer something the cart then disagrees with.
 *
 * ⚠ **An order placed before those ids existed re-orders as the dish is listed.**
 * A name cannot be turned back into the ingredient row it was copied from, and
 * guessing from a string the tenant may since have reused would put a different
 * dish in the basket than the one on the receipt above.
 *
 * **It adds; it never replaces.** Whatever the customer was already building
 * stays, with quantities summed on identical lines - the same rule a repeated
 * add and the sign-in merge follow.
 *
 * Rendered only when at least one line is `item_reorderable` (see `page.tsx`),
 * which is the API's own answer to the same question the endpoint asks. A
 * refusal is still possible - an item can sell out while the page sits open - so
 * a failure refreshes as well as printing a message: the lines' own "Buy again"
 * badges are stale too.
 */
export function ReorderButton({ publicId, isLoggedIn }: ReorderButtonProps) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${publicId}/reorder`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(
          t(
            data.code === "NOTHING_REORDERABLE"
              ? "reorderNothingAvailable"
              : "reorderError",
          ),
        );
        setLoading(false);
        // Whatever refused us is a real change on the catalog's side, so the
        // lines above - and this button's own reason to exist - are stale.
        router.refresh();
        return;
      }

      const data = (await res.json()) as { lines?: GuestCartLine[] };
      if (!isLoggedIn) {
        // A guest has no rows, so the references the API resolved are written
        // into localStorage one at a time - `addGuestCartLine` is what merges a
        // line the browser already holds, and the cart page re-prices all of
        // them through `/api/guest/resolve`.
        for (const line of data.lines ?? []) addGuestCartLine(line);
      }

      router.push("/cart");
      // `loading` stays true: the page is navigating, and resetting it would
      // flash an enabled button on the way out.
    } catch {
      setError(t("reorderError"));
      setLoading(false);
    }
  }, [publicId, isLoggedIn, t, router]);

  return (
    <Box flexDirection="column" gap={6}>
      <Button
        text={loading ? t("reorderLoading") : t("reorderAll")}
        onClick={handleClick}
        isLoading={loading}
        kind="success"
        width="100%"
        size="md"
      />
      {error !== null && (
        <Typography variant="caption" margin={0} color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
    </Box>
  );
}
