"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { useAdminImageField } from "@/hooks/use-admin-image-field";
import {
  getProductCategory,
  createProductCategory,
  updateProductCategory,
  listProductCategories,
  checkSlug,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { buildSlug } from "@/lib/slug-utils";
import { useSitePrefix } from "../../site-prefix-provider";
import { RecommendationsEditor } from "@/components/admin/recommendations-editor";
import { useRecommendationsEditor } from "@/hooks/use-recommendations-editor";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminProductCategoryFormPage({ params }: Props) {
  const { locale, id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    slug: "",
    description: "",
    en_description: "",
    parent: "",
    // What every item filed here earns unless it states its own award. Blank
    // means "nothing by default" - it is not a rate to be defaulted, and an
    // item's own blank is what defers to this one.
    points_award: "",
    enabled: true,
  });
  // The uploader and the stock-image picker, which are one field with two doors.
  const image = useAdminImageField();
  // Pulled out because the load effect below depends on it: this one callback is
  // stable, where `image` itself changes with every pick and keystroke - and an
  // effect keyed on the object would re-fetch the record each time.
  const loadImage = image.load;
  const [parentOptions, setParentOptions] = useState<
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
    basePath: "/admin/product-categories",
    id,
    systemId,
    list: listProductCategories,
  });

  // What every item in this category is recommended alongside at checkout - said
  // once here rather than on each item, which is the whole point of authoring it
  // at the category level. An item may still override the list on its own form.
  const recommendations = useRecommendationsEditor({
    systemId,
    source: "product_category",
    sourceId: isNew ? null : Number(id),
  });

  // The tenant's slug namespace, from the CMS-wide provider. Null while the
  // System loads, which is what the guard below is for: `buildSlug(name, "")`
  // would give this record a leading hyphen and no namespace at all.
  const sitePrefix = useSitePrefix();
  // Auto-populate slug from name for new records (the slug field is read-only).
  // Derived during render rather than in an effect; the guard stops it looping
  // once the slug already matches the name.
  if (isNew && sitePrefix) {
    const derivedSlug = buildSlug(String(values.name ?? ""), sitePrefix);
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
        "product-category",
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
      const cats = await listProductCategories(systemId);
      setParentOptions(
        cats
          .filter((c) => isNew || c.id !== Number(id))
          .map((c) => ({
            value: c.id as number,
            label: String(c.name ?? c.id),
          })),
      );
    } catch {
      /* non-critical */
    }
  }, [systemId, id, isNew]);

  useEffect(() => {
    void (async () => {
      await loadMeta();
    })();
    if (!isNew) {
      getProductCategory(Number(id))
        .then((data) => {
          setValues({
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            slug: data.slug ?? "",
            description: data.description ?? "",
            en_description: data.en_description ?? "",
            parent: data.parent ?? "",
            points_award: data.points_award ?? "",
            enabled: data.enabled ?? true,
          });
          loadImage(data.image, Number(id));
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadImage, loadMeta, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // The image, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());
      // Clear with an explicit null. Updates are PATCH, so an omitted key means
      // "leave unchanged" - it cannot clear a value.
      if (payload.parent === "") payload.parent = null;
      // Blank reaches the API as null, never as 0: "no award set here" and
      // "items here earn nothing" are different claims, and only the second one
      // overrides what an item would otherwise inherit.
      if (payload.points_award === "") payload.points_award = null;
      // Always sent: an empty list clears the category's rows, so it cannot be
      // omitted when the operator has just unticked the last one.
      payload.recommendations = recommendations.value;
      if (isNew) {
        const created = await createProductCategory(payload);
        setSuccess(t("saved"));
        image.settle(created.image, created.id as number);
        router.replace(`/admin/product-categories/${created.id}`);
      } else {
        const updated = await updateProductCategory(Number(id), payload);
        setSuccess(t("saved"));
        image.settle(updated.image, Number(id));
      }
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
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
    {
      key: "parent",
      label: t("parent") ?? "Parent",
      type: "select",
      options: parentOptions,
      placeholder: "- None -",
    },
    {
      key: "description",
      label: t("description") ?? "Description (ES)",
      type: "textarea",
    },
    { key: "en_description", label: "Description (EN)", type: "textarea" },
    {
      key: "points_award",
      label: t("pointsAward"),
      type: "number",
      helperText: t("pointsAwardCategoryHint"),
    },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("productCategories"), href: "/admin/product-categories" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("productCategories")}`
            : `${t("edit")} - ${t("productCategories")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
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
              ? `/categories/products/${String(values.slug)}`
              : null
        }
        imagesSlot={
          <AdminImageField
            label={t("image") ?? "Image"}
            field={image}
            query={
              String(values.name ?? "").trim() ||
              String(values.en_name ?? "").trim()
            }
          />
        }
      >
        {/* What every item in this category is offered alongside in the cart. */}
        <Box
          display="flex"
          flexDirection="column"
          gap="28px"
          marginTop="12px"
          paddingTop="20px"
          styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
        >
          <RecommendationsEditor
            value={recommendations.value}
            onChange={recommendations.setValue}
            catalog={recommendations.catalog}
            scope={recommendations.scope}
            locale={locale}
          />
        </Box>
      </AdminForm>
    </>
  );
}
