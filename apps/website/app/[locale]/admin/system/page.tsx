"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { type NewImage } from "@/components/admin-image-uploader/admin-image-uploader";
import { SystemImages, type SystemImageState } from "./system-images";
import { PaymentsSection } from "./payments-section";
import { WatermarkSection } from "./watermark-section";
import {
  LOGO_DERIVED_FIELDS,
  SYSTEM_IMAGE_FIELDS,
} from "./system-image-fields";
import { getSystem, updateSystem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { GradientBuilder } from "@repo/ui/core-elements/gradient-builder";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
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
    highlights_bg: "",
    highlights_title: "",
    en_highlights_title: "",
    highlights_subtitle: "",
    en_highlights_subtitle: "",
    catalog_items_bg: "",
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
    watermark_enabled: false,
    watermark_rotation: -12,
    watermark_size: 120,
    watermark_spacing: 70,
    watermark_opacity: 4,
    background_light: "#e5e5e5",
    background_dark: "#3c3c3c",
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
          highlights_bg: data.highlights_bg ?? "",
          highlights_title: data.highlights_title ?? "",
          en_highlights_title: data.en_highlights_title ?? "",
          highlights_subtitle: data.highlights_subtitle ?? "",
          en_highlights_subtitle: data.en_highlights_subtitle ?? "",
          catalog_items_bg: data.catalog_items_bg ?? "",
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
          watermark_enabled: data.watermark_enabled ?? false,
          watermark_rotation: data.watermark_rotation ?? -12,
          watermark_size: data.watermark_size ?? 120,
          watermark_spacing: data.watermark_spacing ?? 70,
          watermark_opacity: data.watermark_opacity ?? 4,
          background_light: data.background_light ?? "#e5e5e5",
          background_dark: data.background_dark ?? "#3c3c3c",
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
      const assets = await logoToAssets(logoBase64);

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
      setShowLogoAssetsModal(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      ["video_link", "slogan", "highlights_bg", "catalog_items_bg"].forEach(
        (k) => {
          if (payload[k] === "") payload[k] = null;
        },
      );
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
    { key: "host", label: t("host") ?? "Host", required: true },
    { key: "slogan", label: t("slogan") ?? "Slogan" },
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
            // Above the site description: connecting Stripe is setup work a new
            // tenant does once and needs to find, not something to scroll past
            // the whole content of the site to reach.
            beforeKey: "site_description",
            node: (
              <PaymentsSection
                values={values}
                onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
                webhookUrl={stripeWebhookUrl}
                configured={stripeConfigured}
              />
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
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <GradientBuilder
              label={t("catalogBg")}
              value={String(values.catalog_items_bg ?? "")}
              onChange={(v) =>
                setValues((prev) => ({ ...prev, catalog_items_bg: v }))
              }
              labels={gradientLabels}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
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
        <WatermarkSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          // Preview the logo being uploaded right now, if there is one, so the
          // pattern shown is the one that will ship after saving.
          logo={
            images.img_logo?.pending[0]?.preview ??
            images.img_logo?.existing[0]?.url ??
            "/logo.png"
          }
        />
      </AdminForm>

      {showLogoAssetsModal && (
        <ConfirmationModal
          title={t("logoAssetsModalTitle")}
          text={t("logoAssetsModalText")}
          okCallback={handleGenerateAssets}
          cancelCallback={() => setShowLogoAssetsModal(false)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        >
          {generatingAssets && (
            <Typography variant="body">{t("generatingAssets")}</Typography>
          )}
        </ConfirmationModal>
      )}
    </>
  );
}
