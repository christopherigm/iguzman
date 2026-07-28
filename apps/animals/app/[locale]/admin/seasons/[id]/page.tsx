'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { PairedImageFields, useEntityImages } from '@/components/admin/entity-images';
import { MonthPicker } from '../month-picker';
import { seasons } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminSeasonFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    months: [],
    short_description: '',
    en_short_description: '',
    description: '',
    en_description: '',
    enabled: true,
  });

  const images = useEntityImages(['image', 'icon']);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    if (isNew) return;
    seasons
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          months: Array.isArray(data.months) ? data.months : [],
          short_description: data.short_description ?? '',
          en_short_description: data.en_short_description ?? '',
          description: data.description ?? '',
          en_description: data.en_description ?? '',
          enabled: data.enabled ?? true,
        });
        images.hydrate(data);
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...values, ...images.payload() };
      if (isNew) {
        const created = await seasons.create(payload);
        setSuccess(t('saved'));
        router.replace(`/admin/seasons/${created.id}`);
      } else {
        await seasons.update(Number(id), payload);
        setSuccess(t('saved'));
      }
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'name', label: t('name'), required: true },
    { key: 'en_name', label: t('name') },
    { key: 'slug', label: t('slug'), type: 'slug', disabled: true },
    { key: 'short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'en_short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'description', label: t('description'), type: 'textarea' },
    { key: 'en_description', label: t('description'), type: 'textarea' },
    { key: 'enabled', label: t('enabled'), type: 'boolean' },
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
          { label: t('seasons'), href: '/admin/seasons' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('seasons')}` : `${t('edit')} - ${t('seasons')}`}
        editingName={isNew ? undefined : String(values.name ?? '')}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        imagesSlot={<PairedImageFields images={images} />}
        slots={[
          {
            // Above the descriptions, directly under the name pair: the months
            // are what make a season *work* (a sighting with no season picked
            // gets one by matching its date against them), so they must not sit
            // below a scroll of prose.
            beforeKey: 'short_description',
            node: (
              <MonthPicker
                value={(values.months as number[]) ?? []}
                onChange={(months) => setValues((prev) => ({ ...prev, months }))}
              />
            ),
          },
        ]}
      />
    </>
  );
}
