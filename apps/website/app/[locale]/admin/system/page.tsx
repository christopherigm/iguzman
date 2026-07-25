"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { ContactSection } from "./contact-section";
import { getSystem, updateSystem } from "@/lib/admin-api";
import type { SocialLink } from "@/lib/contact";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

export default function AdminSystemPage() {
  const t = useTranslations("Admin");

  const [values, setValues] = useState<Record<string, unknown>>({
    site_name: "",
    site_description: "",
    en_site_description: "",
    host: "",
    contact_email: "",
    social_links: [],
    enabled: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => {
        setValues({
          site_name: data.site_name ?? "",
          site_description: data.site_description ?? "",
          en_site_description: data.en_site_description ?? "",
          host: data.host ?? "",
          contact_email: data.contact_email ?? "",
          social_links: data.social_links ?? [],
          enabled: data.enabled ?? true,
        });
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      if (payload.contact_email === "") payload.contact_email = null;
      // Drop incomplete social-link rows (no URL) so the API validator, which
      // requires a URL on every entry, doesn't reject the whole save.
      if (Array.isArray(payload.social_links)) {
        payload.social_links = (payload.social_links as SocialLink[]).filter(
          (l) => l && l.url && l.url.trim() !== "",
        );
      }
      await updateSystem(systemId, payload);
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: "site_name", label: t("siteName") ?? "Site Name", required: true },
    {
      key: "site_description",
      label: t("siteDescription") ?? "Site Description (ES)",
      type: "textarea",
    },
    {
      key: "en_site_description",
      label: t("enSiteDescription") ?? "Site Description (EN)",
      type: "textarea",
    },
    // `host` is intentionally not editable here (kept in `values` so it still
    // round-trips unchanged). The hero's own fields - `video_link`, `slogan`
    // and every `hero_*` - live on /admin/logos-and-styles, inside
    // HeroVideoSection beside the live hero preview.
    //
    // The company story (about/mission/vision) and the three legal texts are
    // deliberately absent: they are the whole of /admin/about, which owns and
    // PATCHes only those keys. They are not in `values` here either, so this
    // page's payload never carries a stale copy of them. The same goes for every
    // `spotlight_*` field *and* the `catalog_*` band, which
    // /admin/featured-spotlight now owns below the items that band frames, for
    // the `stripe_*` / offline-payment fields, which /admin/payments now owns,
    // and for every `highlights_*` field - the section's heading pair and its
    // band - which /admin/highlights now owns, above the items they title.
    //
    // `enabled` is intentionally not editable here (kept in `values` so it still
    // round-trips unchanged): taking the whole site down is a Django-staff
    // action, done from the backend admin - not something the CMS can do.
  ];

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
          { label: t("system") },
        ]}
      />
      <AdminForm
        title={t("system")}
        hideCancel
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
      >
        {/* Below the site-description pair - now the last text field, since the
            About/legal copy moved to /admin/about and the Highlights headings to
            /admin/highlights: Contact, this page's only remaining section. It is
            `children` rather than a `beforeKey` slot because there is no longer a
            field to anchor it above. Neither section band lives here any more -
            each one moved onto the page that owns its section (the catalog band
            to /admin/featured-spotlight, the highlights band to
            /admin/highlights). (The brand assets, colours, fonts, hero
            composition and watermark live on /admin/logos-and-styles; the promo
            panel on /admin/featured-spotlight; Stripe and the offline payment
            methods on /admin/payments.) */}
        <ContactSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
      </AdminForm>
    </>
  );
}
