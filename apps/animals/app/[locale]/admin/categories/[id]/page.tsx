'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { PairedImageFields, useEntityImages } from '@/components/admin/entity-images';
import { EntityGalleryField, useEntityGallery } from '@/components/admin/entity-gallery';
import { categories, categoryImages } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { KINDS } from '@/lib/catalog';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminCategoryFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const tKind = useTranslations('Kinds');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    kind: 'animal',
    scientific_name: '',
    short_description: '',
    en_short_description: '',
    description: '',
    en_description: '',
    is_featured: false,
    enabled: true,
  });

  // Only the glyph is a single field now - the photographs are the gallery
  // below, whose first row is what the API publishes as this category's cover.
  const images = useEntityImages(['icon']);
  const gallery = useEntityGallery(categoryImages, isNew ? null : Number(id));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    if (isNew) return;
    categories
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          kind: data.kind ?? 'animal',
          scientific_name: data.scientific_name ?? '',
          short_description: data.short_description ?? '',
          en_short_description: data.en_short_description ?? '',
          description: data.description ?? '',
          en_description: data.en_description ?? '',
          is_featured: data.is_featured ?? false,
          enabled: data.enabled ?? true,
        });
        images.hydrate(data);
      })
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false));
    // `images` is a stable object of refs and setters; re-running on it would
    // re-fetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...values, ...images.payload() };
      // The gallery is written after the row exists: a photo is POSTed to this
      // category's own URL, which one being created does not have until now.
      if (isNew) {
        const created = await categories.create(payload);
        await gallery.persist(created.id as number);
        setSuccess(t('saved'));
        router.replace(`/admin/categories/${created.id}`);
      } else {
        await categories.update(Number(id), payload);
        await gallery.persist(Number(id));
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
    {
      key: 'kind',
      label: t('kind'),
      type: 'select',
      required: true,
      // The five branches are structural - the site has a page per branch - so
      // they are a fixed enum here rather than a lookup, and their labels come
      // from next-intl rather than from the API.
      options: KINDS.map((kind) => ({ value: kind, label: tKind(kind) })),
    },
    {
      key: 'scientific_name',
      label: t('scientificName'),
      placeholder: t('scientificNamePlaceholder'),
    },
    { key: 'short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'en_short_description', label: t('shortDescription'), type: 'textarea' },
    { key: 'description', label: t('description'), type: 'textarea' },
    { key: 'en_description', label: t('description'), type: 'textarea' },
    { key: 'is_featured', label: t('featured'), type: 'boolean' },
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
          { label: t('categories'), href: '/admin/categories' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('categories')}` : `${t('edit')} - ${t('categories')}`}
        editingName={isNew ? undefined : String(values.name ?? '')}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        imagesSlot={
          <EntityGalleryField
            gallery={gallery}
            iconSlot={<PairedImageFields images={images} />}
          />
        }
      />
    </>
  );
}
