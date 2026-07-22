"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { useGuestState } from "@/hooks/use-guest-cart";
import { clearGuestCart } from "@/lib/guest-cart";
import type { PaymentMethod } from "@/lib/orders-shared";
import "./checkout-section.css";

/** Which payment methods this tenant offers, each on its own switch. */
export interface AvailableMethods {
  /** Stripe is connected (`stripe_configured`). */
  online: boolean;
  /** `pay_in_store_enabled`. */
  inStore: boolean;
  /** `pay_on_delivery_enabled`. */
  onDelivery: boolean;
}

interface CheckoutSectionProps {
  methods: AvailableMethods;
  /**
   * The cart spans more than one currency, so no method has a single total to
   * charge (Stripe is single-currency and the offline branch refuses a mixed
   * cart too). Blocks every method, not just online.
   */
  mixedCurrency: boolean;
  /**
   * Check out from the localStorage cart rather than the customer's rows. A
   * guest's references travel in the body; Django re-prices them.
   */
  isGuest: boolean;
}

/** Error codes website-api's CheckoutView returns, mapped to what we tell the user. */
const ERROR_MESSAGES: Record<string, string> = {
  PAYMENTS_UNAVAILABLE: "checkoutUnavailable",
  METHOD_UNAVAILABLE: "checkoutUnavailable",
  MIXED_CURRENCY: "checkoutMixedCurrency",
  OUT_OF_STOCK: "checkoutOutOfStock",
  CART_EMPTY: "empty",
};

/** The methods in the order they are offered, with the flag that gates each. */
const METHOD_ORDER: { key: PaymentMethod; flag: keyof AvailableMethods }[] = [
  { key: "online", flag: "online" },
  { key: "in_store", flag: "inStore" },
  { key: "on_delivery", flag: "onDelivery" },
];

/**
 * The glyph each method shows in its selector card. These are solid-black source
 * SVGs; the card masks them to `currentColor` (see `.checkout-method__glyph`) so
 * they tint with the theme and the selected state.
 */
const METHOD_ICONS: Record<PaymentMethod, string> = {
  online: "/icons/card-payment.svg",
  in_store: "/icons/store.svg",
  on_delivery: "/icons/delivery.svg",
};

/**
 * Choose how to pay and check out.
 *
 * Three shapes in one component, decided by what the tenant offers:
 * - **Online only** - the historical single button; clicking it leaves for
 *   Stripe and the page is navigating away, so `loading` stays true.
 * - **An offline method** (pay in store / on delivery) - a contact form (name +
 *   email/phone, plus a delivery address for on-delivery) that places the order
 *   directly and lands on `/orders/[id]`. No Stripe page collects these, so this
 *   form is the only place they come from; a signed-in customer's are prefilled.
 * - **A mix** - a chooser above whichever of the two the customer picks.
 *
 * Whatever the method, the body never names a price: Django reads the amount from
 * the cart (or re-prices a guest's references). `contact`/`shipping` only decide
 * who and where.
 */
export function CheckoutSection({
  methods,
  mixedCurrency,
  isGuest,
}: CheckoutSectionProps) {
  const t = useTranslations("Cart");
  const locale = useLocale();
  const session = useSession();
  const guest = useGuestState();

  const available = useMemo(
    () => METHOD_ORDER.filter((m) => methods[m.flag]).map((m) => m.key),
    [methods],
  );

  const [selected, setSelected] = useState<PaymentMethod>(
    available[0] ?? "online",
  );
  const [name, setName] = useState(session?.displayName ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOffline = selected === "in_store" || selected === "on_delivery";
  const needsAddress = selected === "on_delivery";

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (isOffline) {
      if (!name.trim()) {
        setError(t("checkoutNameRequired"));
        return;
      }
      if (!email.trim() && !phone.trim()) {
        setError(t("checkoutContactRequired"));
        return;
      }
      if (needsAddress && (!line1.trim() || !city.trim())) {
        setError(t("checkoutAddressRequired"));
        return;
      }
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        locale,
        payment_method: selected,
      };
      if (isGuest) body.cart = guest.cart;
      if (isOffline) {
        body.contact = {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        };
        if (needsAddress) {
          body.shipping = {
            line1: line1.trim(),
            line2: line2.trim(),
            city: city.trim(),
            state: region.trim(),
            postal_code: postal.trim(),
          };
        }
      }

      const res = await fetch(
        isGuest ? "/api/guest/checkout" : "/api/auth/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setError(t(ERROR_MESSAGES[data.code ?? ""] ?? "checkoutError"));
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { url?: string; redirect?: string };
      // An offline guest order is placed the moment this returns, so empty the
      // localStorage cart before leaving - otherwise the confirmation page still
      // shows a full cart and invites re-ordering. (Favorites are kept.) An
      // online checkout leaves for Stripe and may be abandoned, so its cart is
      // cleared only by the webhook, never here.
      if (isGuest && isOffline) clearGuestCart();
      window.location.href = data.url ?? data.redirect ?? `/${locale}/orders`;
      // `loading` stays true: the page is navigating away, and resetting it
      // would flash an enabled button during the redirect.
    } catch {
      setError(t("checkoutError"));
      setLoading(false);
    }
  }, [
    isOffline,
    needsAddress,
    name,
    email,
    phone,
    line1,
    line2,
    city,
    region,
    postal,
    locale,
    selected,
    isGuest,
    guest.cart,
    t,
  ]);

  // No method can run: either the cart spans currencies, or the tenant offers
  // none. Same disabled shape the single button used to render.
  const blockedMessage = mixedCurrency
    ? t("checkoutMixedCurrency")
    : available.length === 0
      ? t("checkoutUnavailable")
      : null;

  if (blockedMessage) {
    return (
      <Box flexDirection="column" gap={8} width="100%">
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
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          {blockedMessage}
        </Typography>
      </Box>
    );
  }

  const submitLabel = loading
    ? isOffline
      ? t("placingOrder")
      : t("checkoutRedirecting")
    : isOffline
      ? t("placeOrder")
      : t("checkout");

  return (
    <Box flexDirection="column" gap={12} width="100%">
      {available.length > 1 ? (
        <fieldset className="checkout-methods">
          <legend className="checkout-methods__legend">
            {t("paymentMethod")}
          </legend>
          <Grid container spacing={1.5}>
            {available.map((method) => {
              const active = selected === method;
              return (
                // Divide the 12 columns evenly so the cards always fill the row -
                // 3 methods → 4 cols each, 2 methods → 6 cols each.
                <Grid key={method} size={{ xs: 12 / available.length }}>
                  <label className="checkout-method">
                    <input
                      type="radio"
                      className="checkout-method__radio"
                      name="payment-method"
                      value={method}
                      checked={active}
                      onChange={() => setSelected(method)}
                    />
                    <span
                      className="checkout-method__icon"
                      style={
                        { "--icon": `url(${METHOD_ICONS[method]})` } as CSSProperties
                      }
                    >
                      <span
                        className="checkout-method__glyph"
                        aria-hidden="true"
                      />
                    </span>
                    <Typography
                      as="span"
                      variant="body"
                      color={
                        active ? "var(--primary, #16a34a)" : "var(--foreground)"
                      }
                      styles={{ textAlign: "center", lineHeight: 1.2 }}
                    >
                      {t(`method_${method}`)}
                    </Typography>
                  </label>
                </Grid>
              );
            })}
          </Grid>
        </fieldset>
      ) : null}

      {isOffline ? (
        <Box flexDirection="column" gap={10}>
          <TextInput
            label={t("contactName")}
            value={name}
            onChange={setName}
            required
            width="100%"
          />
          <TextInput
            label={t("contactEmail")}
            type="email"
            value={email}
            onChange={setEmail}
            width="100%"
          />
          <TextInput
            label={t("contactPhone")}
            format="phone"
            value={phone}
            onChange={setPhone}
            width="100%"
          />
          {needsAddress ? (
            <>
              <TextInput
                label={t("addressLine1")}
                value={line1}
                onChange={setLine1}
                required
                width="100%"
              />
              <TextInput
                label={t("addressLine2")}
                value={line2}
                onChange={setLine2}
                width="100%"
              />
              <Box gap={8} flexWrap="wrap">
                <TextInput
                  label={t("addressCity")}
                  value={city}
                  onChange={setCity}
                  required
                  styles={{ flex: "1 1 140px" }}
                />
                <TextInput
                  label={t("addressState")}
                  value={region}
                  onChange={setRegion}
                  styles={{ flex: "1 1 100px" }}
                />
              </Box>
              <TextInput
                label={t("addressPostal")}
                value={postal}
                onChange={setPostal}
                width="100%"
              />
            </>
          ) : null}
        </Box>
      ) : null}

      <Button
        text={submitLabel}
        kind="primary"
        size="lg"
        width="100%"
        disabled={loading}
        onClick={handleSubmit}
      />

      {error ? (
        <Typography
          variant="caption"
          margin={0}
          color="var(--error, #ef4444)"
          styles={{ textAlign: "center" }}
          aria-live="polite"
        >
          {error}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          margin={0}
          color="var(--foreground)"
          styles={{ textAlign: "center" }}
        >
          {isOffline ? t("placeOrderNote") : t("checkoutSecureNote")}
        </Typography>
      )}
    </Box>
  );
}
