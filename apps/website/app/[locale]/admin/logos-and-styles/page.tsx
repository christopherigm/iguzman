"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { type NewImage } from "@/components/admin-image-uploader/admin-image-uploader";
import { SystemImages, type SystemImageState } from "./system-images";
import { WatermarkSection } from "./watermark-section";
import { TypographySection } from "./typography-section";
import { HeroVideoSection } from "./hero-video-section";
import { ManifestAssetsModal } from "./manifest-assets-modal";
import {
  LOGO_DERIVED_FIELDS,
  SYSTEM_IMAGE_FIELDS,
} from "./system-image-fields";
import { getSystem, updateSystem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import logoToAssets from "@repo/helpers/logo-to-assets";

/**
 * The System fields this page owns and writes. Everything else on the record
 * belongs to /admin/system; the API PATCHes, so a payload of just these keys
 * leaves the rest untouched - which is what keeps the two pages from clobbering
 * each other when both are open.
 */
const OWNED_FIELDS = [
  "primary_color",
  "secondary_color",
  // The hero composition. `video_link` and `slogan` are edited inside
  // HeroVideoSection rather than in the field list, beside the live preview.
  "video_link",
  "slogan",
  "hero_video_layout",
  "hero_logo_background",
  "hero_logo_scale",
  "hero_logo_background_scale",
  "hero_overlay_style",
  "hero_overlay_opacity",
  "hero_overlay_extent",
  "hero_bottom_divider",
  "hero_bottom_divider_elevation",
  "hero_text_frame",
  "watermark_enabled",
  "watermark_rotation",
  "watermark_intercalated",
  "watermark_show_logo",
  "watermark_show_brandmark",
  "watermark_size",
  "watermark_spacing",
  "watermark_opacity",
  "background_light",
  "background_dark",
  "google_font_url",
  "font_display",
  "font_body",
] as const;

/** Converts a data URI to a synthetic File object (required by NewImage type). */
async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export default function AdminLogosAndStylesPage() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [values, setValues] = useState<Record<string, unknown>>({
    primary_color: "#2196f3",
    secondary_color: "#e040fb",
    video_link: "",
    slogan: "",
    hero_video_layout: "default",
    hero_logo_background: "none",
    hero_logo_scale: 100,
    hero_logo_background_scale: 100,
    hero_overlay_style: "bottom",
    hero_overlay_opacity: 75,
    hero_overlay_extent: 50,
    hero_bottom_divider: "none",
    hero_bottom_divider_elevation: 10,
    hero_text_frame: false,
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
    // Read-only here: the typography preview renders it as the sample heading,
    // and the hero preview uses it as the logo's alt text. Not in OWNED_FIELDS,
    // so it never goes back in a payload - it is edited on /admin/system.
    site_name: "",
  });

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
          primary_color: data.primary_color ?? "#2196f3",
          secondary_color: data.secondary_color ?? "#e040fb",
          video_link: data.video_link ?? "",
          slogan: data.slogan ?? "",
          hero_video_layout: data.hero_video_layout ?? "default",
          hero_logo_background: data.hero_logo_background ?? "none",
          hero_logo_scale: data.hero_logo_scale ?? 100,
          hero_logo_background_scale: data.hero_logo_background_scale ?? 100,
          hero_overlay_style: data.hero_overlay_style ?? "bottom",
          hero_overlay_opacity: data.hero_overlay_opacity ?? 75,
          hero_overlay_extent: data.hero_overlay_extent ?? 50,
          hero_bottom_divider: data.hero_bottom_divider ?? "none",
          hero_bottom_divider_elevation:
            data.hero_bottom_divider_elevation ?? 10,
          hero_text_frame: data.hero_text_frame ?? false,
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
          site_name: data.site_name ?? "",
        });
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
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      // Both are nullable on the model, and the API's URL validator rejects ""
      // outright - an emptied field means "no video" / "no slogan", not "".
      (["video_link", "slogan"] as const).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
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
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
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
  ];

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
          { label: t("logosAndStyles") },
        ]}
      />
      <AdminForm
        title={t("logosAndStyles")}
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
            // The uploaders lead the page - they are its subject, and both
            // colour pickers below read against them. Not `imagesSlot`, which
            // AdminForm anchors *after* the first field and would drop the
            // images between the primary and secondary colour rows.
            beforeKey: "primary_color",
            node: (
              <Box flexDirection="column" gap={16} paddingBottom={16}>
                <SystemImages
                  images={images}
                  onImageChange={handleImageChange}
                  derivedImageKey={derivedImageKey}
                />
              </Box>
            ),
          },
        ]}
      >
        {/* Below the colour fields: the tenant's fonts first (every preview
            under them renders in those families), then the hero composition,
            then the watermark and the page background it sits on. Each preview
            reads the brand images uploaded above, which is why they belong on
            this page rather than with the site's content. */}
        <TypographySection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
        <HeroVideoSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          // Preview the hero logo / background being uploaded right now, if
          // there is one, so the layout shown is the one that will ship. No
          // "/logo.png" fallback: this app ships no such file, so it would
          // preview the profile layout with an empty circle. With no logo at
          // all the preview simply shows the default layout, since profile has
          // nothing to put in the circle.
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
          // The brandmark, if uploaded: shown in the circle atop the text-frame
          // preview, exactly as the section/detail heroes render it.
          brandmark={
            images.img_brandmark?.pending[0]?.preview ??
            images.img_brandmark?.existing[0]?.url
          }
        />
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
          // The brandmark, if one is uploaded: enables the "Use brandmark"
          // switch and is what the preview tiles when it is on.
          brandmark={
            images.img_brandmark?.pending[0]?.preview ??
            images.img_brandmark?.existing[0]?.url
          }
        />
      </AdminForm>

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
