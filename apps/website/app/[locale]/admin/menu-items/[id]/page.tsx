"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
// `lib/catalog-paths.ts` is server-free, so a client form may read it.
import { menuItemHref } from "@/lib/catalog-paths";
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
  MenuIngredientsEditor,
  type IngredientRow,
  type IngredientOption,
} from "@/components/admin/menu-ingredients-editor";
import {
  MenuRecipeEditor,
  type RecipeValue,
} from "@/components/admin/menu-recipe-editor";
import {
  VariantsEditor,
  type VariantOption,
} from "@/components/admin/variants-editor";
import { RecommendationsEditor } from "@/components/admin/recommendations-editor";
import { useRecommendationsEditor } from "@/hooks/use-recommendations-editor";
import {
  MenuSizesEditor,
  persistMenuSizes,
  toMenuSizeRow,
  type MenuSizeRow,
} from "@/components/admin/menu-sizes-editor";
import {
  getMenuItem,
  cloneMenuItem,
  createMenuItem,
  updateMenuItem,
  listMenuItems,
  listMenuItemImages,
  createStockGalleryRows,
  type StockImageFile,
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
  listIngredients,
  listMenuSizes,
  createMenuSize,
  updateMenuSize,
  deleteMenuSize,
  checkSlug,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { buildSlug } from "@/lib/slug-utils";
import { useSitePrefix } from "../../site-prefix-provider";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Switch } from "@repo/ui/core-elements/switch";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/** How many photos one dish's gallery holds, uploads and picks together. */
const GALLERY_MAX = 10;

type Props = { params: Promise<{ locale: string; id: string }> };

// The dietary/label toggles rendered as one inline, wrapping row below the
// Variants section (rather than as individual boolean fields in the grid).
const INLINE_TOGGLE_KEYS = [
  "is_organic",
  "is_vegetarian",
  "is_vegan",
  "is_gluten_free",
  "show_nutrition_label",
] as const;

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
    // Rewards. Blank is meaningful on both and must stay blank rather than
    // becoming 0 - a blank award inherits the category's, a blank points price
    // means the item cannot be redeemed. `handleSubmit` sends null for either.
    points_award: "",
    points_price: "",
    cost_price: "",
    currency: "USD",
    category: "",
    brand: "",
    is_available: true,
    is_featured: false,
    show_nutrition_label: true,
    // On by default, so a dish filed under a category that has sizes offers them
    // without the operator doing anything; off is the edge-case opt-out.
    sizes_enabled: true,
    enabled: true,
    eta_minutes: "",
    spice_level: "",
    portions: "",
    allergens: "",
    is_organic: false,
    is_vegetarian: false,
    is_vegan: false,
    is_gluten_free: false,
    href: "",
    video_link: "",
  });

  // The main image's uploader and stock picker: one field with two doors. It is
  // a different photo from the gallery - `MenuItem.image` is what a catalog card
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

  // The dish's OWN size rows, which *replace* its category's list when there are
  // any. Empty is the normal state and means "inherit"; `categorySizes` below is
  // what it is inheriting, shown so an empty list does not read as unconfigured.
  const [sizes, setSizes] = useState<MenuSizeRow[]>([]);
  const [originalSizeIds, setOriginalSizeIds] = useState<number[]>([]);
  const [categorySizes, setCategorySizes] = useState<Record<number, string[]>>(
    {},
  );

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [originalIngredientIds, setOriginalIngredientIds] = useState<number[]>(
    [],
  );
  const [recipe, setRecipe] = useState<RecipeValue>(EMPTY_RECIPE);
  const [ingredientCatalog, setIngredientCatalog] = useState<
    IngredientOption[]
  >([]);

  // Sibling variants: the ids currently linked, and the pool of other menu
  // items to pick from (self is excluded where the picker is rendered).
  const [variantIds, setVariantIds] = useState<number[]>([]);
  const [variantCatalog, setVariantCatalog] = useState<VariantOption[]>([]);

  const [categoryOptions, setCategoryOptions] = useState<
    { value: string | number; label: string }[]
  >([]);
  const [categorySlugs, setCategorySlugs] = useState<Record<number, string>>(
    {},
  );
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
    basePath: "/admin/menu-items",
    id,
    systemId,
    list: listMenuItems,
    groupKey: "category",
    groupList: listMenuCategories,
  });

  // Checkout recommendations. `categoryId` follows the *form's* category field
  // rather than the saved row, so re-filing this item updates the "inheriting
  // these" readout before the save - and an empty selection here means it
  // inherits, never that it recommends nothing.
  const recommendations = useRecommendationsEditor({
    systemId,
    source: "menu_item",
    sourceId: isNew ? null : Number(id),
    categoryId: values.category ? Number(values.category) : null,
  });

  // The tenant's slug namespace, from the CMS-wide provider. Null while the
  // System loads, which is what the guard below is for: `buildSlug(name, "")`
  // would give this record a leading hyphen and no namespace at all.
  const sitePrefix = useSitePrefix();
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
      const [cats, brands, ingredients, menuItems] = await Promise.all([
        listMenuCategories(systemId),
        listBrands(systemId),
        listIngredients(systemId),
        listMenuItems(systemId),
      ]);
      setVariantCatalog(
        menuItems.map((m) => ({
          id: m.id as number,
          name: (m.name as string | null) ?? null,
          en_name: (m.en_name as string | null) ?? null,
          image: (m.image as string | null) ?? null,
        })),
      );
      setCategoryOptions(
        cats.map((c) => ({
          value: c.id as number,
          label: String(c.name ?? c.id),
        })),
      );
      // Read off the category payload's nested `sizes` rather than a call per
      // category: this is a read-only note about what the dish inherits, and the
      // public list (enabled rows only) is exactly what a customer would be
      // offered - which is what the note is describing.
      setCategorySizes(
        Object.fromEntries(
          cats.map((c) => [
            c.id as number,
            ((c.sizes as { name?: string }[] | undefined) ?? []).map((s) =>
              String(s.name ?? ""),
            ),
          ]),
        ),
      );
      // The category's *slug* is the first segment of the item's public URL, so
      // "view live" needs it alongside the id the select stores.
      setCategorySlugs(
        Object.fromEntries(
          cats.map((c) => [c.id as number, String(c.slug ?? "")]),
        ),
      );
      setBrandOptions(
        brands.map((b) => ({
          value: b.id as number,
          label: String(b.name ?? b.id),
        })),
      );
      setIngredientCatalog(
        ingredients.map((i) => ({
          id: i.id as number,
          name: (i.name as string | null) ?? null,
          en_name: (i.en_name as string | null) ?? null,
          image: (i.image as string | null) ?? null,
          unit: String(i.unit ?? ""),
          nutrition_basis_quantity:
            (i.nutrition_basis_quantity as string | null) ?? null,
          calories: (i.calories as string | null) ?? null,
          price: (i.price as string | null) ?? null,
          currency: String(i.currency ?? "USD"),
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
      // Separate from the item payload's `sizes`, which is the *effective*
      // (public, enabled-only) list a customer sees. This is the dish's own
      // override rows, which is what the editor writes.
      listMenuSizes("menu-items", Number(id))
        .then((rows) => {
          const mapped = rows.map(toMenuSizeRow);
          setSizes(mapped);
          setOriginalSizeIds(mapped.map((r) => r.id as number));
        })
        .catch(() => {
          /* non-critical: the rest of the form still loads and saves */
        });
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
            points_award: item.points_award ?? "",
            points_price: item.points_price ?? "",
            cost_price: item.cost_price ?? "",
            currency: item.currency ?? "USD",
            category: item.category ?? "",
            brand: item.brand ?? "",
            is_available: item.is_available ?? true,
            is_featured: item.is_featured ?? false,
            show_nutrition_label: item.show_nutrition_label ?? true,
            sizes_enabled: item.sizes_enabled ?? true,
            enabled: item.enabled ?? true,
            eta_minutes: item.eta_minutes ?? "",
            spice_level: item.spice_level ?? "",
            portions: item.portions ?? "",
            allergens: item.allergens ?? "",
            is_organic: item.is_organic ?? false,
            is_vegetarian: item.is_vegetarian ?? false,
            is_vegan: item.is_vegan ?? false,
            is_gluten_free: item.is_gluten_free ?? false,
            href: item.href ?? "",
            video_link: item.video_link ?? "",
          });
          loadImage(item.image, Number(id));
          setExistingImages(
            (images as Record<string, unknown>[]).map((i) => ({
              id: i.id as number,
              url: String(i.image ?? ""),
              sort_order: i.sort_order as number,
            })),
          );
          const ingRows: IngredientRow[] = (
            ings as Record<string, unknown>[]
          ).map((i) => ({
            key: `ing-existing-${i.id}`,
            id: i.id as number,
            ingredient: (i.ingredient as number | null) ?? "",
            group_name: String(i.group_name ?? ""),
            group_en_name: String(i.group_en_name ?? ""),
            price: String(i.price ?? "0.00"),
            quantity: i.quantity == null ? "" : String(i.quantity),
            unit: String(i.unit ?? ""),
            is_removable: Boolean(i.is_removable),
            is_internal: Boolean(i.is_internal),
            max_quantity: String(i.max_quantity ?? "1"),
            number_of_free_portions: String(i.number_of_free_portions ?? "0"),
            default_quantity: String(i.default_quantity ?? "0"),
            enabled: i.enabled !== false,
            options: ((i.options as Record<string, unknown>[]) ?? []).map(
              (o) => ({
                key: `opt-existing-${o.id}`,
                ingredient: (o.ingredient as number | null) ?? "",
                price: String(o.price ?? "0.00"),
              }),
            ),
          }));
          setIngredients(ingRows);
          setOriginalIngredientIds(ingRows.map((r) => r.id as number));
          setVariantIds(
            ((item.variants as { id: number }[] | undefined) ?? []).map(
              (v) => v.id,
            ),
          );
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
  }, [id, isNew, loadImage, loadMeta, t]);

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
    // Reconcile the rows we send with the ids the API assigns, so a freshly
    // created row carries its `id` on the next save (updated, not re-created).
    // Without this, a second save re-POSTs every new row from the first save
    // and duplicates it.
    const reconciled: IngredientRow[] = [];
    for (let i = 0; i < ingredients.length; i++) {
      const row = ingredients[i];
      if (!row) continue;
      // A row is only persistable once a reusable ingredient has been picked;
      // keep unpicked rows in state untouched so the editor doesn't lose them.
      if (row.ingredient === "") {
        reconciled.push(row);
        continue;
      }
      // The group label only applies to a choice group; a plain row clears it so
      // a stray label never lingers after the last alternative is removed.
      const hasOptions = row.options.some((o) => o.ingredient !== "");
      const payload: Record<string, unknown> = {
        ingredient: row.ingredient,
        group_name: hasOptions && row.group_name.trim() ? row.group_name : null,
        group_en_name:
          hasOptions && row.group_en_name.trim() ? row.group_en_name : null,
        price: row.price === "" ? "0.00" : row.price,
        quantity: row.quantity === "" ? null : row.quantity,
        unit: row.unit || null,
        is_removable: row.is_removable,
        is_internal: row.is_internal,
        max_quantity: row.max_quantity === "" ? 1 : Number(row.max_quantity),
        number_of_free_portions:
          row.number_of_free_portions === ""
            ? 0
            : Number(row.number_of_free_portions),
        default_quantity:
          row.default_quantity === "" ? 0 : Number(row.default_quantity),
        sort_order: i,
        enabled: row.enabled,
        // Full-replace the choice-group alternatives; drop any option whose
        // ingredient hasn't been picked yet so a blank select never persists.
        options: row.options
          .filter((o) => o.ingredient !== "")
          .map((o, idx) => ({
            ingredient: o.ingredient,
            price: o.price === "" ? "0.00" : o.price,
            sort_order: idx,
          })),
      };
      if (row.id) {
        await updateMenuItemIngredient(menuItemId, row.id, payload).catch(
          () => null,
        );
        reconciled.push(row);
      } else {
        const created = await createMenuItemIngredient(
          menuItemId,
          payload,
        ).catch(() => null);
        const newId = created?.id;
        // On a failed create the row keeps no id and is retried next save.
        reconciled.push(
          typeof newId === "number" ? { ...row, id: newId } : row,
        );
      }
    }
    setIngredients(reconciled);
    setOriginalIngredientIds(
      reconciled
        .map((r) => r.id)
        .filter((n): n is number => typeof n === "number"),
    );
  };

  const persistSizes = async (menuItemId: number) => {
    const { rows, ids } = await persistMenuSizes(sizes, originalSizeIds, {
      create: (payload) => createMenuSize("menu-items", menuItemId, payload),
      update: (sizeId, payload) =>
        updateMenuSize("menu-items", menuItemId, sizeId, payload),
      remove: (sizeId) => deleteMenuSize("menu-items", menuItemId, sizeId),
    });
    setSizes(rows);
    setOriginalSizeIds(ids);
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
        // ⚠ Both must reach the API as null, never as 0 or "". A blank award
        // means "inherit my category's" and a blank points price means "not
        // redeemable"; coercing either to zero would silently say "earns
        // nothing" and "free", which are different claims entirely.
        "points_award",
        "points_price",
        "cost_price",
        "eta_minutes",
        "spice_level",
        "portions",
        "sku",
        "allergens",
        "href",
        "video_link",
        "brand",
      ].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // `category` is deliberately NOT in that list: it is required on a menu
      // item (it sections the menu and is a segment of the item's URL), so a
      // blank must reach the API as a blank and be refused, not be quietly
      // nulled into a row the storefront then cannot address.
      // Symmetrical sibling variants, sent as a list of MenuItem ids. The write
      // serializer strips any self-reference; an empty list clears them all.
      payload.variants = variantIds;
      // Always sent, like `variants`: an empty list clears this record's own
      // rows, which is how it is handed back to inheriting its category's.
      payload.recommendations = recommendations.value;
      // The main image, and - when it came from a bank - the credit it owes,
      // which has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());

      let menuItemId: number;
      if (isNew) {
        const created = await createMenuItem(payload);
        menuItemId = created.id as number;
        image.settle(created.image, menuItemId);
      } else {
        const updated = await updateMenuItem(Number(id), payload);
        menuItemId = Number(id);
        image.settle(updated.image, menuItemId);
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
      // ⚠ Each picked photo's credit goes in the same create call as its file:
      // storing an image clears any attribution, so a second write would lose
      // the credit that makes the photo legal to publish.
      await createStockGalleryRows(
        stockImages,
        pendingOrder.length + pendingNewImages.length,
        (payload) => createMenuItemImage(menuItemId, payload),
      );
      setStockImages([]);
      for (let i = 0; i < pendingOrder.length; i++) {
        await updateMenuItemImage(menuItemId, pendingOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      await persistSizes(menuItemId);
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

  // Cloning happens server-side (it has to copy the image *files*), and clones
  // the stored record - so anything unsaved in this form is deliberately left
  // out. The dialog says so.
  const handleClone = async (names: { name: string; en_name: string }) => {
    const created = await cloneMenuItem(Number(id), names);
    // The route only changes its dynamic segment, so this page may re-render
    // rather than remount; without this it would show the original's values
    // until the new record's fetch lands.
    setLoading(true);
    router.push(`/admin/menu-items/${created.id as number}`);
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
    // Required, unlike on the product and service forms: the category is the
    // only sectioning a menu has - it groups the menu page, fills the navbar's
    // Menu dropdown and is the first segment of the item's public URL, none of
    // which has an answer for an item filed under nothing.
    {
      key: "category",
      label: t("category") ?? "Category",
      type: "select",
      required: true,
      options: categoryOptions,
      placeholder: t("selectCategory"),
    },
    {
      key: "brand",
      label: t("brand") ?? "Brand",
      type: "select",
      options: brandOptions,
      placeholder: "- None -",
    },
    // The customer-facing "Ready in ..." badge, always authored in minutes; the
    // storefront is what splits it into hours.
    { key: "eta_minutes", label: t("etaMinutes"), type: "number" },
    { key: "spice_level", label: t("spiceLevel"), type: "number" },
    { key: "portions", label: t("portions"), type: "number" },
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
    {
      key: "is_available",
      label: t("available") ?? "Available",
      type: "boolean",
    },
    { key: "is_featured", label: t("featured") ?? "Featured", type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  // Labels for the inline dietary/label toggle row, keyed by field.
  const toggleLabels: Record<(typeof INLINE_TOGGLE_KEYS)[number], string> = {
    is_organic: t("organic"),
    is_vegetarian: t("vegetarian"),
    is_vegan: t("vegan"),
    is_gluten_free: t("glutenFree"),
    show_nutrition_label: t("showNutritionLabel") ?? "Show nutrition label",
  };

  // Both stock-image pickers on this form look for the same thing, so they open
  // on one query - the dish's own name, until the operator edits it.
  const imageQuery =
    String(values.name ?? "").trim() || String(values.en_name ?? "").trim();

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
            : values.slug && categorySlugs[Number(values.category)]
              ? menuItemHref(
                  // The category currently selected in the form, so "view live"
                  // follows the dropdown. It only reaches a real page once
                  // saved - the route serves an item only under its own
                  // category - which is the same caveat the slug field already
                  // has.
                  categorySlugs[Number(values.category)] as string,
                  String(values.slug),
                )
              : // A saved dish always has both, so this is the gap before the
                // fetch (and `loadMeta`, which is a separate call) lands: the
                // button is there, disabled, rather than appearing later.
                null
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
                onChange={(n, d, o) => {
                  setPendingNewImages(n);
                  setPendingDeletedIds(d);
                  setPendingOrder(o);
                }}
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
                : variantCatalog.filter((m) => m.id !== Number(id))
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

          {/* Dietary / label toggles, inline and wrapping to new rows as needed. */}
          <Box display="flex" alignItems="center" flexWrap="wrap" gap="24px">
            {INLINE_TOGGLE_KEYS.map((key) => (
              <Box key={key} display="flex" alignItems="center" gap="10px">
                <Switch
                  checked={Boolean(values[key])}
                  onChange={(v) => handleChange(key, v)}
                  aria-label={toggleLabels[key]}
                />
                <Typography
                  as="span"
                  variant="body"
                  fontWeight={500}
                  color="var(--foreground)"
                >
                  {toggleLabels[key]}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Sizes above the ingredients, mirroring the customer's own order of
              decisions: which size, then what goes on it. */}
          <MenuSizesEditor
            value={sizes}
            onChange={setSizes}
            scope="item"
            sizesEnabled={Boolean(values.sizes_enabled)}
            onSizesEnabledChange={(v) => handleChange("sizes_enabled", v)}
            inheritedSizes={categorySizes[Number(values.category)] ?? []}
          />

          <MenuIngredientsEditor
            value={ingredients}
            onChange={setIngredients}
            catalog={ingredientCatalog}
          />
          <MenuRecipeEditor value={recipe} onChange={setRecipe} />

          {/* Pricing & Costs, at the end of the form. */}
          <PricingSection
            values={values}
            onChange={handleChange}
            ingredients={ingredients}
            catalog={ingredientCatalog}
          />
        </Box>
      </AdminForm>
    </>
  );
}
