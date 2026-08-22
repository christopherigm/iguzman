"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { useAdminImageField } from "@/hooks/use-admin-image-field";
import {
  getMenuCategory,
  createMenuCategory,
  updateMenuCategory,
  listMenuCategories,
  listMenuSizes,
  createMenuSize,
  updateMenuSize,
  deleteMenuSize,
  checkSlug,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import {
  MenuSizesEditor,
  persistMenuSizes,
  toMenuSizeRow,
  type MenuSizeRow,
} from "@/components/admin/menu-sizes-editor";
import { menuCategoryHref } from "@/lib/catalog-paths";
import { buildSlug } from "@/lib/slug-utils";
import { RecommendationsEditor } from "@/components/admin/recommendations-editor";
import { useRecommendationsEditor } from "@/hooks/use-recommendations-editor";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminMenuCategoryFormPage({ params }: Props) {
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
  // The category's size list - what every dish filed under it is offered in,
  // unless the dish carries its own rows. Loaded and saved beside the form's own
  // fields, exactly as the menu-item form does with its ingredients.
  const [sizes, setSizes] = useState<MenuSizeRow[]>([]);
  const [originalSizeIds, setOriginalSizeIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/menu-categories",
    id,
    systemId,
    list: listMenuCategories,
  });

  // What every item in this category is recommended alongside at checkout - said
  // once here rather than on each item, which is the whole point of authoring it
  // at the category level. An item may still override the list on its own form.
  const recommendations = useRecommendationsEditor({
    systemId,
    source: "menu_category",
    sourceId: isNew ? null : Number(id),
  });

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
        "menu-category",
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
      const cats = await listMenuCategories(systemId);
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
      // Sizes are loaded separately rather than read off the category payload's
      // nested `sizes`: that list is the *public* one and drops disabled rows,
      // which the CMS has to be able to see and switch back on.
      listMenuSizes("menu-categories", Number(id))
        .then((rows) => {
          const mapped = rows.map(toMenuSizeRow);
          setSizes(mapped);
          setOriginalSizeIds(mapped.map((r) => r.id as number));
        })
        .catch(() => {
          /* non-critical: the form still saves its own fields */
        });
      getMenuCategory(Number(id))
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

  const persistSizes = async (categoryId: number) => {
    const { rows, ids } = await persistMenuSizes(sizes, originalSizeIds, {
      create: (payload) =>
        createMenuSize("menu-categories", categoryId, payload),
      update: (sizeId, payload) =>
        updateMenuSize("menu-categories", categoryId, sizeId, payload),
      remove: (sizeId) => deleteMenuSize("menu-categories", categoryId, sizeId),
    });
    setSizes(rows);
    setOriginalSizeIds(ids);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // The image, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());
      if (payload.parent === "") payload.parent = null;
      // Blank reaches the API as null, never as 0: "no award set here" and
      // "items here earn nothing" are different claims, and only the second one
      // overrides what an item would otherwise inherit.
      if (payload.points_award === "") payload.points_award = null;
      // Always sent: an empty list clears the category's rows, so it cannot be
      // omitted when the operator has just unticked the last one.
      payload.recommendations = recommendations.value;
      if (isNew) {
        const created = await createMenuCategory(payload);
        await persistSizes(created.id as number);
        setSuccess(t("saved"));
        image.settle(created.image, created.id as number);
        router.replace(`/admin/menu-categories/${created.id}`);
      } else {
        const updated = await updateMenuCategory(Number(id), payload);
        await persistSizes(Number(id));
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
          { label: t("menuCategories"), href: "/admin/menu-categories" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("menuCategories")}`
            : `${t("edit")} - ${t("menuCategories")}`
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
              ? menuCategoryHref(String(values.slug))
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
        {/* The sizes every dish in this category is offered in, below the
            category's own fields - the same position (and the same editor) the
            menu-item form gives its own override list. */}
        <Box
          display="flex"
          flexDirection="column"
          gap="28px"
          marginTop="12px"
          paddingTop="20px"
          styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
        >
          <MenuSizesEditor value={sizes} onChange={setSizes} scope="category" />
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
