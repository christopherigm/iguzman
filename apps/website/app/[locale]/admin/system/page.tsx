'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import {
  AdminImageUploader,
  type NewImage,
} from '@/components/admin-image-uploader/admin-image-uploader';
import { getSystem, updateSystem } from '@/lib/admin-api';
import { getUserFromToken } from '@/lib/auth';
import { GradientBuilder } from '@repo/ui/core-elements/gradient-builder';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

export default function AdminSystemPage() {
  const t = useTranslations('Admin');
  const tGb = useTranslations('GradientBuilder');

  const [values, setValues] = useState<Record<string, unknown>>({
    site_name: '',
    host: '',
    slogan: '',
    video_link: '',
    primary_color: '#2196f3',
    secondary_color: '#e040fb',
    highlights_bg: '',
    highlights_title: '',
    highlights_en_title: '',
    highlights_subtitle: '',
    highlights_en_subtitle: '',
    catalog_items_bg: '',
    about: '',
    en_about: '',
    mission: '',
    en_mission: '',
    vision: '',
    en_vision: '',
    privacy_policy: '',
    en_privacy_policy: '',
    terms_and_conditions: '',
    en_terms_and_conditions: '',
    user_data: '',
    en_user_data: '',
    enabled: true,
  });

  // Individual image fields tracked separately (each is a single base64 upload)
  const [images, setImages] = useState<
    Record<
      string,
      { existing: { id: number; url: string }[]; pending: NewImage[] }
    >
  >({
    img_logo: { existing: [], pending: [] },
    img_logo_hero: { existing: [], pending: [] },
    img_favicon: { existing: [], pending: [] },
    img_hero: { existing: [], pending: [] },
    img_about: { existing: [], pending: [] },
    img_manifest_1080: { existing: [], pending: [] },
    img_manifest_512: { existing: [], pending: [] },
    img_manifest_256: { existing: [], pending: [] },
    img_manifest_128: { existing: [], pending: [] },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const systemId = getUserFromToken()?.systemId ?? 0;

  useEffect(() => {
    if (!systemId) return;
    setLoading(true);
    getSystem(systemId)
      .then((data) => {
        setValues({
          site_name: data.site_name ?? '',
          host: data.host ?? '',
          slogan: data.slogan ?? '',
          video_link: data.video_link ?? '',
          primary_color: data.primary_color ?? '#2196f3',
          secondary_color: data.secondary_color ?? '#e040fb',
          highlights_bg: data.highlights_bg ?? '',
          highlights_title: data.highlights_title ?? '',
          highlights_en_title: data.highlights_en_title ?? '',
          highlights_subtitle: data.highlights_subtitle ?? '',
          highlights_en_subtitle: data.highlights_en_subtitle ?? '',
          catalog_items_bg: data.catalog_items_bg ?? '',
          about: data.about ?? '',
          en_about: data.en_about ?? '',
          mission: data.mission ?? '',
          en_mission: data.en_mission ?? '',
          vision: data.vision ?? '',
          en_vision: data.en_vision ?? '',
          privacy_policy: data.privacy_policy ?? '',
          en_privacy_policy: data.en_privacy_policy ?? '',
          terms_and_conditions: data.terms_and_conditions ?? '',
          en_terms_and_conditions: data.en_terms_and_conditions ?? '',
          user_data: data.user_data ?? '',
          en_user_data: data.en_user_data ?? '',
          enabled: data.enabled ?? true,
        });
        // Populate existing images
        const imageFields = [
          'img_logo',
          'img_logo_hero',
          'img_favicon',
          'img_hero',
          'img_about',
          'img_manifest_1080',
          'img_manifest_512',
          'img_manifest_256',
          'img_manifest_128',
        ] as const;
        setImages((prev) => {
          const next = { ...prev };
          imageFields.forEach((field) => {
            const url = data[field];
            next[field] = {
              existing: url ? [{ id: systemId, url: String(url) }] : [],
              pending: [],
            };
          });
          return next;
        });
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      ['video_link', 'slogan', 'highlights_bg', 'catalog_items_bg'].forEach(
        (k) => {
          if (payload[k] === '') payload[k] = null;
        },
      );
      // Attach pending images as base64
      Object.entries(images).forEach(([field, state]) => {
        if (state.pending.length > 0)
          payload[field] = state.pending?.[0]?.base64;
      });
      await updateSystem(systemId, payload);
      setSuccess(t('saved'));
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'site_name', label: t('siteName') ?? 'Site Name', required: true },
    { key: 'host', label: t('host') ?? 'Host', required: true },
    { key: 'slogan', label: t('slogan') ?? 'Slogan' },
    {
      key: 'video_link',
      label: t('videoLink') ?? 'Hero Video Link',
      type: 'url',
    },
    {
      key: 'primary_color',
      label: t('primaryColor') ?? 'Primary Color',
      type: 'color',
    },
    {
      key: 'secondary_color',
      label: t('secondaryColor') ?? 'Secondary Color',
      type: 'color',
    },
    {
      key: 'highlights_title',
      label: t('highlightsTitle') ?? 'Highlights Title (ES)',
    },
    { key: 'highlights_en_title', label: 'Highlights Title (EN)' },
    {
      key: 'highlights_subtitle',
      label: t('highlightsSubtitle') ?? 'Highlights Subtitle (ES)',
      type: 'textarea',
    },
    {
      key: 'highlights_en_subtitle',
      label: 'Highlights Subtitle (EN)',
      type: 'textarea',
    },
    { key: 'about', label: t('about') ?? 'About (ES)', type: 'textarea' },
    { key: 'en_about', label: 'About (EN)', type: 'textarea' },
    { key: 'mission', label: t('mission') ?? 'Mission (ES)', type: 'textarea' },
    { key: 'en_mission', label: 'Mission (EN)', type: 'textarea' },
    { key: 'vision', label: t('vision') ?? 'Vision (ES)', type: 'textarea' },
    { key: 'en_vision', label: 'Vision (EN)', type: 'textarea' },
    {
      key: 'privacy_policy',
      label: t('privacyPolicy') ?? 'Privacy Policy (ES)',
      type: 'textarea',
    },
    {
      key: 'en_privacy_policy',
      label: 'Privacy Policy (EN)',
      type: 'textarea',
    },
    {
      key: 'terms_and_conditions',
      label: t('terms') ?? 'Terms & Conditions (ES)',
      type: 'textarea',
    },
    {
      key: 'en_terms_and_conditions',
      label: 'Terms & Conditions (EN)',
      type: 'textarea',
    },
    {
      key: 'user_data',
      label: t('userData') ?? 'User Data Policy (ES)',
      type: 'textarea',
    },
    { key: 'en_user_data', label: 'User Data Policy (EN)', type: 'textarea' },
    { key: 'enabled', label: t('enabled'), type: 'boolean' },
  ];

  const IMAGE_LABELS: Record<string, string> = {
    img_logo: 'Logo',
    img_logo_hero: 'Logo (Hero)',
    img_favicon: 'Favicon',
    img_hero: 'Hero Image',
    img_about: 'About Image',
    img_manifest_1080: 'Manifest 1080×',
    img_manifest_512: 'Manifest 512×',
    img_manifest_256: 'Manifest 256×',
    img_manifest_128: 'Manifest 128×',
  };

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t('loading')}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('system') }]} />
      <AdminForm
      title={t('system')}
      hideCancel
      fields={fields}
      values={values}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      success={success}
    >
      <GradientBuilder
        label={t('highlightsBg')}
        value={String(values.highlights_bg ?? '')}
        onChange={(v) => setValues((prev) => ({ ...prev, highlights_bg: v }))}
        labels={{
          linear: tGb('linear'),
          radial: tGb('radial'),
          solid: tGb('solid'),
          angle: tGb('angle'),
          color: tGb('color'),
          stops: tGb('stops'),
          addStop: tGb('addStop'),
          removeStop: tGb('removeStop'),
          pickColor: tGb('pickColor'),
          rawCss: tGb('rawCss'),
        }}
      />
      <GradientBuilder
        label={t('catalogBg')}
        value={String(values.catalog_items_bg ?? '')}
        onChange={(v) => setValues((prev) => ({ ...prev, catalog_items_bg: v }))}
        labels={{
          linear: tGb('linear'),
          radial: tGb('radial'),
          solid: tGb('solid'),
          angle: tGb('angle'),
          color: tGb('color'),
          stops: tGb('stops'),
          addStop: tGb('addStop'),
          removeStop: tGb('removeStop'),
          pickColor: tGb('pickColor'),
          rawCss: tGb('rawCss'),
        }}
      />
      {Object.entries(images).map(([field, state]) => (
        <Box key={field} display="flex" flexDirection="column" gap="8px">
          <Typography variant="label">
            {IMAGE_LABELS[field] ?? field}
          </Typography>
          <AdminImageUploader
            existingImages={state.existing}
            onChange={(n) =>
              setImages((prev) => ({
                ...prev,
                [field]: { existing: prev[field]?.existing ?? [], pending: n },
              }))
            }
            maxImages={1}
          />
        </Box>
      ))}
    </AdminForm>
    </>
  );
}
