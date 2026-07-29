'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { counties, states } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

/**
 * A county is a lookup row like a state, with one field that matters: the state
 * it belongs to. That FK is **required** on the API - a bare "León" cannot say
 * which of two it is - so unlike every other relation in this CMS it has no
 * "none" option.
 */
export default function AdminCountyFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    state: '',
    enabled: true,
  });

  const [stateOptions, setStateOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    states
      .list()
      .then((rows) =>
        setStateOptions(
          rows.map((row) => ({ value: row.id as number, label: String(row.name ?? row.id) })),
        ),
      )
      .catch(() => {
        /* non-critical: the form still saves, just without a labelled picker */
      });
  }, []);

  useEffect(() => {
    if (isNew) return;
    counties
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          state: data.state ?? '',
          enabled: data.enabled ?? true,
        });
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isNew) {
        const created = await counties.create(values);
        setSuccess(t('saved'));
        router.replace(`/admin/counties/${created.id}`);
      } else {
        await counties.update(Number(id), values);
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
    // No `placeholder`, unlike every other relation picker here: the API refuses
    // a county with no state, so "none" is not a choice to offer.
    {
      key: 'state',
      label: t('state'),
      type: 'select',
      required: true,
      options: stateOptions,
    },
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
          { label: t('counties'), href: '/admin/counties' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('counties')}` : `${t('edit')} - ${t('counties')}`}
        editingName={isNew ? undefined : String(values.name ?? '')}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
      />
    </>
  );
}
