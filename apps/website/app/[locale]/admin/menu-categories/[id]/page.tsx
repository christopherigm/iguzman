"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
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
import {
  MenuSizesEditor,
  persistMenuSizes,
  toMenuSizeRow,
  type MenuSizeRow,
} from "@/components/admin/menu-sizes-editor";
import { menuCategoryHref } from "@/lib/menu-paths";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminMenuCategoryFormPage({ params }: Props) {
  const { id } = use(params);
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
    enabled: true,
  });
  const [existingImage, setExistingImage] = useState<
    { id: number; url: string }[]
  >([]);
  const [pendingImage, setPendingImage] = useState<NewImage[]>([]);
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
            enabled: data.enabled ?? true,
          });
          if (data.image)
            setExistingImage([{ id: Number(id), url: String(data.image) }]);
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadMeta, t]);

  const persistSizes = async (categoryId: number) => {
    const { rows, ids } = await persistMenuSizes(sizes, originalSizeIds, {
      create: (payload) => createMenuSize("menu-categories", categoryId, payload),
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
      if (pendingImage.length > 0) {
        payload.image = pendingImage[0]?.base64;
      } else if (existingImage.length === 0) {
        payload.image = null;
      }
      if (payload.parent === "") payload.parent = null;
      if (isNew) {
        const created = await createMenuCategory(payload);
        await persistSizes(created.id as number);
        setSuccess(t("saved"));
        router.replace(`/admin/menu-categories/${created.id}`);
      } else {
        await updateMenuCategory(Number(id), payload);
        await persistSizes(Number(id));
        setSuccess(t("saved"));
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
        saving={saving}
        error={error}
        success={success}
        productionHref={
          !isNew && values.slug
            ? menuCategoryHref(String(values.slug))
            : undefined
        }
        imagesSlot={
          <Box display="flex" flexDirection="column" gap="8px">
            <Typography variant="label">{t("image") ?? "Image"}</Typography>
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
        </Box>
      </AdminForm>
    </>
  );
}
