"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import {
  getIngredient,
  createIngredient,
  updateIngredient,
  checkSlug,
} from "@/lib/admin-api";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NutritionWebSearch } from "./nutrition-web-search";
import { PriceWebSearch } from "./price-web-search";
import {
  IngredientProvidersEditor,
  type ProviderRow,
} from "./ingredient-providers-editor";

/** Quantity units, matching the API's QUANTITY_UNIT_CHOICES. */
const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "mg", label: "mg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "cup", label: "cup" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "pc", label: "pc" },
  { value: "slice", label: "slice" },
  { value: "scoop", label: "scoop" },
];

/** Currencies, matching the API's CURRENCY_CHOICES (as on the menu-item form). */
const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "MXN", label: "MXN" },
  { value: "GBP", label: "GBP" },
  { value: "CAD", label: "CAD" },
  { value: "CLP", label: "CLP" },
  { value: "BRL", label: "BRL" },
];

/** The FDA nutrition fields (keys match the API), each an optional number. */
const NUTRIENT_KEYS = [
  "calories",
  "total_fat",
  "saturated_fat",
  "trans_fat",
  "cholesterol",
  "sodium",
  "total_carbohydrate",
  "dietary_fiber",
  "total_sugars",
  "added_sugars",
  "protein",
  "vitamin_d",
  "calcium",
  "iron",
  "potassium",
] as const;

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminIngredientFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const emptyNutrition = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, ""]));
  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    slug: "",
    description: "",
    en_description: "",
    unit: "g",
    nutrition_basis_quantity: "100",
    price: "",
    currency: "USD",
    enabled: true,
    ...emptyNutrition,
  });
  const [existingImage, setExistingImage] = useState<
    { id: number; url: string }[]
  >([]);
  const [pendingImage, setPendingImage] = useState<NewImage[]>([]);
  // Purchasing sources for this ingredient (name/link/price/currency). Edited in
  // the form's local state and persisted (nested) on submit; the web price search
  // appends to it.
  const [providers, setProviders] = useState<ProviderRow[]>([]);
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
        "ingredient",
        currentSlug,
        !isNew ? Number(id) : undefined,
      );
      if (!result.available) setSlugError(t("slugTaken"));
    } catch {
      /* ignore */
    }
  }, [values.slug, isNew, id, t]);

  useEffect(() => {
    if (!isNew) {
      getIngredient(Number(id))
        .then((data) => {
          const loaded: Record<string, unknown> = {
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            slug: data.slug ?? "",
            description: data.description ?? "",
            en_description: data.en_description ?? "",
            unit: data.unit ?? "g",
            nutrition_basis_quantity: data.nutrition_basis_quantity ?? "100",
            price: data.price ?? "",
            currency: data.currency ?? "USD",
            enabled: data.enabled ?? true,
          };
          for (const k of NUTRIENT_KEYS) loaded[k] = data[k] ?? "";
          setValues(loaded);
          const loadedProviders = Array.isArray(data.providers)
            ? (data.providers as Record<string, unknown>[]).map((p) => ({
                name: String(p.name ?? ""),
                url: String(p.url ?? ""),
                price: p.price == null ? "" : String(p.price),
              }))
            : [];
          setProviders(loadedProviders);
          if (data.image)
            setExistingImage([{ id: Number(id), url: String(data.image) }]);
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // Empty nutrition inputs mean "unknown" -> null, never 0.
      for (const k of NUTRIENT_KEYS) {
        if (payload[k] === "" || payload[k] == null) payload[k] = null;
      }
      // A blank price means "unpriced" -> null, never 0.
      if (payload.price === "" || payload.price == null) payload.price = null;
      // Providers are a full-replace list; drop rows with no link, and send a
      // blank provider price as null (unquoted) rather than 0. They are priced
      // in the ingredient's own currency — there is no per-provider currency.
      payload.providers = providers
        .filter((p) => p.url.trim())
        .map((p) => ({
          name: p.name.trim() || null,
          url: p.url.trim(),
          price: p.price === "" || p.price == null ? null : p.price,
          currency: String(values.currency ?? "USD"),
        }));
      if (pendingImage.length > 0) {
        payload.image = pendingImage[0]?.base64;
      } else if (existingImage.length === 0) {
        payload.image = null;
      }
      if (isNew) {
        const created = await createIngredient(payload);
        setSuccess(t("saved"));
        router.replace(`/admin/ingredients/${created.id}`);
      } else {
        await updateIngredient(Number(id), payload);
        setSuccess(t("saved"));
      }
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const nutrientField = (key: string, label: string): FieldDef => ({
    key,
    label,
    type: "number",
  });

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
      key: "unit",
      label: t("unit") ?? "Unit",
      type: "select",
      options: UNIT_OPTIONS,
      required: true,
    },
    {
      key: "nutrition_basis_quantity",
      label: t("nutritionBasis") ?? "Nutrition per (amount of unit)",
      type: "number",
    },
    {
      key: "currency",
      label: t("currency") ?? "Currency",
      type: "select",
      options: CURRENCY_OPTIONS,
    },
    {
      key: "price",
      label: t("ingredientPrice") ?? "Price (per amount of unit)",
      type: "number",
    },
    {
      key: "description",
      label: t("description") ?? "Description (ES)",
      type: "textarea",
    },
    { key: "en_description", label: "Description (EN)", type: "textarea" },
    // FDA nutrition panel (per basis).
    nutrientField("calories", t("nutrientCalories") ?? "Calories (kcal)"),
    nutrientField("total_fat", t("nutrientTotalFat") ?? "Total Fat (g)"),
    nutrientField(
      "saturated_fat",
      t("nutrientSaturatedFat") ?? "Saturated Fat (g)",
    ),
    nutrientField("trans_fat", t("nutrientTransFat") ?? "Trans Fat (g)"),
    nutrientField(
      "cholesterol",
      t("nutrientCholesterol") ?? "Cholesterol (mg)",
    ),
    nutrientField("sodium", t("nutrientSodium") ?? "Sodium (mg)"),
    nutrientField(
      "total_carbohydrate",
      t("nutrientTotalCarbohydrate") ?? "Total Carbohydrate (g)",
    ),
    nutrientField(
      "dietary_fiber",
      t("nutrientDietaryFiber") ?? "Dietary Fiber (g)",
    ),
    nutrientField(
      "total_sugars",
      t("nutrientTotalSugars") ?? "Total Sugars (g)",
    ),
    nutrientField(
      "added_sugars",
      t("nutrientAddedSugars") ?? "Added Sugars (g)",
    ),
    nutrientField("protein", t("nutrientProtein") ?? "Protein (g)"),
    nutrientField("vitamin_d", t("nutrientVitaminD") ?? "Vitamin D (mcg)"),
    nutrientField("calcium", t("nutrientCalcium") ?? "Calcium (mg)"),
    nutrientField("iron", t("nutrientIron") ?? "Iron (mg)"),
    nutrientField("potassium", t("nutrientPotassium") ?? "Potassium (mg)"),
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  // The nutrient rows (key + label), reused by the "Search on web" preview so it
  // labels each fetched value exactly as the panel does.
  const nutrients = fields
    .filter((f) => (NUTRIENT_KEYS as readonly string[]).includes(f.key))
    .map((f) => ({ key: f.key, label: f.label }));

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
          { label: t("ingredients"), href: "/admin/ingredients" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("ingredients")}`
            : `${t("edit")} - ${t("ingredients")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        slots={[
          {
            // Renders full-width right below the Price field: the web price search
            // and the Providers section (its Apply target).
            beforeKey: "description",
            node: (
              <>
                <PriceWebSearch
                  values={values}
                  onChange={(k, v) =>
                    setValues((prev) => ({ ...prev, [k]: v }))
                  }
                  onAddProviders={(rows) =>
                    setProviders((prev) => [...prev, ...rows])
                  }
                />
                <IngredientProvidersEditor
                  providers={providers}
                  onChange={setProviders}
                />
              </>
            ),
          },
          {
            // Renders full-width right below the description (ES/EN) section and
            // just above the nutrition panel's first field.
            beforeKey: "calories",
            node: (
              <NutritionWebSearch
                values={values}
                onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
                nutrients={nutrients}
              />
            ),
          },
        ]}
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
      />
    </>
  );
}
