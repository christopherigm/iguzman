'use client';

import { use, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { PairedImageFields, useEntityImages } from '@/components/admin/entity-images';
import { EntityGalleryField, useEntityGallery } from '@/components/admin/entity-gallery';
import { categories, species, speciesImages } from '@/lib/admin-api';
import { useDerivedSlug } from '@/hooks/use-derived-slug';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminSpeciesFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    category: '',
    scientific_name: '',
    family: '',
    video_link: '',
    short_description: '',
    en_short_description: '',
    description: '',
    en_description: '',
    is_featured: false,
    enabled: true,
  });

  // Only the glyph is a single field now - the photographs are the gallery
  // below, whose first row is what the API publishes as this species' cover.
  const images = useEntityImages(['icon']);
  const gallery = useEntityGallery(speciesImages, isNew ? null : Number(id));
  const [categoryOptions, setCategoryOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useDerivedSlug(isNew, values, setValues);

  useEffect(() => {
    // A species reads its branch through its category, so the picker is the one
    // control that decides which of the five sections it appears in - it is
    // labelled with the branch for exactly that reason.
    categories
      .list()
      .then((rows) =>
        setCategoryOptions(
          rows.map((c) => ({
            value: c.id as number,
            label: `${String(c.name ?? c.id)} · ${String(c.kind_display ?? c.kind ?? '')}`,
          })),
        ),
      )
      .catch(() => {
        /* non-critical: the form still saves, just without a labelled picker */
      });
  }, []);

  useEffect(() => {
    if (isNew) return;
    species
      .get(Number(id))
      .then((data) => {
        setValues({
          name: data.name ?? '',
          en_name: data.en_name ?? '',
          slug: data.slug ?? '',
          category: data.category ?? '',
          scientific_name: data.scientific_name ?? '',
          family: data.family ?? '',
          video_link: data.video_link ?? '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, ...images.payload() };
      // Nullable on the model, and the API's URL validator rejects "" outright -
      // an emptied field means "no video", not an empty string.
      if (payload.video_link === '') payload.video_link = null;
      // The gallery is written after the row exists: a photo is POSTed to this
      // species' own URL, which a record being created does not have until now.
      if (isNew) {
        const created = await species.create(payload);
        await gallery.persist(created.id as number);
        setSuccess(t('saved'));
        router.replace(`/admin/species/${created.id}`);
      } else {
        await species.update(Number(id), payload);
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
      key: 'category',
      label: t('category'),
      type: 'select',
      required: true,
      options: categoryOptions,
      placeholder: t('selectCategory'),
    },
    // Latin, and identical in every locale - deliberately not part of a
    // translated pair.
    { key: 'scientific_name', label: t('scientificName') },
    { key: 'family', label: t('family') },
    { key: 'video_link', label: t('videoLink'), type: 'url' },
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
          { label: t('species'), href: '/admin/species' },
          { label: isNew ? t('newItem') : t('edit') },
        ]}
      />
      <AdminForm
        title={isNew ? `${t('newItem')} - ${t('species')}` : `${t('edit')} - ${t('species')}`}
        editingName={isNew ? undefined : String(values.name ?? '')}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        productionHref={!isNew && values.slug ? `/species/${String(values.slug)}` : undefined}
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
