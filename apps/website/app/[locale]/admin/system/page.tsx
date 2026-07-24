"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { type NewImage } from "@/components/admin-image-uploader/admin-image-uploader";
import { SystemImages, type SystemImageState } from "./system-images";
import { ContactSection } from "./contact-section";
import { PaymentsSection } from "./payments-section";
import { SpotlightSection } from "./spotlight-section";
import { WatermarkSection } from "./watermark-section";
import { HeroVideoSection } from "./hero-video-section";
import { TypographySection } from "./typography-section";
import {
  LOGO_DERIVED_FIELDS,
  SYSTEM_IMAGE_FIELDS,
} from "./system-image-fields";
import { getSystem, updateSystem } from "@/lib/admin-api";
import type { SocialLink } from "@/lib/contact";
import { useSession } from "@repo/auth/session-provider";
import { GradientBuilder } from "@repo/ui/core-elements/gradient-builder";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { ManifestAssetsModal } from "./manifest-assets-modal";
import logoToAssets from "@repo/helpers/logo-to-assets";

/** Converts a data URI to a synthetic File object (required by NewImage type). */
async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export default function AdminSystemPage() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const tGb = useTranslations("GradientBuilder");

  const [values, setValues] = useState<Record<string, unknown>>({
    site_name: "",
    site_description: "",
    en_site_description: "",
    host: "",
    slogan: "",
    video_link: "",
    primary_color: "#2196f3",
    secondary_color: "#e040fb",
    contact_email: "",
    social_links: [],
    highlights_bg: "",
    highlights_title: "",
    en_highlights_title: "",
    highlights_subtitle: "",
    en_highlights_subtitle: "",
    catalog_items_bg: "",
    hero_video_layout: "default",
    hero_logo_background: "none",
    hero_logo_scale: 100,
    hero_logo_background_scale: 100,
    hero_overlay_style: "bottom",
    hero_overlay_opacity: 75,
    hero_overlay_extent: 50,
    hero_bottom_divider: "none",
    hero_text_frame: false,
    about: "",
    en_about: "",
    mission: "",
    en_mission: "",
    vision: "",
    en_vision: "",
    privacy_policy: "",
    en_privacy_policy: "",
    terms_and_conditions: "",
    en_terms_and_conditions: "",
    user_data: "",
    en_user_data: "",
    enabled: true,
    stripe_enabled: false,
    stripe_publishable_key: "",
    // Always blank: the API has no read path for these, by design. Blank means
    // "leave unchanged" - see `stripeConfigured` and handleSubmit.
    stripe_secret_key: "",
    stripe_webhook_secret: "",
    pay_in_store_enabled: false,
    pay_on_delivery_enabled: false,
    spotlight_enabled: true,
    spotlight_label: "",
    en_spotlight_label: "",
    spotlight_title: "",
    en_spotlight_title: "",
    spotlight_text: "",
    en_spotlight_text: "",
    spotlight_button_label: "",
    en_spotlight_button_label: "",
    spotlight_button_link: "",
    spotlight_items: [],
    watermark_enabled: false,
    watermark_rotation: -12,
    watermark_intercalated: false,
    watermark_show_logo: true,
    watermark_show_brandmark: false,
    watermark_size: 120,
    watermark_spacing: 70,
    watermark_opacity: 4,
    background_light: "#e5e5e5",
    background_dark: "#3c3c3c",
    google_font_url: "",
    font_display: "",
    font_body: "",
  });

  /** Whether Stripe keys are already stored, per the API's write-only flag. */
  const [stripeConfigured, setStripeConfigured] = useState(false);
  /**
   * The webhook endpoint this tenant registers in their Stripe dashboard.
   * Supplied by the API rather than built here: it is the *API's* origin, and
   * `API_URL` is server-only in this app, so the browser cannot construct it.
   */
  const [stripeWebhookUrl, setStripeWebhookUrl] = useState("");

  // Individual image fields tracked separately (each is a single base64 upload)
  const [images, setImages] = useState<Record<string, SystemImageState>>(() =>
    Object.fromEntries(
      SYSTEM_IMAGE_FIELDS.map((field) => [
        field,
        { existing: [], pending: [] },
      ]),
    ),
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Logo-to-assets modal state
  const [showLogoAssetsModal, setShowLogoAssetsModal] = useState(false);
  // Second-step modal: manifest icon background + logo padding.
  const [showManifestOptionsModal, setShowManifestOptionsModal] =
    useState(false);
  const [manifestBackground, setManifestBackground] = useState("#ffffff");
  const [manifestLogoScale, setManifestLogoScale] = useState(80);
  const [generatingAssets, setGeneratingAssets] = useState(false);
  // Incrementing this key forces the derived-field uploaders to re-mount and
  // pick up the newly generated existing images.
  const [derivedImageKey, setDerivedImageKey] = useState(0);

  // Track previous logo pending count to detect new uploads (not removals).
  const prevLogoPendingCountRef = useRef(0);

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
          slogan: data.slogan ?? "",
          video_link: data.video_link ?? "",
          primary_color: data.primary_color ?? "#2196f3",
          secondary_color: data.secondary_color ?? "#e040fb",
          contact_email: data.contact_email ?? "",
          social_links: data.social_links ?? [],
          highlights_bg: data.highlights_bg ?? "",
          highlights_title: data.highlights_title ?? "",
          en_highlights_title: data.en_highlights_title ?? "",
          highlights_subtitle: data.highlights_subtitle ?? "",
          en_highlights_subtitle: data.en_highlights_subtitle ?? "",
          catalog_items_bg: data.catalog_items_bg ?? "",
          hero_video_layout: data.hero_video_layout ?? "default",
          hero_logo_background: data.hero_logo_background ?? "none",
          hero_logo_scale: data.hero_logo_scale ?? 100,
          hero_logo_background_scale: data.hero_logo_background_scale ?? 100,
          hero_overlay_style: data.hero_overlay_style ?? "bottom",
          hero_overlay_opacity: data.hero_overlay_opacity ?? 75,
          hero_overlay_extent: data.hero_overlay_extent ?? 50,
          hero_bottom_divider: data.hero_bottom_divider ?? "none",
          hero_text_frame: data.hero_text_frame ?? false,
          about: data.about ?? "",
          en_about: data.en_about ?? "",
          mission: data.mission ?? "",
          en_mission: data.en_mission ?? "",
          vision: data.vision ?? "",
          en_vision: data.en_vision ?? "",
          privacy_policy: data.privacy_policy ?? "",
          en_privacy_policy: data.en_privacy_policy ?? "",
          terms_and_conditions: data.terms_and_conditions ?? "",
          en_terms_and_conditions: data.en_terms_and_conditions ?? "",
          user_data: data.user_data ?? "",
          en_user_data: data.en_user_data ?? "",
          enabled: data.enabled ?? true,
          stripe_enabled: data.stripe_enabled ?? false,
          stripe_publishable_key: data.stripe_publishable_key ?? "",
          // Not read from `data`: the API never returns them. They stay blank,
          // which the submit handler reads as "leave the stored ones alone".
          stripe_secret_key: "",
          stripe_webhook_secret: "",
          pay_in_store_enabled: data.pay_in_store_enabled ?? false,
          pay_on_delivery_enabled: data.pay_on_delivery_enabled ?? false,
          spotlight_enabled: data.spotlight_enabled ?? true,
          spotlight_label: data.spotlight_label ?? "",
          en_spotlight_label: data.en_spotlight_label ?? "",
          spotlight_title: data.spotlight_title ?? "",
          en_spotlight_title: data.en_spotlight_title ?? "",
          spotlight_text: data.spotlight_text ?? "",
          en_spotlight_text: data.en_spotlight_text ?? "",
          spotlight_button_label: data.spotlight_button_label ?? "",
          en_spotlight_button_label: data.en_spotlight_button_label ?? "",
          spotlight_button_link: data.spotlight_button_link ?? "",
          spotlight_items: data.spotlight_items ?? [],
          watermark_enabled: data.watermark_enabled ?? false,
          watermark_rotation: data.watermark_rotation ?? -12,
          watermark_intercalated: data.watermark_intercalated ?? false,
          watermark_show_logo: data.watermark_show_logo ?? true,
          watermark_show_brandmark: data.watermark_show_brandmark ?? false,
          watermark_size: data.watermark_size ?? 120,
          watermark_spacing: data.watermark_spacing ?? 70,
          watermark_opacity: data.watermark_opacity ?? 4,
          background_light: data.background_light ?? "#e5e5e5",
          background_dark: data.background_dark ?? "#3c3c3c",
          google_font_url: data.google_font_url ?? "",
          font_display: data.font_display ?? "",
          font_body: data.font_body ?? "",
        });
        setStripeConfigured(Boolean(data.stripe_configured));
        setStripeWebhookUrl(String(data.stripe_webhook_url ?? ""));
        // Populate existing images
        setImages((prev) => {
          const next = { ...prev };
          SYSTEM_IMAGE_FIELDS.forEach((field) => {
            const url = data[field];
            next[field] = {
              existing: url ? [{ id: systemId, url: String(url) }] : [],
              pending: [],
            };
          });
          return next;
        });
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  // Detect when a new logo is uploaded and offer to auto-generate derived assets.
  useEffect(() => {
    const count = images.img_logo?.pending.length ?? 0;
    if (count > prevLogoPendingCountRef.current) {
      setShowLogoAssetsModal(true);
    }
    prevLogoPendingCountRef.current = count;
  }, [images.img_logo?.pending.length]);

  /** Generate favicon + manifest icons from the current pending logo. */
  const handleGenerateAssets = async () => {
    const logoBase64 = images.img_logo?.pending[0]?.base64;
    if (!logoBase64) return;

    setGeneratingAssets(true);
    try {
      // The favicon ignores these; only the manifest icons get the background
      // fill and padding (installed PWA icons are cropped into a rounded mask).
      const assets = await logoToAssets(logoBase64, {
        background: manifestBackground,
        logoScale: manifestLogoScale,
      });

      // Build synthetic NewImage entries for each derived field.
      const entries = await Promise.all(
        LOGO_DERIVED_FIELDS.map(async (field) => {
          const dataUrl = assets[field];
          const ext = field === "img_favicon" ? "ico" : "png";
          const file = await dataUrlToFile(dataUrl, `${field}.${ext}`);
          const newImage: NewImage = {
            base64: dataUrl,
            preview: dataUrl,
            file,
          };
          return { field, dataUrl, newImage };
        }),
      );

      setImages((prev) => {
        const next = { ...prev };
        entries.forEach(({ field, dataUrl, newImage }) => {
          next[field] = {
            // Fake existing entry so the uploader shows a preview after re-mount.
            existing: [{ id: -1, url: dataUrl }],
            pending: [newImage],
          };
        });
        return next;
      });

      // Force uploaders for derived fields to re-mount with the new existing images.
      setDerivedImageKey((k) => k + 1);
    } catch {
      setError(t("errorGenerateAssets"));
    } finally {
      setGeneratingAssets(false);
      setShowManifestOptionsModal(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      [
        "video_link",
        "slogan",
        "highlights_bg",
        "catalog_items_bg",
        "contact_email",
      ].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // Drop incomplete social-link rows (no URL) so the API validator, which
      // requires a URL on every entry, doesn't reject the whole save.
      if (Array.isArray(payload.social_links)) {
        payload.social_links = (payload.social_links as SocialLink[]).filter(
          (l) => l && l.url && l.url.trim() !== "",
        );
      }
      // A blank secret means "leave it alone", not "clear it" - the API never
      // sends these back, so the fields load blank on every visit, and
      // submitting "" would wipe the tenant's Stripe keys the first time anyone
      // edited an unrelated field like the slogan. To stop taking payments,
      // switch `stripe_enabled` off; to rotate a key, paste the new one.
      (["stripe_secret_key", "stripe_webhook_secret"] as const).forEach((k) => {
        if (payload[k] === "") delete payload[k];
      });
      // Attach pending images as base64
      Object.entries(images).forEach(([field, state]) => {
        if (state.pending.length > 0) {
          payload[field] = state.pending[0]?.base64;
        } else if (state.existing.length === 0) {
          payload[field] = null;
        }
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
    // round-trips unchanged), and `slogan` has moved into HeroVideoSection,
    // beside the live hero preview.
    {
      key: "video_link",
      label: t("videoLink") ?? "Hero Video Link",
      type: "url",
    },
    {
      key: "primary_color",
      label: t("primaryColor") ?? "Primary Color",
      type: "color",
    },
    {
      key: "secondary_color",
      label: t("secondaryColor") ?? "Secondary Color",
      type: "color",
    },
    {
      key: "highlights_title",
      label: t("highlightsTitle") ?? "Highlights Title (ES)",
    },
    { key: "en_highlights_title", label: "Highlights Title (EN)" },
    {
      key: "highlights_subtitle",
      label: t("highlightsSubtitle") ?? "Highlights Subtitle (ES)",
      type: "textarea",
    },
    {
      key: "en_highlights_subtitle",
      label: "Highlights Subtitle (EN)",
      type: "textarea",
    },
    { key: "about", label: t("about") ?? "About (ES)", type: "textarea" },
    { key: "en_about", label: "About (EN)", type: "textarea" },
    { key: "mission", label: t("mission") ?? "Mission (ES)", type: "textarea" },
    { key: "en_mission", label: "Mission (EN)", type: "textarea" },
    { key: "vision", label: t("vision") ?? "Vision (ES)", type: "textarea" },
    { key: "en_vision", label: "Vision (EN)", type: "textarea" },
    {
      key: "privacy_policy",
      label: t("privacyPolicy") ?? "Privacy Policy (ES)",
      type: "textarea",
    },
    {
      key: "en_privacy_policy",
      label: "Privacy Policy (EN)",
      type: "textarea",
    },
    {
      key: "terms_and_conditions",
      label: t("terms") ?? "Terms & Conditions (ES)",
      type: "textarea",
    },
    {
      key: "en_terms_and_conditions",
      label: "Terms & Conditions (EN)",
      type: "textarea",
    },
    {
      key: "user_data",
      label: t("userData") ?? "User Data Policy (ES)",
      type: "textarea",
    },
    { key: "en_user_data", label: "User Data Policy (EN)", type: "textarea" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
    // The stripe_* fields are deliberately absent: they live in PaymentsSection,
    // which owns their heading, the setup steps and the endpoint URL as one
    // thing. They are still keys in `values`, so handleSubmit is unaffected.
  ];

  /** Shared by both background builders - same strings, same namespace. */
  const gradientLabels = {
    linear: tGb("linear"),
    radial: tGb("radial"),
    solid: tGb("solid"),
    angle: tGb("angle"),
    color: tGb("color"),
    stops: tGb("stops"),
    addStop: tGb("addStop"),
    removeStop: tGb("removeStop"),
    pickColor: tGb("pickColor"),
    opacity: tGb("opacity"),
    rawCss: tGb("rawCss"),
  };

  const handleImageChange = (
    field: string,
    newImages: NewImage[],
    orderedExistingIds: number[],
  ) =>
    setImages((prev) => ({
      ...prev,
      [field]: {
        existing: (prev[field]?.existing ?? []).filter((img) =>
          orderedExistingIds.includes(img.id),
        ),
        pending: newImages,
      },
    }));

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
        slots={[
          {
            // Right after the Highlights pair, before "About": typography (the
            // tenant's fonts, since every preview below renders in them), then
            // hero composition, the watermark/background, then the two
            // section-background
            // builders they relate to - all the site's look-and-feel controls in
            // one run rather than scattered to the bottom of the form - then the
            // Spotlight section, and then Payments, sitting directly above the
            // About group. (AdminForm keys
            // slots by `beforeKey` in a Map, so both blocks share this one
            // "about" node rather than registering two slots for the same key.)
            beforeKey: "about",
            node: (
              <Box flexDirection="column">
                <TypographySection
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                />
                <HeroVideoSection
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                  // Preview the hero logo / background being uploaded right now,
                  // if there is one, so the layout shown is the one that will
                  // ship. No "/logo.png" fallback: this app ships no such file,
                  // so it would preview the profile layout with an empty circle.
                  // With no logo at all the preview simply shows the default
                  // layout, since profile has nothing to put in the circle.
                  logo={
                    images.img_logo_hero?.pending[0]?.preview ??
                    images.img_logo_hero?.existing[0]?.url ??
                    images.img_logo?.pending[0]?.preview ??
                    images.img_logo?.existing[0]?.url
                  }
                  backgroundImage={
                    images.img_hero?.pending[0]?.preview ??
                    images.img_hero?.existing[0]?.url
                  }
                  // The brandmark, if uploaded: shown in the circle atop the
                  // text-frame preview, exactly as the section/detail heroes render it.
                  brandmark={
                    images.img_brandmark?.pending[0]?.preview ??
                    images.img_brandmark?.existing[0]?.url
                  }
                />
                <WatermarkSection
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                  // Preview the logo being uploaded right now, if there is one,
                  // so the pattern shown is the one that will ship after saving.
                  logo={
                    images.img_logo?.pending[0]?.preview ??
                    images.img_logo?.existing[0]?.url ??
                    "/logo.png"
                  }
                  // The brandmark, if one is uploaded: enables the "Use
                  // brandmark" switch and is what the preview tiles when it is on.
                  brandmark={
                    images.img_brandmark?.pending[0]?.preview ??
                    images.img_brandmark?.existing[0]?.url
                  }
                />
                <Grid container spacing={2} paddingTop={32}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <GradientBuilder
                      label={t("catalogBg")}
                      value={String(values.catalog_items_bg ?? "")}
                      onChange={(v) =>
                        setValues((prev) => ({ ...prev, catalog_items_bg: v }))
                      }
                      labels={gradientLabels}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <GradientBuilder
                      label={t("highlightsBg")}
                      value={String(values.highlights_bg ?? "")}
                      onChange={(v) =>
                        setValues((prev) => ({ ...prev, highlights_bg: v }))
                      }
                      labels={gradientLabels}
                    />
                  </Grid>
                </Grid>
                <SpotlightSection
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                  systemId={systemId}
                />
                <ContactSection
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                />
                <Box paddingTop={32}>
                  <PaymentsSection
                    values={values}
                    onChange={(k, v) =>
                      setValues((prev) => ({ ...prev, [k]: v }))
                    }
                    webhookUrl={stripeWebhookUrl}
                    configured={stripeConfigured}
                  />
                </Box>
              </Box>
            ),
          },
        ]}
        imagesSlot={
          <SystemImages
            images={images}
            onImageChange={handleImageChange}
            derivedImageKey={derivedImageKey}
          />
        }
      />

      {showLogoAssetsModal && (
        <ConfirmationModal
          title={t("logoAssetsModalTitle")}
          text={t("logoAssetsModalText")}
          // Confirming here doesn't generate yet - it opens the second modal
          // where the manifest icons' background and padding are chosen.
          okCallback={() => {
            setShowLogoAssetsModal(false);
            setShowManifestOptionsModal(true);
          }}
          cancelCallback={() => setShowLogoAssetsModal(false)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}

      {showManifestOptionsModal && (
        <ManifestAssetsModal
          logo={
            images.img_logo?.pending[0]?.preview ??
            images.img_logo?.existing[0]?.url
          }
          background={manifestBackground}
          onBackgroundChange={setManifestBackground}
          logoScale={manifestLogoScale}
          onLogoScaleChange={setManifestLogoScale}
          generating={generatingAssets}
          okCallback={handleGenerateAssets}
          cancelCallback={() => setShowManifestOptionsModal(false)}
        />
      )}
    </>
  );
}
