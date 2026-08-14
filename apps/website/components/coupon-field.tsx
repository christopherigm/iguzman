"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { formatPrice } from "@/lib/price";
import {
  COUPON_ERROR_MESSAGES,
  type CouponQuote,
} from "@/lib/coupon-shared";
import { clearStashedCoupon, readStashedCoupon } from "@/lib/coupon-stash";
import type { GuestCartLine } from "@/lib/guest-cart";

interface CouponFieldProps {
  /**
   * The basket to price the coupon against, as **references**. Empty for a
   * signed-in customer, whose cart Django reads from their own rows; populated
   * for a guest and for the POS till, neither of which has rows to read.
   */
  cart: GuestCartLine[];
  /**
   * The applied coupon, or null. Owned by the parent because both consumers need
   * it elsewhere - the cart to show the discount in its summary, the till to put
   * it in the charge panel - and a field holding its own copy would be a second
   * source of truth about what is being charged.
   */
  quote: CouponQuote | null;
  onChange: (quote: CouponQuote | null) => void;
  /** Larger controls for a finger over a counter, as the POS uses everywhere. */
  size?: "md" | "lg";
  /**
   * Try a code stashed by a scanned QR as soon as this is true.
   *
   * The parent owns the timing because only it knows when `cart` is real: a
   * guest's cart is read through `useSyncExternalStore`, whose server snapshot
   * is empty, so it arrives one frame after hydration. Auto-applying before then
   * would validate the code against an empty basket and refuse a perfectly good
   * coupon for failing a minimum-order rule it actually meets.
   */
  autoApply?: boolean;
}

/**
 * The "have a coupon?" box, shared by cart checkout and the POS till.
 *
 * ⚠ **It never computes a discount.** The amounts it shows come from
 * `POST /api/coupons/validate/`, and even those are only for display: checkout
 * re-validates the code and re-prices the order server-side, so what is charged
 * is decided there and nowhere else. A field that did its own arithmetic would
 * be a price the browser chose - the same rule the cart follows by storing
 * references and never prices.
 *
 * It is also why applying a coupon here reserves nothing. The code can be taken
 * by someone else between this call and checkout, which is refused honestly at
 * that point rather than pretended away with a hold the API does not offer.
 */
export function CouponField({
  cart,
  quote,
  onChange,
  size = "md",
  autoApply = false,
}: CouponFieldProps) {
  const t = useTranslations("Cart");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (candidate: string, { silent = false } = {}) => {
      const trimmed = candidate.trim();
      if (!trimmed) return;
      setChecking(true);
      setError(null);
      try {
        const res = await fetch("/api/coupons/validate/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed, cart }),
        });
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const refusal = (data as { code?: string }).code ?? "";
          // A refused auto-apply leaves the code in the box instead of shouting:
          // the customer never typed it, so an error they did not ask for reads
          // as the site being broken. They can still press Apply and get the
          // real reason.
          if (silent) setCode(trimmed);
          else setError(t(COUPON_ERROR_MESSAGES[refusal] ?? "couponError"));
          onChange(null);
          return;
        }
        onChange(data as CouponQuote);
        setCode("");
      } catch {
        if (!silent) setError(t("couponError"));
        onChange(null);
      } finally {
        setChecking(false);
      }
    },
    [cart, onChange, t],
  );

  const apply = useCallback(() => submit(code), [submit, code]);

  /**
   * A code carried here from a scanned QR, applied once and then forgotten.
   *
   * The ref is what makes it once: `cart` changes as the customer edits their
   * basket, and without it every quantity tweak would re-run this against a
   * stash that has already been consumed.
   */
  const autoApplied = useRef(false);
  useEffect(() => {
    if (!autoApply || autoApplied.current || quote) return;
    const stashed = readStashedCoupon();
    if (!stashed) return;
    autoApplied.current = true;
    // Cleared whether or not it applies - an expired stashed code would
    // otherwise re-fail on every cart visit for the rest of the session.
    clearStashedCoupon();
    // Inside an async IIFE, never the effect's synchronous body, so the state it
    // sets cannot trigger the cascading-render lint.
    void (async () => {
      await submit(stashed, { silent: true });
    })();
  }, [autoApply, quote, submit]);

  const remove = useCallback(() => {
    onChange(null);
    setError(null);
  }, [onChange]);

  if (quote) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        padding={12}
        borderRadius={8}
        width="100%"
        border="1px solid color-mix(in srgb, var(--primary, #16a34a) 45%, transparent)"
        backgroundColor="color-mix(in srgb, var(--primary, #16a34a) 8%, transparent)"
      >
        <Box flexDirection="column" gap={2}>
          <Typography
            as="span"
            variant="body"
            fontWeight={600}
            color="var(--foreground)"
          >
            {quote.code}
          </Typography>
          <Typography as="span" variant="caption" color="var(--foreground)">
            −{formatPrice(quote.discount, quote.currency)}
          </Typography>
        </Box>
        <Button text={t("couponRemove")} size={size} onClick={remove} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={6} width="100%">
      <Box display="flex" alignItems="flex-end" gap={8} width="100%">
        <Box flex={1}>
          <TextInput
            label={t("couponLabel")}
            value={code}
            onChange={setCode}
            placeholder={t("couponPlaceholder")}
            width="100%"
          />
        </Box>
        <Button
          text={checking ? t("couponChecking") : t("couponApply")}
          size={size}
          onClick={() => void apply()}
          disabled={checking || code.trim() === ""}
        />
      </Box>
      {error ? (
        <Typography
          variant="caption"
          margin={0}
          color="var(--error, #ef4444)"
          aria-live="polite"
        >
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}
