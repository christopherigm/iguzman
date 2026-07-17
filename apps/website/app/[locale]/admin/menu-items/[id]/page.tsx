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
  MenuIngredientsEditor,
  type IngredientRow,
} from "@/components/admin/menu-ingredients-editor";
import {
  MenuRecipeEditor,
  type RecipeValue,
} from "@/components/admin/menu-recipe-editor";
import {
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  listMenuItemImages,
  createMenuItemImage,
  deleteMenuItemImage,
  updateMenuItemImage,
  listMenuItemIngredients,
  createMenuItemIngredient,
  updateMenuItemIngredient,
  deleteMenuItemIngredient,
  getMenuItemRecipe,
  saveMenuItemRecipe,
  listMenuCategories,
  listBrands,
  checkSlug,
} from "@/lib/admin-api";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "MXN", label: "MXN" },
  { value: "GBP", label: "GBP" },
  { value: "CAD", label: "CAD" },
  { value: "CLP", label: "CLP" },
  { value: "BRL", label: "BRL" },
];

const EMPTY_RECIPE: RecipeValue = {
  recipe_notes: "",
  prep_time_minutes: "",
  cook_time_minutes: "",
  servings: "",
  steps: [],
};

function toNullableNumber(v: unknown): number | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
}

export default function AdminMenuItemFormPage({ params }: Props) {
  const { id } = use(params);
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
    is_available: true,
    is_featured: false,
    enabled: true,
    calories: "",
    spice_level: "",
    allergens: "",
    is_organic: false,
    is_vegetarian: false,
    is_vegan: false,
    is_gluten_free: false,
    href: "",
    video_link: "",
  });

  const [existingImages, setExistingImages] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewImages, setPendingNewImages] = useState<NewImage[]>([]);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<number[]>([]);
  const [pendingOrder, setPendingOrder] = useState<number[]>([]);

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [originalIngredientIds, setOriginalIngredientIds] = useState<number[]>(
    [],
  );
  const [recipe, setRecipe] = useState<RecipeValue>(EMPTY_RECIPE);

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
        "menu-item",
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
      const [cats, brands] = await Promise.all([
        listMenuCategories(systemId),
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
    void (async () => {
      await loadMeta();
    })();
    if (!isNew) {
      Promise.all([
        getMenuItem(Number(id)),
        listMenuItemImages(Number(id)),
        listMenuItemIngredients(Number(id)),
        getMenuItemRecipe(Number(id)),
      ])
        .then(([item, images, ings, rec]) => {
          setValues({
            name: item.name ?? "",
            en_name: item.en_name ?? "",
            slug: item.slug ?? "",
            sku: item.sku ?? "",
            description: item.description ?? "",
            en_description: item.en_description ?? "",
            short_description: item.short_description ?? "",
            en_short_description: item.en_short_description ?? "",
            price: item.price ?? "0.00",
            compare_price: item.compare_price ?? "",
            cost_price: item.cost_price ?? "",
            currency: item.currency ?? "USD",
            category: item.category ?? "",
            brand: item.brand ?? "",
            is_available: item.is_available ?? true,
            is_featured: item.is_featured ?? false,
            enabled: item.enabled ?? true,
            calories: item.calories ?? "",
            spice_level: item.spice_level ?? "",
            allergens: item.allergens ?? "",
            is_organic: item.is_organic ?? false,
            is_vegetarian: item.is_vegetarian ?? false,
            is_vegan: item.is_vegan ?? false,
            is_gluten_free: item.is_gluten_free ?? false,
            href: item.href ?? "",
            video_link: item.video_link ?? "",
          });
          setExistingImages(
            (images as Record<string, unknown>[]).map((i) => ({
              id: i.id as number,
              url: String(i.image ?? ""),
              sort_order: i.sort_order as number,
            })),
          );
          const ingRows = (ings as Record<string, unknown>[]).map((i) => ({
            key: `ing-existing-${i.id}`,
            id: i.id as number,
            name: String(i.name ?? ""),
            en_name: String(i.en_name ?? ""),
            price: String(i.price ?? "0.00"),
            quantity: i.quantity == null ? "" : String(i.quantity),
            unit: String(i.unit ?? ""),
            is_default: Boolean(i.is_default),
            is_removable: Boolean(i.is_removable),
            max_quantity: String(i.max_quantity ?? "1"),
            enabled: i.enabled !== false,
          }));
          setIngredients(ingRows);
          setOriginalIngredientIds(ingRows.map((r) => r.id as number));
          setRecipe({
            recipe_notes: String(rec.recipe_notes ?? ""),
            prep_time_minutes:
              rec.prep_time_minutes == null
                ? ""
                : String(rec.prep_time_minutes),
            cook_time_minutes:
              rec.cook_time_minutes == null
                ? ""
                : String(rec.cook_time_minutes),
            servings: rec.servings == null ? "" : String(rec.servings),
            steps: ((rec.steps as Record<string, unknown>[]) ?? []).map(
              (s) => ({
                key: `step-existing-${s.id}`,
                instruction: String(s.instruction ?? ""),
                en_instruction: String(s.en_instruction ?? ""),
              }),
            ),
          });
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadMeta, t]);

  const handleChange = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const persistIngredients = async (menuItemId: number) => {
    const currentIds = ingredients
      .map((r) => r.id)
      .filter((n): n is number => typeof n === "number");
    const deleted = originalIngredientIds.filter(
      (oid) => !currentIds.includes(oid),
    );
    for (const ingId of deleted) {
      await deleteMenuItemIngredient(menuItemId, ingId).catch(() => null);
    }
    for (let i = 0; i < ingredients.length; i++) {
      const row = ingredients[i];
      if (!row || !row.name.trim()) continue;
      const payload = {
        name: row.name,
        en_name: row.en_name || null,
        price: row.price === "" ? "0.00" : row.price,
        quantity: row.quantity === "" ? null : row.quantity,
        unit: row.unit || null,
        is_default: row.is_default,
        is_removable: row.is_removable,
        max_quantity: row.max_quantity === "" ? 1 : Number(row.max_quantity),
        sort_order: i,
        enabled: row.enabled,
      };
      if (row.id) {
        await updateMenuItemIngredient(menuItemId, row.id, payload).catch(
          () => null,
        );
      } else {
        await createMenuItemIngredient(menuItemId, payload).catch(() => null);
      }
    }
  };

  const persistRecipe = async (menuItemId: number) => {
    const steps = recipe.steps
      .filter((s) => s.instruction.trim())
      .map((s, idx) => ({
        step_number: idx + 1,
        instruction: s.instruction,
        en_instruction: s.en_instruction || null,
        sort_order: idx,
      }));
    await saveMenuItemRecipe(menuItemId, {
      recipe_notes: recipe.recipe_notes || null,
      prep_time_minutes: toNullableNumber(recipe.prep_time_minutes),
      cook_time_minutes: toNullableNumber(recipe.cook_time_minutes),
      servings: toNullableNumber(recipe.servings),
      steps,
    }).catch(() => null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      [
        "compare_price",
        "cost_price",
        "calories",
        "spice_level",
        "sku",
        "allergens",
        "href",
        "video_link",
        "category",
        "brand",
      ].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });

      let menuItemId: number;
      if (isNew) {
        const created = await createMenuItem(payload);
        menuItemId = created.id as number;
      } else {
        await updateMenuItem(Number(id), payload);
        menuItemId = Number(id);
      }

      for (const imgId of pendingDeletedIds) {
        await deleteMenuItemImage(menuItemId, imgId).catch(() => null);
      }
      for (let i = 0; i < pendingNewImages.length; i++) {
        await createMenuItemImage(menuItemId, {
          image: pendingNewImages?.[i]?.base64,
          sort_order: pendingOrder.length + i,
        }).catch(() => null);
      }
      for (let i = 0; i < pendingOrder.length; i++) {
        await updateMenuItemImage(menuItemId, pendingOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      await persistIngredients(menuItemId);
      await persistRecipe(menuItemId);

      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/menu-items/${menuItemId}`);
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
    { key: "price", label: `${t("basePrice")}`, type: "number" },
    {
      key: "compare_price",
      label: t("comparePrice") ?? "Compare Price",
      type: "number",
    },
    {
      key: "cost_price",
      label: t("costPrice") ?? "Cost Price",
      type: "number",
    },
    {
      key: "currency",
      label: t("currency") ?? "Currency",
      type: "select",
      options: CURRENCY_OPTIONS,
    },
    { key: "calories", label: t("calories"), type: "number" },
    { key: "spice_level", label: t("spiceLevel"), type: "number" },
    { key: "allergens", label: t("allergens") },
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
    { key: "is_organic", label: t("organic"), type: "boolean" },
    { key: "is_vegetarian", label: t("vegetarian"), type: "boolean" },
    { key: "is_vegan", label: t("vegan"), type: "boolean" },
    { key: "is_gluten_free", label: t("glutenFree"), type: "boolean" },
    {
      key: "is_available",
      label: t("available") ?? "Available",
      type: "boolean",
    },
    { key: "is_featured", label: t("featured") ?? "Featured", type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  if (loading) {
    return (
      <Box padding="24px">
        <Typography variant="body">{t("loading")}</Typography>
      </Box>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("menuItems"), href: "/admin/menu-items" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("menuItems")}`
            : `${t("edit")} - ${t("menuItems")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={values}
        onChange={handleChange}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        imagesSlot={
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
          <MenuIngredientsEditor
            value={ingredients}
            onChange={setIngredients}
            currency={String(values.currency ?? "USD")}
          />
          <MenuRecipeEditor value={recipe} onChange={setRecipe} />
        </Box>
      </AdminForm>
    </>
  );
}
