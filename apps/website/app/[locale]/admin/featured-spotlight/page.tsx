"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminForm } from "@/components/admin/admin-form";
import { SpotlightSection } from "./spotlight-section";
import { SectionBandSection } from "@/components/admin/section-band-section";
import { getSystem, updateSystem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/**
 * The System fields this page owns and writes - the landing page's promo panel,
 * the catalog items it showcases, and the colour band the landing paints behind
 * that catalog section (which used to live on /admin/system, away from the items
 * it frames). Everything else on the record belongs to /admin/system,
 * /admin/logos-and-styles, /admin/about, /admin/highlights or /admin/payments;
 * the API PATCHes, so a payload of just these keys leaves the rest untouched -
 * which is what keeps the pages from clobbering each other when more than one is
 * open.
 */
const OWNED_FIELDS = [
  "spotlight_enabled",
  "spotlight_label",
  "en_spotlight_label",
  "spotlight_title",
  "en_spotlight_title",
  "spotlight_text",
  "en_spotlight_text",
  "spotlight_button_label",
  "en_spotlight_button_label",
  "spotlight_button_link",
  "spotlight_items",
  "catalog_items_bg",
  "catalog_top_divider",
  "catalog_bottom_divider",
] as const;

/** Blank string is the right empty value for every owned key except these. */
const DEFAULTS: Record<string, unknown> = {
  spotlight_enabled: true,
  spotlight_items: [],
  catalog_top_divider: "none",
  catalog_bottom_divider: "none",
};

/**
 * Loaded only so the band preview can paint on the tenant's real page colour -
 * the backgrounds themselves are edited on /admin/logos-and-styles. They are not
 * in `OWNED_FIELDS`, so the payload never carries them and saving here can never
 * write back a stale copy of that page's work.
 */
const PREVIEW_ONLY_FIELDS = {
  background_light: "#e5e5e5",
  background_dark: "#3c3c3c",
} as const;

/** A blank gradient means "no band", which the API stores as NULL, not "". */
const NULL_WHEN_BLANK = ["catalog_items_bg"];

export default function AdminFeaturedSpotlightPage() {
  const t = useTranslations("Admin");

  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(OWNED_FIELDS.map((k) => [k, DEFAULTS[k] ?? ""])),
    ...PREVIEW_ONLY_FIELDS,
  }));

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
          ...Object.fromEntries(
            OWNED_FIELDS.map((k) => [k, data[k] ?? DEFAULTS[k] ?? ""]),
          ),
          ...Object.fromEntries(
            Object.entries(PREVIEW_ONLY_FIELDS).map(([k, fallback]) => [
              k,
              data[k] ?? fallback,
            ]),
          ),
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
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      NULL_WHEN_BLANK.forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      await updateSystem(systemId, payload);
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("spotlightTitle") },
        ]}
      />
      {/* No `fields`: the page is SpotlightSection - the master switch, the
          bilingual copy pairs and the three catalog pickers as one thing -
          followed by the band those catalog items sit on. AdminForm is still the
          shell, so the header, Save button, toast and progress bar match every
          other CMS page. */}
      <AdminForm
        title={t("spotlightTitle")}
        hideCancel
        fields={[]}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        loading={loading}
        saving={saving}
        error={error}
        success={success}
      >
        <SpotlightSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          systemId={systemId}
        />
        {/* Directly below the three featured-item pickers: the colour band the
            landing paints behind the catalog section those items belong to. It
            was on /admin/system, nowhere near the items it frames - the same
            move the highlights band made onto /admin/highlights. */}
        <SectionBandSection
          title={t("sectionBackgroundsCatalog")}
          gradientLabel={t("catalogBg")}
          backgroundKey="catalog_items_bg"
          topDividerKey="catalog_top_divider"
          bottomDividerKey="catalog_bottom_divider"
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
      </AdminForm>
    </>
  );
}
