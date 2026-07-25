"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminForm } from "@/components/admin/admin-form";
import { PaymentsSection } from "./payments-section";
import { getSystem, updateSystem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/**
 * The System fields this page owns and writes - the tenant's Stripe connection
 * and the two offline payment methods. Everything else on the record belongs to
 * /admin/system, /admin/logos-and-styles, /admin/featured-spotlight or
 * /admin/about; the API PATCHes, so a payload of just these keys leaves the rest
 * untouched - which is what keeps the pages from clobbering each other when more
 * than one is open.
 */
const OWNED_FIELDS = [
  "stripe_enabled",
  "stripe_publishable_key",
  // Always blank on load: the API has no read path for these, by design. Blank
  // means "leave unchanged" - see `stripeConfigured` and handleSubmit.
  "stripe_secret_key",
  "stripe_webhook_secret",
  "pay_in_store_enabled",
  "pay_on_delivery_enabled",
] as const;

/** Blank string is the right empty value for every owned key except these. */
const DEFAULTS: Record<string, unknown> = {
  stripe_enabled: false,
  pay_in_store_enabled: false,
  pay_on_delivery_enabled: false,
};

/** The two the API never sends back, so they always load blank. */
const WRITE_ONLY_FIELDS = [
  "stripe_secret_key",
  "stripe_webhook_secret",
] as const;

export default function AdminPaymentsPage() {
  const t = useTranslations("Admin");

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(OWNED_FIELDS.map((k) => [k, DEFAULTS[k] ?? ""])),
  );

  /** Whether Stripe keys are already stored, per the API's write-only flag. */
  const [stripeConfigured, setStripeConfigured] = useState(false);
  /**
   * The webhook endpoint this tenant registers in their Stripe dashboard.
   * Supplied by the API rather than built here: it is the *API's* origin, and
   * `API_URL` is server-only in this app, so the browser cannot construct it.
   */
  const [stripeWebhookUrl, setStripeWebhookUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => {
        setValues(
          Object.fromEntries(
            OWNED_FIELDS.map((k) => [
              k,
              // The secrets are not read from `data`: the API never returns
              // them. They stay blank, which the submit handler reads as "leave
              // the stored ones alone".
              (WRITE_ONLY_FIELDS as readonly string[]).includes(k)
                ? ""
                : (data[k] ?? DEFAULTS[k] ?? ""),
            ]),
          ),
        );
        setStripeConfigured(Boolean(data.stripe_configured));
        setStripeWebhookUrl(String(data.stripe_webhook_url ?? ""));
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      // A blank secret means "leave it alone", not "clear it" - the API never
      // sends these back, so the fields load blank on every visit, and
      // submitting "" would wipe the tenant's Stripe keys the first time anyone
      // toggled an unrelated switch like pay-in-store. To stop taking payments,
      // switch `stripe_enabled` off; to rotate a key, paste the new one.
      WRITE_ONLY_FIELDS.forEach((k) => {
        if (payload[k] === "") delete payload[k];
      });
      await updateSystem(systemId, payload);
      // The pasted secrets are now stored; clear the inputs so they are not left
      // sitting in the DOM, and re-read the flag that says whether both landed.
      if (payload.stripe_secret_key || payload.stripe_webhook_secret) {
        setValues((prev) => ({
          ...prev,
          stripe_secret_key: "",
          stripe_webhook_secret: "",
        }));
        const fresh = await getSystem(systemId);
        setStripeConfigured(Boolean(fresh.stripe_configured));
      }
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t("loading")}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("paymentsTitle") },
        ]}
      />
      {/* No `fields`: the whole page is PaymentsSection, which owns the Stripe
          setup steps, the endpoint URL and the offline methods as one thing -
          the credentials are useless without the instructions beside them.
          AdminForm is still the shell, so the header, Save button, toast and
          progress bar match every other CMS page. */}
      <AdminForm
        title={t("paymentsTitle")}
        hideCancel
        fields={[]}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
      >
        <PaymentsSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          webhookUrl={stripeWebhookUrl}
          configured={stripeConfigured}
        />
      </AdminForm>
    </>
  );
}
