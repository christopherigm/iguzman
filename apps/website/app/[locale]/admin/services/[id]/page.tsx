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
import {
  VariantsEditor,
  type VariantOption,
} from "@/components/admin/variants-editor";
import { RecommendationsEditor } from "@/components/admin/recommendations-editor";
import { useRecommendationsEditor } from "@/hooks/use-recommendations-editor";
import {
  ServiceBookingSection,
  type BookingBranchOption,
} from "@/components/admin/service-booking-section";
import {
  getService,
  cloneService,
  createService,
  updateService,
  listServices,
  listServiceImages,
  createServiceImage,
  deleteServiceImage,
  updateServiceImage,
  listServiceCategories,
  listBrands,
  listBranches,
  checkSlug,
} from "@/lib/admin-api";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

const MODALITY_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "In Person" },
  { value: "hybrid", label: "Hybrid" },
];

export default function AdminServiceFormPage({ params }: Props) {
  const { id, locale } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    slug: "",
    sku: "",
    description: "",
    en_description: "",
    short_description: "",
    en_short_description: "",
    price: "0.00",
    compare_price: "",
    cost_price: "",
    currency: "USD",
    category: "",
    brand: "",
    duration: "",
    modality: "in_person",
    is_featured: false,
    enabled: true,
    href: "",
    video_link: "",
    booking_enabled: false,
    booking_in_branch: true,
    booking_on_premises: false,
    booking_pay_full: false,
    booking_pay_deposit: false,
    booking_deposit_percent: 30,
    booking_pay_in_person: true,
    booking_party_enabled: false,
    booking_party_min: 1,
    booking_party_max: 10,
  });
  // Kept out of `values`: it is an M2M the API takes as a list of ids, not a
  // scalar the generic AdminForm can render - same shape as `variantIds`.
  const [bookingBranchIds, setBookingBranchIds] = useState<number[]>([]);
  const [bookingPoolIds, setBookingPoolIds] = useState<number[]>([]);
  const [branchOptions, setBranchOptions] = useState<BookingBranchOption[]>([]);
  const [existingImage, setExistingImage] = useState<
    { id: number; url: string }[]
  >([]);
  const [pendingImage, setPendingImage] = useState<NewImage[]>([]);
  const [existingImages, setExistingImages] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewImages, setPendingNewImages] = useState<NewImage[]>([]);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<number[]>([]);
  const [pendingOrder, setPendingOrder] = useState<number[]>([]);

  // Sibling variants: the ids currently linked, and the pool of other services
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

  // Checkout recommendations. `categoryId` follows the *form's* category field
  // rather than the saved row, so re-filing this item updates the "inheriting
  // these" readout before the save - and an empty selection here means it
  // inherits, never that it recommends nothing.
  const recommendations = useRecommendationsEditor({
    systemId,
    source: "service",
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
        "service",
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
      const [cats, brands, services, branches] = await Promise.all([
        listServiceCategories(systemId),
        listBrands(systemId),
        listServices(systemId),
        listBranches(systemId),
      ]);
      setBranchOptions(
        branches.map((b, index) => ({
          id: b.id as number,
          // A branch with no name still has to be pickable - the CMS lets one be
          // created before it is named, and an unlabelled switch is unusable.
          name: String(b.name ?? `#${index + 1}`),
          bookingCapacity: Number(b.booking_capacity) || 1,
          // Flattened off the branch payload, which already nests them - the
          // pool picker needs no request of its own.
          pools: (
            (b.resource_pools as
              | {
                  id: number;
                  name: string;
                  enabled: boolean;
                  resources: { capacity: number; enabled: boolean }[];
                }[]
              | undefined) ?? []
          )
            .filter((pool) => pool.enabled)
            .map((pool) => ({
              id: pool.id,
              name: pool.name,
              branchId: b.id as number,
              // The biggest single resource, not the sum: a party never splits
              // across two, so this is the real ceiling the picker reports.
              largestCapacity: pool.resources
                .filter((r) => r.enabled)
                .reduce((max, r) => Math.max(max, Number(r.capacity) || 0), 0),
            })),
        })),
      );
      setVariantCatalog(
        services.map((s) => ({
          id: s.id as number,
          name: (s.name as string | null) ?? null,
          en_name: (s.en_name as string | null) ?? null,
          image: (s.image as string | null) ?? null,
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
      Promise.all([getService(Number(id)), listServiceImages(Number(id))])
        .then(([data, images]) => {
          setValues({
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            slug: data.slug ?? "",
            sku: data.sku ?? "",
            description: data.description ?? "",
            en_description: data.en_description ?? "",
            short_description: data.short_description ?? "",
            en_short_description: data.en_short_description ?? "",
            price: data.price ?? "0.00",
            compare_price: data.compare_price ?? "",
            cost_price: data.cost_price ?? "",
            currency: data.currency ?? "USD",
            category: data.category ?? "",
            brand: data.brand ?? "",
            duration: data.duration ?? "",
            modality: data.modality ?? "in_person",
            is_featured: data.is_featured ?? false,
            enabled: data.enabled ?? true,
            href: data.href ?? "",
            video_link: data.video_link ?? "",
            booking_enabled: data.booking_enabled ?? false,
            booking_in_branch: data.booking_in_branch ?? true,
            booking_on_premises: data.booking_on_premises ?? false,
            booking_pay_full: data.booking_pay_full ?? false,
            booking_pay_deposit: data.booking_pay_deposit ?? false,
            booking_deposit_percent: data.booking_deposit_percent ?? 30,
            booking_pay_in_person: data.booking_pay_in_person ?? true,
            booking_party_enabled: data.booking_party_enabled ?? false,
            booking_party_min: data.booking_party_min ?? 1,
            booking_party_max: data.booking_party_max ?? 10,
          });
          setBookingPoolIds(
            ((data.booking_pools as number[] | undefined) ?? []).map(Number),
          );
          setBookingBranchIds(
            ((data.booking_branches as number[] | undefined) ?? []).map(Number),
          );
          if (data.image) {
            setExistingImage([{ id: Number(id), url: String(data.image) }]);
          }
          const imgs = (images as Record<string, unknown>[]).map((i) => ({
            id: i.id as number,
            url: String(i.image ?? ""),
            sort_order: i.sort_order as number,
          }));
          setExistingImages(imgs);
          setVariantIds(
            ((data.variants as { id: number }[] | undefined) ?? []).map(
              (v) => v.id,
            ),
          );
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadMeta, t]);

  const handleChange = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

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
        "cost_price",
        "sku",
        "href",
        "video_link",
        "duration",
        "category",
        "brand",
        "modality",
      ].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // Symmetrical sibling variants, sent as a list of Service ids. The write
      // serializer strips any self-reference; an empty list clears them all.
      payload.variants = variantIds;
      // Always sent, like `variants`: an empty list clears this record's own
      // rows, which is how it is handed back to inheriting its category's.
      payload.recommendations = recommendations.value;
      // Always sent, like `variants`: an empty list means "every branch" and has
      // to actually clear the relation, so it cannot be omitted when empty.
      payload.booking_branches = bookingBranchIds;
      // Same rule, same reason: empty means "every pool at the location", so it
      // is always sent rather than omitted when empty.
      payload.booking_pools = bookingPoolIds;
      payload.booking_party_min = Number(values.booking_party_min) || 1;
      payload.booking_party_max = Number(values.booking_party_max) || 1;
      // The number input hands back a string; the API wants an integer, and a
      // blank field means the tenant cleared it rather than chose zero.
      payload.booking_deposit_percent =
        Number(values.booking_deposit_percent) || 30;
      if (pendingImage.length > 0) {
        payload.image = pendingImage[0]?.base64;
      } else if (existingImage.length === 0) {
        payload.image = null;
      }

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

      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/services/${serviceId}`);
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
    const created = await cloneService(Number(id), names);
    // The route only changes its dynamic segment, so this page may re-render
    // rather than remount; without this it would show the original's values
    // until the new record's fetch lands.
    setLoading(true);
    router.push(`/admin/services/${created.id as number}`);
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
      key: "duration",
      label: t("duration") ?? "Duration (min)",
      type: "number",
    },
    {
      key: "modality",
      label: t("modality") ?? "Modality",
      type: "select",
      options: MODALITY_OPTIONS,
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
    { key: "is_featured", label: t("featured") ?? "Featured", type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t("loading")}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("services"), href: "/admin/services" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("services")}`
            : `${t("edit")} - ${t("services")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        isEditing={!isNew}
        onClone={isNew ? undefined : handleClone}
        fields={fields}
        values={values}
        onChange={handleChange}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        productionHref={
          !isNew && values.slug ? `/services/${String(values.slug)}` : undefined
        }
        imagesSlot={
          <>
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">
                {t("image") ?? "Main Image"}
              </Typography>
              <AdminImageUploader
                existingImages={existingImage}
                onChange={(n, _d, o) => {
                  setPendingImage(n);
                  setExistingImage((prev) =>
                    prev.filter((img) => o.includes(img.id)),
                  );
                }}
                maxImages={1}
              />
            </Box>
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">{t("images") ?? "Images"}</Typography>
              <AdminImageUploader
                existingImages={existingImages}
                onChange={(n, d, o) => {
                  setPendingNewImages(n);
                  setPendingDeletedIds(d);
                  setPendingOrder(o);
                }}
                maxImages={10}
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
                : variantCatalog.filter((s) => s.id !== Number(id))
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

          {/* Booking: how (and whether) this service is sold as an appointment. */}
          <ServiceBookingSection
            values={values}
            onChange={handleChange}
            branches={branchOptions}
            selectedBranchIds={bookingBranchIds}
            onBranchesChange={setBookingBranchIds}
            selectedPoolIds={bookingPoolIds}
            onPoolsChange={setBookingPoolIds}
          />

          {/* Pricing & Costs, at the end of the form. */}
          <PricingSection values={values} onChange={handleChange} />
        </Box>
      </AdminForm>
    </>
  );
}
