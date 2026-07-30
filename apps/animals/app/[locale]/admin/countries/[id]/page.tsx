'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { countries } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

/**
 * The top of the geography chain, and the shortest form in this CMS alongside the
 * state one: a country is a lookup row, not a content record. No gallery, no
 * icon, no description pair.
 *
 * The one field a country has that a state does not is `code`, its ISO 3166-1
 * alpha-2 identifier. It is **optional but unique**, so an emptied field has to
 * be sent as a cleared value rather than as `""` - the API normalises a blank to
 * null for exactly this reason (two countries saved with `""` would collide), but
 * sending the empty string here would still round-trip through a validator that
 * did not have to run.
 */
export default function AdminCountryFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    code: '',
    enabled: true,
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    if (isNew) return;
    countries
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          code: data.code ?? '',
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
      // `code` is nullable *and* unique on the API, so an emptied field means "no
      // code", not an empty one - the same treatment `/admin/system` gives
      // `contact_email`.
      const payload = {
        ...values,
        code: String(values.code ?? '').trim() === '' ? null : values.code,
      };
      if (isNew) {
        const created = await countries.create(payload);
        setSuccess(t('saved'));
        router.replace(`/admin/countries/${created.id}`);
      } else {
        await countries.update(Number(id), payload);
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
    { key: 'code', label: t('countryCode') },
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
          { label: t('countries'), href: '/admin/countries' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('countries')}` : `${t('edit')} - ${t('countries')}`}
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
