"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * The events the webhook must be subscribed to. Stripe's own identifiers, so
 * they are never translated - a tenant types these verbatim into the dashboard.
 * `checkout.session.completed` is the one that marks an order paid; the other
 * two are what stop an abandoned or failed payment from sitting `pending`.
 */
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
];

const STRIPE_API_KEYS_URL = "https://dashboard.stripe.com/apikeys";
const STRIPE_WEBHOOKS_URL = "https://dashboard.stripe.com/webhooks";

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /**
   * This tenant's own endpoint, from the API. Built there, not here: it is the
   * API's origin, and `API_URL` is server-only in this app.
   */
  webhookUrl: string;
  /** Whether both secrets are already stored (the API's write-only flag). */
  configured: boolean;
};

/** A Stripe dashboard link. External, so a plain anchor rather than next/link. */
function StripeLink({ href, text }: { href: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--primary)", fontWeight: 600 }}
    >
      {text}
    </a>
  );
}

function StepHeading({ number, text }: { number: string; text: string }) {
  return (
    <Typography as="h4" variant="h6" margin={0} color="var(--on-surface)">
      {number}. {text}
    </Typography>
  );
}

/**
 * "Payments" - the tenant connects its own Stripe account here.
 *
 * One component rather than four `FieldDef`s because the credentials are
 * useless without the instructions: a tenant that pastes its keys but never
 * registers the webhook gets a site that takes money and never confirms an
 * order, which looks like a bug and is really a missing step. The endpoint URL
 * they need is only knowable here, so it is shown next to the box it unlocks.
 */
export function PaymentsSection({
  values,
  onChange,
  webhookUrl,
  configured,
}: Props) {
  const t = useTranslations("Admin");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and absent over plain HTTP; the URL is on
      // screen and selectable, so a failure here costs the tenant nothing.
    }
  };

  const enabled = Boolean(values.stripe_enabled);

  return (
    // No "Payments" section header: this is the whole of /admin/payments, and
    // the page's own <h1> already carries the title. The "Offline payments"
    // header below stays - it separates the two halves of this page.
    <Box flexDirection="column" gap={16}>
      <Typography variant="body" margin={0}>
        {t("paymentsIntro")}
      </Typography>

      <Box display="flex" alignItems="center" gap={10}>
        <Switch
          checked={enabled}
          onChange={(v) => onChange("stripe_enabled", v)}
        />
        <Typography
          as="span"
          variant="body"
          fontWeight={500}
          color="var(--foreground)"
        >
          {t("stripeEnabled")}
        </Typography>
      </Box>

      {/* ── Step 1: the API keys ── */}
      <Box flexDirection="column" gap={8}>
        <StepHeading number="1" text={t("paymentsStepKeysTitle")} />
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("paymentsStepKeysHelp")}
        </Typography>
        <StripeLink href={STRIPE_API_KEYS_URL} text={t("paymentsKeysLink")} />

        <Box flexDirection="column" gap={6} marginTop={8}>
          <label className="af__label" htmlFor="field-stripe_publishable_key">
            {t("stripePublishableKey")}
          </label>
          <TextInput
            id="field-stripe_publishable_key"
            value={String(values.stripe_publishable_key ?? "")}
            onChange={(v) => onChange("stripe_publishable_key", v)}
            placeholder="pk_live_…"
          />
        </Box>

        <Box flexDirection="column" gap={6}>
          <label className="af__label" htmlFor="field-stripe_secret_key">
            {t("stripeSecretKey")}
          </label>
          <TextInput
            id="field-stripe_secret_key"
            type="password"
            value={String(values.stripe_secret_key ?? "")}
            onChange={(v) => onChange("stripe_secret_key", v)}
            placeholder={configured ? t("stripeKeySet") : "sk_live_…"}
          />
        </Box>
      </Box>

      {/* ── Step 2: the webhook ── */}
      <Box flexDirection="column" gap={8}>
        <StepHeading number="2" text={t("paymentsStepWebhookTitle")} />
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("paymentsStepWebhookHelp")}
        </Typography>
        <StripeLink
          href={STRIPE_WEBHOOKS_URL}
          text={t("paymentsWebhookLink")}
        />

        <Box flexDirection="column" gap={6} marginTop={8}>
          <Typography
            as="span"
            variant="label"
            fontWeight={600}
            color="var(--foreground)"
          >
            {t("paymentsWebhookUrlLabel")}
          </Typography>
          <Box alignItems="center" gap={8} flexWrap="wrap">
            <Box
              flex={1}
              minWidth={0}
              padding="10px 12px"
              borderRadius={8}
              border="1px solid var(--border)"
              backgroundColor="var(--surface-2)"
              color="var(--foreground)"
              styles={{
                fontFamily: "monospace",
                fontSize: "0.8125rem",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {webhookUrl}
            </Box>
            <Button
              text={copied ? t("paymentsCopied") : t("paymentsCopy")}
              onClick={handleCopy}
              size="md"
              disabled={!webhookUrl}
            />
          </Box>
        </Box>

        <Typography
          variant="caption"
          margin={0}
          marginTop={4}
          color="var(--foreground)"
        >
          {t("paymentsEventsHelp")}
        </Typography>
        <Box
          flexDirection="column"
          gap={4}
          padding="10px 12px"
          borderRadius={8}
          border="1px solid var(--border)"
          backgroundColor="var(--surface-2)"
          styles={{ overflowX: "auto" }}
        >
          {WEBHOOK_EVENTS.map((event) => (
            <Typography
              key={event}
              as="span"
              variant="caption"
              margin={0}
              color="var(--foreground)"
              styles={{ fontFamily: "monospace", whiteSpace: "nowrap" }}
            >
              {event}
            </Typography>
          ))}
        </Box>

        <Box flexDirection="column" gap={6} marginTop={8}>
          <label className="af__label" htmlFor="field-stripe_webhook_secret">
            {t("stripeWebhookSecret")}
          </label>
          <TextInput
            id="field-stripe_webhook_secret"
            type="password"
            value={String(values.stripe_webhook_secret ?? "")}
            onChange={(v) => onChange("stripe_webhook_secret", v)}
            placeholder={configured ? t("stripeKeySet") : "whsec_…"}
          />
        </Box>
      </Box>

      {/* The failure this whole section exists to prevent, said plainly: with no
          signing secret nothing can ever confirm a payment. */}
      {!configured && enabled && (
        <Box
          padding="10px 12px"
          borderRadius={8}
          border="1px solid color-mix(in srgb, #f59e0b 45%, transparent)"
          backgroundColor="color-mix(in srgb, #f59e0b 10%, transparent)"
        >
          <Typography variant="caption" margin={0} color="var(--foreground)">
            {t("paymentsIncompleteWarning")}
          </Typography>
        </Box>
      )}

      {/* ── Offline payment methods ──
          Independent of Stripe and of each other: a customer places the order
          and pays in person, so these need no credentials and work even with no
          Stripe account connected. */}
      <Box
        paddingBottom={2}
        marginTop={16}
        styles={{
          borderBottom:
            "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t("offlinePaymentsTitle")}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t("offlinePaymentsIntro")}
      </Typography>

      <Box flexDirection="column" gap={4}>
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={Boolean(values.pay_in_store_enabled)}
            onChange={(v) => onChange("pay_in_store_enabled", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color="var(--foreground)"
          >
            {t("payInStoreEnabled")}
          </Typography>
        </Box>
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("payInStoreHelp")}
        </Typography>
      </Box>

      <Box flexDirection="column" gap={4}>
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={Boolean(values.pay_on_delivery_enabled)}
            onChange={(v) => onChange("pay_on_delivery_enabled", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color="var(--foreground)"
          >
            {t("payOnDeliveryEnabled")}
          </Typography>
        </Box>
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("payOnDeliveryHelp")}
        </Typography>
      </Box>
    </Box>
  );
}
