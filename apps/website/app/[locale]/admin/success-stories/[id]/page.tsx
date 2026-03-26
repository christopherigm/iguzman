'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import {
  AdminImageUploader,
  type NewImage,
} from '@/components/admin-image-uploader/admin-image-uploader';
import {
  getSuccessStory,
  createSuccessStory,
  updateSuccessStory,
  createSuccessStoryImage,
  updateSuccessStoryImage,
  deleteSuccessStoryImage,
  checkSlug,
} from '@/lib/admin-api';
import { buildSlug } from '@/lib/slug-utils';
import { getUserFromToken } from '@/lib/auth';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminSuccessStoryFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    description: '',
    en_description: '',
    short_description: '',
    en_short_description: '',
    href: '',
    enabled: true,
  });
  const [pendingImage, setPendingImage] = useState<NewImage[]>([]);
  const [existingImage, setExistingImage] = useState<
    { id: number; url: string }[]
  >([]);
  const [existingGallery, setExistingGallery] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewGallery, setPendingNewGallery] = useState<NewImage[]>([]);
  const [pendingDeletedGalleryIds, setPendingDeletedGalleryIds] = useState<number[]>([]);
  const [pendingGalleryOrder, setPendingGalleryOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const systemId = getUserFromToken()?.systemId ?? 0;

  // Auto-populate slug from name for new records
  useEffect(() => {
    if (isNew) {
      setValues(prev => ({ ...prev, slug: buildSlug(String(prev.name ?? ''), systemId) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.name, isNew, systemId]);

  const handleNameBlur = useCallback(async () => {
    const currentSlug = String(values.slug ?? '');
    if (!currentSlug) return;
    setSlugError(null);
    try {
      const result = await checkSlug('success-story', currentSlug, !isNew ? Number(id) : undefined);
      if (!result.available) setSlugError(t('slugTaken'));
    } catch { /* ignore */ }
  }, [values.slug, isNew, id, t]);

  useEffect(() => {
    if (!isNew) {
      setLoading(true);
      getSuccessStory(Number(id))
        .then((data) => {
          setValues({
            name: data.name ?? '',
            en_name: data.en_name ?? '',
            slug: data.slug ?? '',
            description: data.description ?? '',
            en_description: data.en_description ?? '',
            short_description: data.short_description ?? '',
            en_short_description: data.en_short_description ?? '',
            href: data.href ?? '',
            enabled: data.enabled ?? true,
          });
          if (data.image)
            setExistingImage([{ id: Number(id), url: String(data.image) }]);
          const imgs = ((data.images as Record<string, unknown>[] ?? [])).map(i => ({
            id: i.id as number,
            url: String(i.image ?? ''),
            sort_order: i.sort_order as number,
          }));
          setExistingGallery(imgs);
        })
        .catch(() => setError(t('errorLoad')))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      if (!payload.href) delete payload.href;
      if (!payload.slug) delete payload.slug;
      if (pendingImage.length > 0) payload.image = pendingImage?.[0]?.base64;

      let storyId: number;
      if (isNew) {
        const c = await createSuccessStory(payload);
        storyId = c.id as number;
      } else {
        await updateSuccessStory(Number(id), payload);
        storyId = Number(id);
      }

      // Handle deleted gallery images
      for (const imgId of pendingDeletedGalleryIds) {
        await deleteSuccessStoryImage(storyId, imgId).catch(() => null);
      }
      // Handle new gallery images
      for (let i = 0; i < pendingNewGallery.length; i++) {
        await createSuccessStoryImage(storyId, {
          image: pendingNewGallery?.[i]?.base64,
          sort_order: pendingGalleryOrder.length + i,
        }).catch(() => null);
      }
      // Update sort orders for existing gallery images
      for (let i = 0; i < pendingGalleryOrder.length; i++) {
        await updateSuccessStoryImage(storyId, pendingGalleryOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t('saved'));
      if (isNew) router.replace(`/admin/success-stories/${storyId}`);
    } catch {
      setError(t('errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: 'name', label: t('name'), required: true, onBlur: handleNameBlur },
    { key: 'en_name', label: 'Name (EN)' },
    { key: 'slug', label: 'Slug', type: 'slug', disabled: true, fieldError: slugError },
    { key: 'href', label: t('link') ?? 'Link', type: 'url' },
    {
      key: 'short_description',
      label: t('shortDescription') ?? 'Short Description (ES)',
      type: 'textarea',
    },
    {
      key: 'en_short_description',
      label: 'Short Description (EN)',
      type: 'textarea',
    },
    {
      key: 'description',
      label: t('description') ?? 'Description (ES)',
      type: 'textarea',
    },
    { key: 'en_description', label: 'Description (EN)', type: 'textarea' },
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
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('successStories'), href: '/admin/success-stories' }, { label: isNew ? t('newItem') : t('edit') }]} />
      <AdminForm
      title={
        isNew
          ? `${t('newItem')} — ${t('successStories')}`
          : `${t('edit')} — ${t('successStories')}`
      }
      fields={fields}
      values={values}
      onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      success={success}
    >
      <Box display="flex" flexDirection="column" gap="8px">
        <Typography variant="label">
          {t('coverImage') ?? 'Cover Image'}
        </Typography>
        <AdminImageUploader
          existingImages={existingImage}
          onChange={(n) => setPendingImage(n)}
          maxImages={1}
        />
      </Box>
      <Box display="flex" flexDirection="column" gap="8px">
        <Typography variant="label">{t('images') ?? 'Gallery Images'}</Typography>
        <AdminImageUploader
          existingImages={existingGallery}
          onChange={(n, d, o) => {
            setPendingNewGallery(n);
            setPendingDeletedGalleryIds(d);
            setPendingGalleryOrder(o);
          }}
          maxImages={20}
        />
      </Box>
    </AdminForm>
    </>
  );
}
