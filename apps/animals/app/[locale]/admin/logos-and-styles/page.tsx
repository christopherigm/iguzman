'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { type NewImage } from '@/components/admin-image-uploader/admin-image-uploader';
import { SystemImages, type SystemImageState } from './system-images';
import { WatermarkSection } from './watermark-section';
import { TypographySection } from './typography-section';
import { FramedHeadingSection } from './framed-heading-section';
import { ManifestAssetsModal } from './manifest-assets-modal';
import { LOGO_DERIVED_FIELDS, SYSTEM_IMAGE_FIELDS } from './system-image-fields';
import { getSystem, updateSystem } from '@/lib/admin-api';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import logoToAssets from '@repo/helpers/logo-to-assets';

/**
 * The System fields this page owns and writes. Everything else on the record -
 * the site name, its description pair, the contact details - belongs to
 * /admin/system. The API PATCHes, so a payload of just these keys leaves the
 * rest untouched, which is what keeps the two pages from clobbering each other
 * when both are open.
 */
const OWNED_FIELDS = [
  'primary_color',
  'secondary_color',
  'google_font_url',
  'font_display',
  'font_body',
  'hero_text_frame',
  'watermark_enabled',
  'watermark_rotation',
  'watermark_intercalated',
  'watermark_show_logo',
  'watermark_show_brandmark',
  'watermark_size',
  'watermark_spacing',
  'watermark_opacity',
  'background_light',
  'background_dark',
] as const;

/** Converts a data URI into a synthetic File (what the `NewImage` type wants). */
async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export default function AdminLogosAndStylesPage() {
  const t = useTranslations('Admin');
  const tCommon = useTranslations('Common');

  const [values, setValues] = useState<Record<string, unknown>>({
    primary_color: '#06b6d4',
    secondary_color: '#7c9a3f',
    google_font_url: '',
    font_display: '',
    font_body: '',
    hero_text_frame: false,
    watermark_enabled: false,
    watermark_rotation: -12,
    watermark_intercalated: false,
    watermark_show_logo: true,
    watermark_show_brandmark: false,
    watermark_size: 120,
    watermark_spacing: 70,
    watermark_opacity: 4,
    background_light: '#e5e5e5',
    background_dark: '#3c3c3c',
    // Read-only here: the typography and framed-heading previews render it as
    // their sample heading. Not in OWNED_FIELDS, so it never goes back in a
    // payload - it is edited on /admin/system.
    site_name: '',
  });

  // Each image field is tracked on its own; every one is a single base64 upload.
  const [images, setImages] = useState<Record<string, SystemImageState>>(() =>
    Object.fromEntries(SYSTEM_IMAGE_FIELDS.map((field) => [field, { existing: [], pending: [] }])),
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Logo-to-assets modal state.
  const [showLogoAssetsModal, setShowLogoAssetsModal] = useState(false);
  const [showManifestOptionsModal, setShowManifestOptionsModal] = useState(false);
  const [manifestBackground, setManifestBackground] = useState('#ffffff');
  const [manifestLogoScale, setManifestLogoScale] = useState(80);
  const [generatingAssets, setGeneratingAssets] = useState(false);
  // Incrementing this forces the derived-field uploaders to re-mount and pick up
  // the newly generated previews.
  const [derivedImageKey, setDerivedImageKey] = useState(0);

  // Tracks the previous pending-logo count, so a *new upload* opens the modal
  // and a *removal* does not.
  const prevLogoPendingCountRef = useRef(0);

  useEffect(() => {
    getSystem()
      .then((data) => {
        setValues({
          primary_color: data.primary_color ?? '#06b6d4',
          secondary_color: data.secondary_color ?? '#7c9a3f',
          google_font_url: data.google_font_url ?? '',
          font_display: data.font_display ?? '',
          font_body: data.font_body ?? '',
          hero_text_frame: data.hero_text_frame ?? false,
          watermark_enabled: data.watermark_enabled ?? false,
          watermark_rotation: data.watermark_rotation ?? -12,
          watermark_intercalated: data.watermark_intercalated ?? false,
          watermark_show_logo: data.watermark_show_logo ?? true,
          watermark_show_brandmark: data.watermark_show_brandmark ?? false,
          watermark_size: data.watermark_size ?? 120,
          watermark_spacing: data.watermark_spacing ?? 70,
          watermark_opacity: data.watermark_opacity ?? 4,
          background_light: data.background_light ?? '#e5e5e5',
          background_dark: data.background_dark ?? '#3c3c3c',
          site_name: data.site_name ?? '',
        });
        setImages((prev) => {
          const next = { ...prev };
          SYSTEM_IMAGE_FIELDS.forEach((field) => {
            const url = data[field];
            // `id: 0` is a stand-in: the uploader keys existing images by id and
            // there is exactly one per field, so any stable number will do.
            next[field] = { existing: url ? [{ id: 0, url: String(url) }] : [], pending: [] };
          });
          return next;
        });
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  // Offer to derive the favicon and manifest icons whenever a new logo lands.
  useEffect(() => {
    const count = images.img_logo?.pending.length ?? 0;
    if (count > prevLogoPendingCountRef.current) setShowLogoAssetsModal(true);
    prevLogoPendingCountRef.current = count;
  }, [images.img_logo?.pending.length]);

  /** Generate the favicon + manifest icons from the pending logo. */
  const handleGenerateAssets = async () => {
    const logoBase64 = images.img_logo?.pending[0]?.base64;
    if (!logoBase64) return;

    setGeneratingAssets(true);
    try {
      // The favicon ignores these two: it stays transparent and edge-to-edge.
      // Only the manifest icons get the background fill and the padding, because
      // an installed PWA icon is cropped into a rounded mask.
      const assets = await logoToAssets(logoBase64, {
        background: manifestBackground,
        logoScale: manifestLogoScale,
      });

      const entries = await Promise.all(
        LOGO_DERIVED_FIELDS.map(async (field) => {
          const dataUrl = assets[field];
          const ext = field === 'img_favicon' ? 'ico' : 'png';
          const file = await dataUrlToFile(dataUrl, `${field}.${ext}`);
          return { field, dataUrl, newImage: { base64: dataUrl, preview: dataUrl, file } };
        }),
      );

      setImages((prev) => {
        const next = { ...prev };
        entries.forEach(({ field, dataUrl, newImage }) => {
          next[field] = {
            // A synthetic "existing" entry so the uploader shows a preview after
            // it re-mounts below.
            existing: [{ id: -1, url: dataUrl }],
            pending: [newImage as NewImage],
          };
        });
        return next;
      });

      setDerivedImageKey((k) => k + 1);
    } catch {
      setError(t('errorGenerateAssets'));
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
      // Attach every pending image as base64. An explicitly empty value clears
      // the stored file; omitting the key leaves it alone - which is what makes
      // saving a colour change safe for the images.
      Object.entries(images).forEach(([field, state]) => {
        if (state.pending.length > 0) payload[field] = state.pending[0]?.base64;
        else if (state.existing.length === 0) payload[field] = null;
      });
      await updateSystem(payload);
      setSuccess(t('saved'));
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'primary_color', label: t('primaryColor'), type: 'color' },
    { key: 'secondary_color', label: t('secondaryColor'), type: 'color' },
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

  // What each preview should show: the file being uploaded right now if there is
  // one, else what is stored - so a preview always reflects what will ship.
  const logoPreview =
    images.img_logo?.pending[0]?.preview ?? images.img_logo?.existing[0]?.url ?? '/logo.png';
  const brandmarkPreview =
    images.img_brandmark?.pending[0]?.preview ?? images.img_brandmark?.existing[0]?.url;

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t('loading')}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('home'), href: '/' },
          { label: t('breadcrumbAdmin'), href: '/admin' },
          { label: t('logosAndStyles') },
        ]}
      />
      <AdminForm
        title={t('logosAndStyles')}
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
            // colour pickers below are read against them. Not `imagesSlot`,
            // which AdminForm anchors *after* the first field and would drop
            // the images between the two colour rows.
            beforeKey: 'primary_color',
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
        {/* Below the colours: the fonts first (every preview under them renders
            in those families), then the framed heading, then the watermark and
            the page background it sits on. Each preview reads the brand images
            uploaded above, which is why they belong on this page. */}
        <TypographySection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
        <FramedHeadingSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          brandmark={brandmarkPreview}
        />
        <WatermarkSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          logo={logoPreview}
          brandmark={brandmarkPreview}
        />
      </AdminForm>

      {showLogoAssetsModal && (
        <ConfirmationModal
          title={t('logoAssetsModalTitle')}
          text={t('logoAssetsModalText')}
          // Confirming here does not generate yet - it opens the second modal,
          // where the manifest icons' background and padding are chosen.
          okCallback={() => {
            setShowLogoAssetsModal(false);
            setShowManifestOptionsModal(true);
          }}
          cancelCallback={() => setShowLogoAssetsModal(false)}
          okLabel={tCommon('ok')}
          cancelLabel={tCommon('cancel')}
        />
      )}

      {showManifestOptionsModal && (
        <ManifestAssetsModal
          logo={images.img_logo?.pending[0]?.preview ?? images.img_logo?.existing[0]?.url}
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
