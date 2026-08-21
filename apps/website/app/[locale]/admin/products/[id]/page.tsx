"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { PricingSection } from "@/components/admin/pricing-section";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { ImageWebSearch } from "@/components/admin/image-web-search";
import {
  remainingGallerySlots,
  useAdminImageField,
} from "@/hooks/use-admin-image-field";
import {
  VariantsEditor,
  type VariantOption,
} from "@/components/admin/variants-editor";
import { RecommendationsEditor } from "@/components/admin/recommendations-editor";
import { useRecommendationsEditor } from "@/hooks/use-recommendations-editor";
import {
  getProduct,
  cloneProduct,
  createProduct,
  updateProduct,
  listProducts,
  listProductImages,
  createStockGalleryRows,
  type StockImageFile,
  createProductImage,
  deleteProductImage,
  updateProductImage,
  listProductCategories,
  listBrands,
  checkSlug,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/** How many photos one product's gallery holds, uploads and picks together. */
const GALLERY_MAX = 10;

type Props = { params: Promise<{ locale: string; id: string }> };

const DIM_UNIT_OPTIONS = [
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
  { value: "m", label: "m" },
  { value: "mm", label: "mm" },
];

const WEIGHT_UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
  { value: "g", label: "g" },
  { value: "oz", label: "oz" },
];

export default function AdminProductFormPage({ params }: Props) {
  const { id, locale } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    slug: "",
    sku: "",
    barcode: "",
    description: "",
    en_description: "",
    short_description: "",
    en_short_description: "",
    price: "0.00",
    compare_price: "",
    // Rewards. Blank is meaningful on both and must stay blank rather than
    // becoming 0 - a blank award inherits the category's, a blank points price
    // means the item cannot be redeemed. `handleSubmit` sends null for either.
    points_award: "",
    points_price: "",
    cost_price: "",
    currency: "USD",
    category: "",
    brand: "",
    system: "",
    in_stock: true,
    is_featured: false,
    enabled: true,
    stock_count: "",
    length: "",
    width: "",
    height: "",
    weight: "",
    dimension_unit: "cm",
    weight_unit: "kg",
    href: "",
    video_link: "",
  });

  // The main image's uploader and stock picker: one field with two doors. It is
  // a different photo from the gallery - `Product.image` is what a catalog card
  // draws, and the API only falls back to the first gallery row when it is
  // empty - so replacing the gallery alone leaves the card on the old picture.
  const image = useAdminImageField();
  // Pulled out because the load effect below depends on it: this one callback is
  // stable, where `image` itself changes with every pick and keystroke - and an
  // effect keyed on the object would re-fetch the record each time.
  const loadImage = image.load;
  const [existingImages, setExistingImages] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewImages, setPendingNewImages] = useState<NewImage[]>([]);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<number[]>([]);
  const [pendingOrder, setPendingOrder] = useState<number[]>([]);
  // Photos picked from a stock bank for the *gallery*. They become rows of
  // their own on save, after the operator's uploads - the picker and the
  // uploader both fill the same ten slots, so neither replaces the other.
  const [stockImages, setStockImages] = useState<StockImageFile[]>([]);

  // Sibling variants: the ids currently linked, and the pool of other products
  // to pick from (self is excluded where the picker is rendered).
  const [variantIds, setVariantIds] = useState<number[]>([]);
  const [variantCatalog, setVariantCatalog] = useState<VariantOption[]>([]);

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

  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/products",
    id,
    systemId,
    list: listProducts,
    groupKey: "category",
    groupList: listProductCategories,
  });

  // Checkout recommendations. `categoryId` follows the *form's* category field
  // rather than the saved row, so re-filing this item updates the "inheriting
  // these" readout before the save - and an empty selection here means it
  // inherits, never that it recommends nothing.
  const recommendations = useRecommendationsEditor({
    systemId,
    source: "product",
    sourceId: isNew ? null : Number(id),
    categoryId: values.category ? Number(values.category) : null,
  });

  // Auto-populate slug from name for new records (the slug field is read-only).
  // Derived during render rather than in an effect; the guard stops it looping
  // once the slug already matches the name.
  if (isNew) {
    const derivedSlug = buildSlug(String(values.name ?? ""), systemId);
    if (values.slug !== derivedSlug) {
      setValues((prev) => ({ ...prev, slug: derivedSlug }));
    }
  }

  const handleNameBlur = useCallback(async () => {
    const currentSlug = String(values.slug ?? "");
    if (!currentSlug) return;
    setSlugError(null);
    try {
      const result = await checkSlug(
        "product",
        currentSlug,
        !isNew ? Number(id) : undefined,
      );
      if (!result.available) setSlugError(t("slugTaken"));
    } catch {
      /* ignore */
    }
  }, [values.slug, isNew, id, t]);

  const loadMeta = useCallback(async () => {
    try {
      const [cats, brands, products] = await Promise.all([
        listProductCategories(systemId),
        listBrands(systemId),
        listProducts(systemId),
      ]);
      setVariantCatalog(
        products.map((p) => ({
          id: p.id as number,
          name: (p.name as string | null) ?? null,
          en_name: (p.en_name as string | null) ?? null,
          image: (p.image as string | null) ?? null,
        })),
      );
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
    void (async () => {
      await loadMeta();
    })();
    if (!isNew) {
      Promise.all([getProduct(Number(id)), listProductImages(Number(id))])
        .then(([product, images]) => {
          setValues({
            name: product.name ?? "",
            en_name: product.en_name ?? "",
            slug: product.slug ?? "",
            sku: product.sku ?? "",
            barcode: product.barcode ?? "",
            description: product.description ?? "",
            en_description: product.en_description ?? "",
            short_description: product.short_description ?? "",
            en_short_description: product.en_short_description ?? "",
            price: product.price ?? "0.00",
            compare_price: product.compare_price ?? "",
            points_award: product.points_award ?? "",
            points_price: product.points_price ?? "",
            cost_price: product.cost_price ?? "",
            currency: product.currency ?? "USD",
            category: product.category ?? "",
            brand: product.brand ?? "",
            system: product.system ?? "",
            in_stock: product.in_stock ?? true,
            is_featured: product.is_featured ?? false,
            enabled: product.enabled ?? true,
            stock_count: product.stock_count ?? "",
            length: product.length ?? "",
            width: product.width ?? "",
            height: product.height ?? "",
            weight: product.weight ?? "",
            dimension_unit: product.dimension_unit ?? "cm",
            weight_unit: product.weight_unit ?? "kg",
            href: product.href ?? "",
            video_link: product.video_link ?? "",
          });
          loadImage(product.image, Number(id));
          const imgs = (images as Record<string, unknown>[]).map((i) => ({
            id: i.id as number,
            url: String(i.image ?? ""),
            sort_order: i.sort_order as number,
          }));
          setExistingImages(imgs);
          setVariantIds(
            ((product.variants as { id: number }[] | undefined) ?? []).map(
              (v) => v.id,
            ),
          );
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadImage, loadMeta, t]);

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
      // Clear empty optional fields with an explicit null. Updates are PATCH, so
      // an omitted key means "leave unchanged" - it cannot clear a value.
      [
        "compare_price",
        // ⚠ Both must reach the API as null, never as 0 or "". A blank award
        // means "inherit my category's" and a blank points price means "not
        // redeemable"; coercing either to zero would silently say "earns
        // nothing" and "free", which are different claims entirely.
        "points_award",
        "points_price",
        "cost_price",
        "stock_count",
        "length",
        "width",
        "height",
        "weight",
        "sku",
        "barcode",
        "href",
        "video_link",
        "category",
        "brand",
        "dimension_unit",
        "weight_unit",
      ].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // Symmetrical sibling variants, sent as a list of Product ids. The write
      // serializer strips any self-reference; an empty list clears them all.
      payload.variants = variantIds;
      // Always sent, like `variants`: an empty list clears this record's own
      // rows, which is how it is handed back to inheriting its category's.
      payload.recommendations = recommendations.value;
      // The main image, and - when it came from a bank - the credit it owes,
      // which has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());

      let productId: number;
      if (isNew) {
        const created = await createProduct(payload);
        productId = created.id as number;
        image.settle(created.image, productId);
      } else {
        const updated = await updateProduct(Number(id), payload);
        productId = Number(id);
        image.settle(updated.image, productId);
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
      // ⚠ Each picked photo's credit goes in the same create call as its file:
      // storing an image clears any attribution, so a second write would lose
      // the credit that makes the photo legal to publish.
      await createStockGalleryRows(
        stockImages,
        pendingOrder.length + pendingNewImages.length,
        (payload) => createProductImage(productId, payload),
      );
      setStockImages([]);
      // Update sort orders for existing
      for (let i = 0; i < pendingOrder.length; i++) {
        await updateProductImage(productId, pendingOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/products/${productId}`);
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // Cloning happens server-side (it has to copy the image *files*), and clones
  // the stored record - so anything unsaved in this form is deliberately left
  // out. The dialog says so.
  const handleClone = async (names: { name: string; en_name: string }) => {
    const created = await cloneProduct(Number(id), names);
    // The route only changes its dynamic segment, so this page may re-render
    // rather than remount; without this it would show the original's values
    // until the new record's fetch lands.
    setLoading(true);
    router.push(`/admin/products/${created.id as number}`);
  };

  const fields: FieldDef[] = [
    { key: "name", label: t("name"), required: true, onBlur: handleNameBlur },
    { key: "en_name", label: "Name (EN)" },
    {
      key: "slug",
      label: "Slug",
      type: "slug",
      disabled: true,
      fieldError: slugError,
    },
    { key: "sku", label: "SKU" },
    { key: "barcode", label: t("barcode") ?? "Barcode" },
    {
      key: "category",
      label: t("category") ?? "Category",
      type: "select",
      options: categoryOptions,
      placeholder: "- None -",
    },
    {
      key: "brand",
      label: t("brand") ?? "Brand",
      type: "select",
      options: brandOptions,
      placeholder: "- None -",
    },
    // price / compare_price / cost_price / currency are deliberately absent
    // here: they live in the Pricing & Costs section at the end of the form.
    {
      key: "stock_count",
      label: t("stockCount") ?? "Stock Count",
      type: "number",
    },
    { key: "length", label: t("length") ?? "Length", type: "number" },
    { key: "width", label: t("width") ?? "Width", type: "number" },
    { key: "height", label: t("height") ?? "Height", type: "number" },
    {
      key: "dimension_unit",
      label: t("dimensionUnit") ?? "Dimension Unit",
      type: "select",
      options: DIM_UNIT_OPTIONS,
    },
    { key: "weight", label: t("weight") ?? "Weight", type: "number" },
    {
      key: "weight_unit",
      label: t("weightUnit") ?? "Weight Unit",
      type: "select",
      options: WEIGHT_UNIT_OPTIONS,
    },
    { key: "href", label: t("link") ?? "Link", type: "url" },
    {
      key: "video_link",
      label: t("videoLink") ?? "Hero Video Link",
      type: "url",
    },
    {
      key: "description",
      label: t("description") ?? "Description (ES)",
      type: "textarea",
    },
    { key: "en_description", label: "Description (EN)", type: "textarea" },
    {
      key: "short_description",
      label: t("shortDescription") ?? "Short Description (ES)",
      type: "textarea",
    },
    {
      key: "en_short_description",
      label: "Short Description (EN)",
      type: "textarea",
    },
    { key: "in_stock", label: t("inStock") ?? "In Stock", type: "boolean" },
    { key: "is_featured", label: t("featured") ?? "Featured", type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  // Both stock-image pickers on this form look for the same thing, so they open
  // on one query - the product's own name, until the operator edits it.
  const imageQuery =
    String(values.name ?? "").trim() || String(values.en_name ?? "").trim();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("products"), href: "/admin/products" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("products")}`
            : `${t("edit")} - ${t("products")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        isEditing={!isNew}
        onClone={isNew ? undefined : handleClone}
        fields={fields}
        values={values}
        onChange={handleChange}
        onSubmit={handleSubmit}
        loading={loading}
        saving={saving}
        error={error}
        success={success}
        siblings={siblings}
        productionHref={
          isNew
            ? undefined
            : values.slug
              ? `/products/${String(values.slug)}`
              : null
        }
        imagesSlot={
          <>
            <AdminImageField
              label={t("image") ?? "Main Image"}
              field={image}
              query={imageQuery}
            />
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">{t("images") ?? "Images"}</Typography>
              <AdminImageUploader
                existingImages={existingImages}
                onChange={handleImagesChange}
                maxImages={GALLERY_MAX}
              />
              <ImageWebSearch
                defaultQuery={imageQuery}
                value={stockImages}
                onChange={setStockImages}
                slots={remainingGallerySlots(
                  GALLERY_MAX,
                  existingImages,
                  pendingDeletedIds,
                  pendingNewImages,
                )}
              />
            </Box>
          </>
        }
      >
        <Box
          display="flex"
          flexDirection="column"
          gap="28px"
          marginTop="12px"
          paddingTop="20px"
          styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
        >
          {/* Variants sits directly below the Short Description fields. */}
          <VariantsEditor
            value={variantIds}
            onChange={setVariantIds}
            catalog={
              isNew
                ? variantCatalog
                : variantCatalog.filter((p) => p.id !== Number(id))
            }
            locale={locale}
          />
          {/* Checkout recommendations sit directly under the variants picker:
              both answer "what else should the customer see?", one on the detail
              page and one in the cart. */}
          <RecommendationsEditor
            value={recommendations.value}
            onChange={recommendations.setValue}
            catalog={recommendations.catalog}
            inherited={recommendations.inherited}
            scope={recommendations.scope}
            locale={locale}
          />

          {/* Pricing & Costs, at the end of the form. */}
          <PricingSection values={values} onChange={handleChange} />
        </Box>
      </AdminForm>
    </>
  );
}
