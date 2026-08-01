'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { ContactSection, type SocialLink } from './contact-section';
import { VideoSection } from './video-section';
import { MapSection } from './map-section';
import { BackupSection } from './backup-section';
import { RestoreSection } from './restore-section';
import { getSystem, updateSystem } from '@/lib/admin-api';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

/**
 * The System fields this page owns and writes. The brand kit - every image, the
 * palette, the fonts, the watermark - belongs to /admin/logos-and-styles. The
 * API PATCHes, so a payload of just these keys leaves the rest untouched, which
 * is what keeps the two pages from clobbering each other when both are open.
 */
const OWNED_FIELDS = [
  'site_name',
  'site_description',
  'en_site_description',
  'contact_email',
  'social_links',
  // How an uploaded clip is re-encoded. Here rather than on the brand-kit page
  // because it is a property of the site's operation, not of how it looks.
  'video_max_height',
  'video_quality',
  'video_codec',
  // Which basemap every map on the site draws. Here rather than on the brand-kit
  // page for the same reason as the video keys: it is how the site operates, not
  // how it looks.
  'map_style',
  'map_tile_url',
  'map_attribution',
  'map_attribution_url',
] as const;

export default function AdminSystemPage() {
  const t = useTranslations('Admin');

  const [values, setValues] = useState<Record<string, unknown>>({
    site_name: '',
    site_description: '',
    en_site_description: '',
    contact_email: '',
    social_links: [],
    // Matching the model's own defaults, so the controls render sensibly for the
    // moment before the API answers rather than snapping from blank.
    video_max_height: 1080,
    video_quality: 23,
    video_codec: 'h264',
    map_style: 'osm',
    map_tile_url: '',
    map_attribution: '',
    map_attribution_url: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    getSystem()
      .then((data) => {
        setValues({
          site_name: data.site_name ?? '',
          site_description: data.site_description ?? '',
          en_site_description: data.en_site_description ?? '',
          contact_email: data.contact_email ?? '',
          social_links: data.social_links ?? [],
          video_max_height: data.video_max_height ?? 1080,
          video_quality: data.video_quality ?? 23,
          video_codec: data.video_codec ?? 'h264',
          map_style: data.map_style ?? 'osm',
          map_tile_url: data.map_tile_url ?? '',
          map_attribution: data.map_attribution ?? '',
          map_attribution_url: data.map_attribution_url ?? '',
        });
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      // The column is nullable and the API's email validator rejects "" - an
      // emptied field means "no contact address", not an empty one.
      if (payload.contact_email === '') payload.contact_email = null;
      // Drop half-filled social rows: the API requires a URL on every entry, so
      // one blank row would otherwise reject the whole save.
      if (Array.isArray(payload.social_links)) {
        payload.social_links = (payload.social_links as SocialLink[]).filter(
          (l) => l && l.url && l.url.trim() !== '',
        );
      }
      await updateSystem(payload);
      setSuccess(t('saved'));
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'site_name', label: t('siteName'), required: true },
    // A pair, so AdminForm groups the two under one heading and offers the
    // translate button between them.
    { key: 'site_description', label: t('siteDescription'), type: 'textarea' },
    { key: 'en_site_description', label: t('siteDescription'), type: 'textarea' },
  ];

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
          { label: t('system') },
        ]}
      />
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
        {/* `children` rather than a `beforeKey` slot: contact is the last thing
            on the form and there is no field below it to anchor above. */}
        <ContactSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />

        {/* Inside the form, unlike Backup and Restore below: these are ordinary
            System keys saved by the form's own button, not a separate action. */}
        <VideoSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />

        <MapSection
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
      </AdminForm>

      {/* Backup and Restore sit OUTSIDE the AdminForm, not as `children` of it
          like ContactSection. They own their own requests and their own buttons;
          nested, the backup-name input's Enter key would save the System form
          instead of starting the backup. */}
      <BackupSection />
      <RestoreSection />
    </>
  );
}
