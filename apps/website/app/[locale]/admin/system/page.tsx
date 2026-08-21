"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { ContactSection } from "./contact-section";
import { KindLabelsSection } from "./kind-labels-section";
import { MapSection } from "./map-section";
import {
  RewardsSection,
  persistRewardTiers,
  toRewardTierRow,
  type RewardTierRow,
} from "./rewards-section";
import { StorageSection } from "./storage-section";
import { BackupSection } from "./backup-section";
import { RestoreSection } from "./restore-section";
import { getSystem, listRewardTiers, updateSystem } from "@/lib/admin-api";
import { CATALOG_KINDS } from "@/lib/kind-labels";
import type { SocialLink } from "@/lib/contact";
import { useSession } from "@repo/auth/session-provider";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/**
 * The 14 kind-label columns, read off an API payload (or blank on first render).
 *
 * Derived from `CATALOG_KINDS` rather than typed out twice: a kind added there
 * would otherwise get inputs from `KindLabelsSection` whose values this page
 * never loads and never sends, which looks exactly like a lost save.
 */
function kindLabelValues(data: Record<string, unknown> = {}) {
  return Object.fromEntries(
    CATALOG_KINDS.flatMap((kind) => [
      [`kind_label_${kind}`, data[`kind_label_${kind}`] ?? ""],
      [`en_kind_label_${kind}`, data[`en_kind_label_${kind}`] ?? ""],
    ]),
  );
}

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
    // Which basemap every map on the site draws. Here rather than on the
    // brand-kit page because it is a property of the site's operation, not of
    // how it looks. Seeded with the model's own default so the picker renders
    // sensibly for the moment before the API answers, rather than snapping.
    map_style: "osm",
    map_tile_url: "",
    map_attribution: "",
    map_attribution_url: "",
    // The global rewards switch. Off is every tenant's starting state, and off
    // is what every row written before the program existed reads as.
    rewards_enabled: false,
    // What this tenant calls each kind it sells; blank means "use the site's own
    // translation", which is every tenant's starting state.
    ...kindLabelValues(),
  });

  // The rewards ladder. It lives here rather than inside `RewardsSection`
  // because the page's own Save is what writes it - the same arrangement the
  // menu-item form has with its sizes and ingredients. `originalTierIds` is what
  // a save diffs against to know which rows the operator deleted.
  const [tiers, setTiers] = useState<RewardTierRow[]>([]);
  const [originalTierIds, setOriginalTierIds] = useState<number[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const session = useSession();
  const systemId = session?.systemId ?? 0;
  // Django staff - us, not the customer's own CMS administrator. It gates the
  // Storage section below and nothing else on this page. Presentation only: the
  // API re-derives it from the token on every call.
  const isStaff = session?.isStaff === true;

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
          map_style: data.map_style ?? "osm",
          map_tile_url: data.map_tile_url ?? "",
          map_attribution: data.map_attribution ?? "",
          map_attribution_url: data.map_attribution_url ?? "",
          rewards_enabled: data.rewards_enabled ?? false,
          ...kindLabelValues(data),
        });
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  // A request of its own rather than a key on the System payload: tiers are rows
  // on a table of their own, and the page renders (and saves) fine without them.
  useEffect(() => {
    if (!systemId) return;
    listRewardTiers()
      .then((rows) => {
        const mapped = rows.map((row) => toRewardTierRow(row));
        setTiers(mapped);
        setOriginalTierIds(
          mapped
            .map((r) => r.id)
            .filter((n): n is number => typeof n === "number"),
        );
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setTiersLoading(false));
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

      // The rewards tiers are rows, so they are written after the System fields
      // rather than inside that payload. A refused tier is reported on its own -
      // the System fields above it did save, and saying "couldn't save" of the
      // whole page would be untrue.
      const persisted = await persistRewardTiers(tiers, originalTierIds);
      setTiers(persisted.rows);
      setOriginalTierIds(persisted.ids);
      if (persisted.failed) {
        setError(t("rewardsTierSaveFailed"));
        return;
      }

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
        loading={loading}
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

        {/* What the tenant calls each kind of thing it sells. On this page
            rather than beside the catalog: one rename retitles the navbar, the
            listings and the breadcrumbs across the whole site, which is a
            site-wide setting, not a property of any one product or dish. */}
        <KindLabelsSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />

        {/* Inside the form, unlike Storage/Backup/Restore below: these are
            ordinary System keys saved by the form's own button, not a separate
            action with a request of its own. */}
        <MapSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />

        {/* Inside the form, and saved by it end to end: `rewards_enabled` is an
            ordinary System key in `values`, and the tier rows are written by
            `persistRewardTiers` in `handleSubmit` above - the arrangement the
            menu-item form has with its sizes and ingredients. */}
        <RewardsSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          tiers={tiers}
          onTiersChange={setTiers}
          loading={tiersLoading}
        />
      </AdminForm>

      {/* Storage, Backup and Restore sit OUTSIDE the AdminForm, not as
          `children` of it like ContactSection. They own their own requests and
          their own buttons; nesting them would put a "Create backup" button
          inside a form whose submit saves the System fields, and the Enter key
          in the backup-name input would then save the page rather than start the
          backup. Storage goes first of the three: it decides *where* a backup is
          written, so an operator who changes it should see that before the
          buttons that use it.

          Storage is staff-only, unlike the rest of the page: connecting a
          bucket repoints where every one of the site's files is read from and
          written to, which is an operator action, not a customer one.
          Presentation only - the API re-derives staff from the token; this just
          decides what is worth rendering. */}
      {isStaff && <StorageSection />}
      <BackupSection />
      <RestoreSection />
    </>
  );
}
