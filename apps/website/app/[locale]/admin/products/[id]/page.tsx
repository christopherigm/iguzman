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
  getProduct,
  createProduct,
  updateProduct,
  listProductImages,
  createProductImage,
  deleteProductImage,
  updateProductImage,
  listProductCategories,
  listBrands,
  checkSlug,
} from '@/lib/admin-api';
import { buildSlug } from '@/lib/slug-utils';
import { getUserFromToken } from '@/lib/auth';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Breadcrumbs } from '@repo/ui/core-elements/breadcrumbs';

type Props = { params: Promise<{ locale: string; id: string }> };

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'MXN', label: 'MXN' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CAD', label: 'CAD' },
  { value: 'BRL', label: 'BRL' },
];

const DIM_UNIT_OPTIONS = [
  { value: 'cm', label: 'cm' },
  { value: 'in', label: 'in' },
  { value: 'm', label: 'm' },
  { value: 'mm', label: 'mm' },
];

const WEIGHT_UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
  { value: 'g', label: 'g' },
  { value: 'oz', label: 'oz' },
];

export default function AdminProductFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === 'new';
  const t = useTranslations('Admin');
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: '',
    en_name: '',
    slug: '',
    sku: '',
    barcode: '',
    description: '',
    en_description: '',
    short_description: '',
    en_short_description: '',
    price: '0.00',
    compare_price: '',
    cost_price: '',
    currency: 'USD',
    category: '',
    brand: '',
    system: '',
    in_stock: true,
    is_featured: false,
    enabled: true,
    stock_count: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    dimension_unit: 'cm',
    weight_unit: 'kg',
    href: '',
  });

  const [existingImages, setExistingImages] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewImages, setPendingNewImages] = useState<NewImage[]>([]);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<number[]>([]);
  const [pendingOrder, setPendingOrder] = useState<number[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  const [brandOptions, setBrandOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
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
      const result = await checkSlug('product', currentSlug, !isNew ? Number(id) : undefined);
      if (!result.available) setSlugError(t('slugTaken'));
    } catch { /* ignore */ }
  }, [values.slug, isNew, id, t]);

  const loadMeta = useCallback(async () => {
    try {
      const [cats, brands] = await Promise.all([
        listProductCategories(systemId),
        listBrands(systemId),
      ]);
      setCategoryOptions(
        cats.map((c) => ({
          value: c.id as number,
          label: String(c.name ?? c.id),
        })),
      );
      setBrandOptions(
        brands.map((b) => ({
          value: b.id as number,
          label: String(b.name ?? b.id),
        })),
      );
    } catch {
      /* non-critical */
    }
  }, [systemId]);

  useEffect(() => {
    loadMeta();
    if (!isNew) {
      setLoading(true);
      Promise.all([getProduct(Number(id)), listProductImages(Number(id))])
        .then(([product, images]) => {
          setValues({
            name: product.name ?? '',
            en_name: product.en_name ?? '',
            slug: product.slug ?? '',
            sku: product.sku ?? '',
            barcode: product.barcode ?? '',
            description: product.description ?? '',
            en_description: product.en_description ?? '',
            short_description: product.short_description ?? '',
            en_short_description: product.en_short_description ?? '',
            price: product.price ?? '0.00',
            compare_price: product.compare_price ?? '',
            cost_price: product.cost_price ?? '',
            currency: product.currency ?? 'USD',
            category: product.category ?? '',
            brand: product.brand ?? '',
            system: product.system ?? '',
            in_stock: product.in_stock ?? true,
            is_featured: product.is_featured ?? false,
            enabled: product.enabled ?? true,
            stock_count: product.stock_count ?? '',
            length: product.length ?? '',
            width: product.width ?? '',
            height: product.height ?? '',
            weight: product.weight ?? '',
            dimension_unit: product.dimension_unit ?? 'cm',
            weight_unit: product.weight_unit ?? 'kg',
            href: product.href ?? '',
          });
          const imgs = (images as Record<string, unknown>[]).map((i) => ({
            id: i.id as number,
            url: String(i.image ?? ''),
            sort_order: i.sort_order as number,
          }));
          setExistingImages(imgs);
        })
        .catch(() => setError(t('errorLoad')))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadMeta, t]);

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleImagesChange = (
    newImgs: NewImage[],
    deletedIds: number[],
    orderedIds: number[],
  ) => {
    setPendingNewImages(newImgs);
    setPendingDeletedIds(deletedIds);
    setPendingOrder(orderedIds);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // Strip empty optional fields
      [
        'compare_price',
        'cost_price',
        'stock_count',
        'length',
        'width',
        'height',
        'weight',
        'sku',
        'barcode',
        'href',
      ].forEach((k) => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });
      if (payload.category === '' || payload.category === null)
        delete payload.category;
      if (payload.brand === '' || payload.brand === null) delete payload.brand;

      let productId: number;
      if (isNew) {
        const created = await createProduct(payload);
        productId = created.id as number;
      } else {
        await updateProduct(Number(id), payload);
        productId = Number(id);
      }

      // Handle deleted images
      for (const imgId of pendingDeletedIds) {
        await deleteProductImage(productId, imgId).catch(() => null);
      }
      // Handle new images
      for (let i = 0; i < pendingNewImages.length; i++) {
        await createProductImage(productId, {
          image: pendingNewImages?.[i]?.base64,
          sort_order: pendingOrder.length + i,
        }).catch(() => null);
      }
      // Update sort orders for existing
      for (let i = 0; i < pendingOrder.length; i++) {
        await updateProductImage(productId, pendingOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t('saved'));
      if (isNew) router.replace(`/admin/products/${productId}`);
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
    { key: 'barcode', label: t('barcode') ?? 'Barcode' },
    {
      key: 'category',
      label: t('category') ?? 'Category',
      type: 'select',
      options: categoryOptions,
      placeholder: '— None —',
    },
    {
      key: 'brand',
      label: t('brand') ?? 'Brand',
      type: 'select',
      options: brandOptions,
      placeholder: '— None —',
    },
    { key: 'price', label: t('price') ?? 'Price', type: 'number' },
    {
      key: 'compare_price',
      label: t('comparePrice') ?? 'Compare Price',
      type: 'number',
    },
    {
      key: 'cost_price',
      label: t('costPrice') ?? 'Cost Price',
      type: 'number',
    },
    {
      key: 'currency',
      label: t('currency') ?? 'Currency',
      type: 'select',
      options: CURRENCY_OPTIONS,
    },
    {
      key: 'stock_count',
      label: t('stockCount') ?? 'Stock Count',
      type: 'number',
    },
    { key: 'length', label: t('length') ?? 'Length', type: 'number' },
    { key: 'width', label: t('width') ?? 'Width', type: 'number' },
    { key: 'height', label: t('height') ?? 'Height', type: 'number' },
    {
      key: 'dimension_unit',
      label: t('dimensionUnit') ?? 'Dimension Unit',
      type: 'select',
      options: DIM_UNIT_OPTIONS,
    },
    { key: 'weight', label: t('weight') ?? 'Weight', type: 'number' },
    {
      key: 'weight_unit',
      label: t('weightUnit') ?? 'Weight Unit',
      type: 'select',
      options: WEIGHT_UNIT_OPTIONS,
    },
    { key: 'href', label: t('link') ?? 'Link', type: 'url' },
    {
      key: 'description',
      label: t('description') ?? 'Description (ES)',
      type: 'textarea',
    },
    { key: 'en_description', label: 'Description (EN)', type: 'textarea' },
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
    { key: 'in_stock', label: t('inStock') ?? 'In Stock', type: 'boolean' },
    { key: 'is_featured', label: t('featured') ?? 'Featured', type: 'boolean' },
    { key: 'enabled', label: t('enabled'), type: 'boolean' },
  ];

  if (loading) {
    return (
      <Box padding="24px">
        <Typography variant="body">{t('loading')}</Typography>
      </Box>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: t('home'), href: '/' }, { label: t('breadcrumbAdmin'), href: '/admin' }, { label: t('products'), href: '/admin/products' }, { label: isNew ? t('newItem') : t('edit') }]} />
      <AdminForm
      title={
        isNew
          ? `${t('newItem')} — ${t('products')}`
          : `${t('edit')} — ${t('products')}`
      }
      fields={fields}
      values={values}
      onChange={handleChange}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      success={success}
    >
      <Box display="flex" flexDirection="column" gap="8px">
        <Typography variant="label">{t('images') ?? 'Images'}</Typography>
        <AdminImageUploader
          existingImages={existingImages}
          onChange={handleImagesChange}
          maxImages={10}
        />
      </Box>
    </AdminForm>
    </>
  );
}
