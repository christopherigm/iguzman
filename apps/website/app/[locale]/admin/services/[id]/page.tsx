'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { useRouter } from '@repo/i18n/navigation';
import { AdminForm, type FieldDef } from '@/components/admin/admin-form';
import { AdminImageUploader, type NewImage } from '@/components/admin-image-uploader/admin-image-uploader';
import {
  getService, createService, updateService,
  listServiceImages, createServiceImage, deleteServiceImage, updateServiceImage,
  listServiceCategories, listBrands, checkSlug,
} from '@/lib/admin-api';
import { buildSlug } from '@/lib/slug-utils';
import { getUserFromToken } from '@/lib/auth';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'MXN', label: 'MXN' },
  { value: 'GBP', label: 'GBP' }, { value: 'CAD', label: 'CAD' }, { value: 'BRL', label: 'BRL' },
];
const MODALITY_OPTIONS = [
  { value: 'online', label: 'Online' }, { value: 'in_person', label: 'In Person' }, { value: 'hybrid', label: 'Hybrid' },
];

export default function AdminServiceFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '', en_name: '', slug: '', sku: '',
    description: '', en_description: '', short_description: '', en_short_description: '',
    price: '0.00', compare_price: '', cost_price: '', currency: 'USD',
    category: '', brand: '',
    duration: '', modality: 'in_person',
    is_featured: false, enabled: true, href: '',
  });
  const [existingImages, setExistingImages] = useState<{ id: number; url: string; sort_order?: number }[]>([]);
  const [pendingNewImages, setPendingNewImages] = useState<NewImage[]>([]);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<number[]>([]);
  const [pendingOrder, setPendingOrder] = useState<number[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string | number; label: string }[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ value: string | number; label: string }[]>([]);
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
      const result = await checkSlug('service', currentSlug, !isNew ? Number(id) : undefined);
      if (!result.available) setSlugError(t('slugTaken'));
    } catch { /* ignore */ }
  }, [values.slug, isNew, id, t]);

  const loadMeta = useCallback(async () => {
    try {
      const [cats, brands] = await Promise.all([listServiceCategories(systemId), listBrands(systemId)]);
      setCategoryOptions(cats.map(c => ({ value: c.id as number, label: String(c.name ?? c.id) })));
      setBrandOptions(brands.map(b => ({ value: b.id as number, label: String(b.name ?? b.id) })));
    } catch { /* non-critical */ }
  }, [systemId]);

  useEffect(() => {
    loadMeta();
    if (!isNew) {
      setLoading(true);
      Promise.all([getService(Number(id)), listServiceImages(Number(id))])
        .then(([data, images]) => {
          setValues({
            name: data.name ?? '', en_name: data.en_name ?? '', slug: data.slug ?? '', sku: data.sku ?? '',
            description: data.description ?? '', en_description: data.en_description ?? '',
            short_description: data.short_description ?? '', en_short_description: data.en_short_description ?? '',
            price: data.price ?? '0.00', compare_price: data.compare_price ?? '',
            cost_price: data.cost_price ?? '', currency: data.currency ?? 'USD',
            category: data.category ?? '', brand: data.brand ?? '',
            duration: data.duration ?? '', modality: data.modality ?? 'in_person',
            is_featured: data.is_featured ?? false, enabled: data.enabled ?? true, href: data.href ?? '',
          });
          const imgs = (images as Record<string, unknown>[]).map(i => ({
            id: i.id as number, url: String(i.image ?? ''), sort_order: i.sort_order as number,
          }));
          setExistingImages(imgs);
        }).catch(() => setError(t('errorLoad'))).finally(() => setLoading(false));
    }
  }, [id, isNew, loadMeta, t]);

  const handleSubmit = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      ['compare_price', 'cost_price', 'sku', 'href', 'duration'].forEach(k => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });
      if (payload.category === '') delete payload.category;
      if (payload.brand === '') delete payload.brand;

      let serviceId: number;
      if (isNew) {
        const created = await createService(payload);
        serviceId = created.id as number;
      } else {
        await updateService(Number(id), payload);
        serviceId = Number(id);
      }
      // Handle deleted images
      for (const imgId of pendingDeletedIds) {
        await deleteServiceImage(serviceId, imgId).catch(() => null);
      }
      // Handle new images
      for (let i = 0; i < pendingNewImages.length; i++) {
        await createServiceImage(serviceId, {
          image: pendingNewImages?.[i]?.base64,
          sort_order: pendingOrder.length + i,
        }).catch(() => null);
      }
      // Update sort orders for existing
      for (let i = 0; i < pendingOrder.length; i++) {
        await updateServiceImage(serviceId, pendingOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t('saved'));
      if (isNew) router.replace(`/admin/services/${serviceId}`);
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
    { key: 'sku', label: 'SKU' },
    { key: 'category', label: t('category') ?? 'Category', type: 'select', options: categoryOptions, placeholder: '— None —' },
    { key: 'brand', label: t('brand') ?? 'Brand', type: 'select', options: brandOptions, placeholder: '— None —' },
    { key: 'price', label: t('price') ?? 'Price', type: 'number' },
    { key: 'compare_price', label: t('comparePrice') ?? 'Compare Price', type: 'number' },
    { key: 'cost_price', label: t('costPrice') ?? 'Cost Price', type: 'number' },
    { key: 'currency', label: t('currency') ?? 'Currency', type: 'select', options: CURRENCY_OPTIONS },
    { key: 'duration', label: t('duration') ?? 'Duration (min)', type: 'number' },
    { key: 'modality', label: t('modality') ?? 'Modality', type: 'select', options: MODALITY_OPTIONS },
    { key: 'href', label: t('link') ?? 'Link', type: 'url' },
    { key: 'description', label: t('description') ?? 'Description (ES)', type: 'textarea' },
    { key: 'en_description', label: 'Description (EN)', type: 'textarea' },
    { key: 'short_description', label: t('shortDescription') ?? 'Short Description (ES)', type: 'textarea' },
    { key: 'en_short_description', label: 'Short Description (EN)', type: 'textarea' },
    { key: 'is_featured', label: t('featured') ?? 'Featured', type: 'boolean' },
    { key: 'enabled', label: t('enabled'), type: 'boolean' },
  ];

  if (loading) return <Box padding="24px"><Typography variant="body">{t('loading')}</Typography></Box>;

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('services'), href: '/admin/services' }, { label: isNew ? t('newItem') : t('edit') }]} />
      <AdminForm
      title={isNew ? `${t('newItem')} — ${t('services')}` : `${t('edit')} — ${t('services')}`}
      fields={fields}
      values={values}
      onChange={(k, v) => setValues(prev => ({ ...prev, [k]: v }))}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      success={success}
    >
      <Box display="flex" flexDirection="column" gap="8px">
        <Typography variant="label">{t('images') ?? 'Images'}</Typography>
        <AdminImageUploader
          existingImages={existingImages}
          onChange={(n, d, o) => { setPendingNewImages(n); setPendingDeletedIds(d); setPendingOrder(o); }}
          maxImages={10}
        />
      </Box>
    </AdminForm>
    </>
  );
}
