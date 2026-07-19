import { cache } from "react";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";

export interface ProductCategory {
  id: number;
  enabled: boolean;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  item_count: number;
}

export interface ServiceCategory {
  id: number;
  enabled: boolean;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  item_count: number;
}

async function fetchWithHost<T>(
  path: string,
  host: string,
  label: string,
): Promise<T[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "X-Website-Host": host },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        `${label} API returned non-OK status`,
      );
      return [];
    }

    return res.json() as Promise<T[]>;
  } catch (err) {
    logger.error({ host, err }, `Failed to fetch ${label}`);
    return [];
  }
}

async function fetchOneWithHost<T>(
  path: string,
  host: string,
  label: string,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "X-Website-Host": host },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        `${label} API returned non-OK status`,
      );
      return null;
    }

    const items = (await res.json()) as T[];
    return items[0] ?? null;
  } catch (err) {
    logger.error({ host, err }, `Failed to fetch ${label}`);
    return null;
  }
}

export const getProductCategories = cache(
  async (): Promise<ProductCategory[]> => {
    const host = await getTenantHost();
    return fetchWithHost<ProductCategory>(
      "/api/catalog/product-categories/",
      host,
      "product categories",
    );
  },
);

export const getServiceCategories = cache(
  async (): Promise<ServiceCategory[]> => {
    const host = await getTenantHost();
    return fetchWithHost<ServiceCategory>(
      "/api/catalog/service-categories/",
      host,
      "service categories",
    );
  },
);

export interface BuyableVariantOptionValue {
  id: number;
  option: number;
  option_name: string;
  name: string | null;
  en_name: string | null;
  slug: string;
  sort_order: number;
  color: string | null;
}

export interface BuyableVariant {
  id: number;
  is_default: boolean;
  option_values: BuyableVariantOptionValue[];
  effective_name: string;
  effective_price: string;
  effective_compare_price: string | null;
  effective_image: string | null;
  /**
   * Products only - a service variant carries no stock, so this is absent there
   * rather than false. Where a product variant has it, it overrides the
   * product's own flag (matching the API's per-line stock check).
   */
  in_stock?: boolean;
}

export interface FeaturedProduct {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  background_color: string | null;
  price: string;
  compare_price: string | null;
  currency: string;
  in_stock: boolean;
  is_featured: boolean;
  variants: BuyableVariant[];
}

export interface FeaturedService {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  background_color: string | null;
  price: string;
  compare_price: string | null;
  currency: string;
  is_featured: boolean;
  modality: string | null;
  duration: number | null;
  variants: BuyableVariant[];
}

// ---------------------------------------------------------------------------
// Full detail types (returned by the detail/list endpoints)
// ---------------------------------------------------------------------------

export interface ProductImage {
  id: number;
  image: string | null;
  name: string | null;
  sort_order: number;
}

export interface ProductVariantImage {
  id: number;
  image: string | null;
  name: string | null;
  sort_order: number;
}

export interface ProductVariantFull {
  id: number;
  is_default: boolean;
  sort_order: number;
  name: string | null;
  en_name: string | null;
  sku: string | null;
  barcode: string | null;
  price: string | null;
  compare_price: string | null;
  in_stock: boolean;
  stock_count: number | null;
  weight: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  image: string | null;
  images: ProductVariantImage[];
  option_values: BuyableVariantOptionValue[];
  effective_name: string;
  effective_price: string;
  effective_compare_price: string | null;
  effective_image: string | null;
}

export interface ProductDetail {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  video_link: string | null;
  background_color: string | null;
  price: string;
  compare_price: string | null;
  currency: string;
  in_stock: boolean;
  stock_count: number | null;
  is_featured: boolean;
  sku: string | null;
  barcode: string | null;
  brand: number | null;
  brand_name: string | null;
  category: number | null;
  category_name: string | null;
  category_slug: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  weight: string | null;
  dimension_unit: string | null;
  weight_unit: string | null;
  images: ProductImage[];
  variants: ProductVariantFull[];
}

export interface ServiceImage {
  id: number;
  image: string | null;
  name: string | null;
  sort_order: number;
}

export interface ServiceVariantFull {
  id: number;
  is_default: boolean;
  sort_order: number;
  name: string | null;
  en_name: string | null;
  sku: string | null;
  price: string | null;
  compare_price: string | null;
  duration: number | null;
  modality: string | null;
  image: string | null;
  option_values: BuyableVariantOptionValue[];
  effective_name: string;
  effective_price: string;
  effective_compare_price: string | null;
  effective_image: string | null;
  effective_duration: number | null;
  effective_modality: string | null;
}

export interface ServiceDetail {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  video_link: string | null;
  background_color: string | null;
  price: string;
  compare_price: string | null;
  currency: string;
  is_featured: boolean;
  sku: string | null;
  brand: number | null;
  brand_name: string | null;
  category: number | null;
  category_name: string | null;
  category_slug: string | null;
  duration: number | null;
  modality: string | null;
  images: ServiceImage[];
  variants: ServiceVariantFull[];
}

export const getFeaturedProducts = cache(
  async (): Promise<FeaturedProduct[]> => {
    const host = await getTenantHost();
    return fetchWithHost<FeaturedProduct>(
      "/api/catalog/products/?featured=true",
      host,
      "featured products",
    );
  },
);

export const getFeaturedServices = cache(
  async (): Promise<FeaturedService[]> => {
    const host = await getTenantHost();
    return fetchWithHost<FeaturedService>(
      "/api/catalog/services/?featured=true",
      host,
      "featured services",
    );
  },
);

export const getAllProducts = cache(async (): Promise<FeaturedProduct[]> => {
  const host = await getTenantHost();
  return fetchWithHost<FeaturedProduct>(
    "/api/catalog/products/",
    host,
    "all products",
  );
});

export const getAllServices = cache(async (): Promise<FeaturedService[]> => {
  const host = await getTenantHost();
  return fetchWithHost<FeaturedService>(
    "/api/catalog/services/",
    host,
    "all services",
  );
});

export async function getProductCategory(
  slug: string,
): Promise<ProductCategory | null> {
  const categories = await getProductCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function getServiceCategory(
  slug: string,
): Promise<ServiceCategory | null> {
  const categories = await getServiceCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function getProductsByCategory(
  categoryId: number,
): Promise<FeaturedProduct[]> {
  const host = await getTenantHost();
  return fetchWithHost<FeaturedProduct>(
    `/api/catalog/products/?category=${categoryId}`,
    host,
    `products(category=${categoryId})`,
  );
}

export async function getServicesByCategory(
  categoryId: number,
): Promise<FeaturedService[]> {
  const host = await getTenantHost();
  return fetchWithHost<FeaturedService>(
    `/api/catalog/services/?category=${categoryId}`,
    host,
    `services(category=${categoryId})`,
  );
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const host = await getTenantHost();
  return fetchOneWithHost<ProductDetail>(
    `/api/catalog/products/?slug=${encodeURIComponent(slug)}`,
    host,
    `product(${slug})`,
  );
}

export async function getService(slug: string): Promise<ServiceDetail | null> {
  const host = await getTenantHost();
  return fetchOneWithHost<ServiceDetail>(
    `/api/catalog/services/?slug=${encodeURIComponent(slug)}`,
    host,
    `service(${slug})`,
  );
}

// ---------------------------------------------------------------------------
// Menu (food) types + fetchers
// ---------------------------------------------------------------------------

export interface MenuCategory {
  id: number;
  enabled: boolean;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  item_count: number;
}

/** The 15 FDA "Nutrition Facts" quantities, stated per an ingredient's basis. */
export interface IngredientNutrition {
  calories: string | null;
  total_fat: string | null;
  saturated_fat: string | null;
  trans_fat: string | null;
  cholesterol: string | null;
  sodium: string | null;
  total_carbohydrate: string | null;
  dietary_fiber: string | null;
  total_sugars: string | null;
  added_sugars: string | null;
  protein: string | null;
  vitamin_d: string | null;
  calcium: string | null;
  iron: string | null;
  potassium: string | null;
}

/** A reusable, System-scoped ingredient with its FDA nutrition panel. Nutrition
 *  values are stated per `nutrition_basis_quantity` of `unit`. */
export interface Ingredient extends IngredientNutrition {
  id: number;
  enabled: boolean;
  system: number | null;
  name: string;
  en_name: string | null;
  slug: string;
  description: string | null;
  en_description: string | null;
  image: string | null;
  unit: string;
  nutrition_basis_quantity: string;
}

/** One alternative ingredient in a single-select choice group. Its nutrition
 *  (`ingredient_detail`/`calories`) is stated against the *group's* shared
 *  portion, so it can substitute for the default without re-deriving the amount. */
export interface MenuItemIngredientOption {
  /** The option row's id. */
  id: number;
  /** The referenced reusable Ingredient's id (the selection value). */
  ingredient: number;
  /** The full referenced ingredient, when the API embeds it. */
  ingredient_detail?: Ingredient;
  name: string;
  en_name: string | null;
  image: string | null;
  /** Up-charge per unit when this option is chosen. */
  price: string;
  /** kcal this option contributes at the group's portion, or null. */
  calories: number | null;
  sort_order: number;
}

export interface MenuItemIngredient {
  id: number;
  /** Whether the ingredient is active; disabled rows are hidden from customers. */
  enabled: boolean;
  /** The referenced reusable Ingredient's id (the *default* option of the group). */
  ingredient: number;
  /** The full referenced ingredient, when the API embeds it. */
  ingredient_detail?: Ingredient;
  /** Sourced from the referenced ingredient (kept flat for compatibility). */
  name: string;
  en_name: string | null;
  image: string | null;
  /** Optional customer-facing label for a single-select choice group (e.g.
   *  "Sweetener"), shown as the heading above the choice chips. Null on a plain
   *  single-ingredient row. */
  group_name: string | null;
  group_en_name: string | null;
  /** The recipe portion; also drives the scaled `calories`. */
  quantity: string | null;
  unit: string | null;
  /** kcal this portion contributes, scaled from the ingredient. */
  calories: number | null;
  price: string;
  /**
   * `false` = included by default (locked, in the base price, shown as
   * "Included"); `true` = an optional add-on the customer adjusts 0→max_quantity,
   * each unit charged `price`.
   */
  is_removable: boolean;
  /**
   * Internal recipe-only component: hidden from the customiser and excluded from
   * pricing, but still counted in the nutrition label. For kitchen/recipe use.
   */
  is_internal: boolean;
  max_quantity: number;
  /** Units the customer gets free before `price` applies (removable add-ons). */
  number_of_free_portions: number;
  /** Admin-set quantity pre-selected in the stepper (removable add-ons). */
  default_quantity: number;
  /** Free units baked into the base price (= `number_of_free_portions` for a
   *  removable add-on, 1 for a locked non-removable ingredient). */
  included_units: number;
  /** Effective pre-selected quantity the stepper starts at (= `default_quantity`
   *  for a removable add-on, 1 for a locked non-removable ingredient). */
  default_units: number;
  sort_order: number;
  /** Alternative ingredients for a single-select choice group; empty for a plain
   *  single-ingredient row. The default option is this row's own fields. */
  options: MenuItemIngredientOption[];
}

export interface MenuItemImageT {
  id: number;
  image: string | null;
  name: string | null;
  sort_order: number;
}

/** Shape shared by the menu listing card and the detail page - the public
 *  MenuItem serializer returns the same fields for both. */
export interface MenuItemDetail {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  description: string | null;
  en_description: string | null;
  short_description: string | null;
  en_short_description: string | null;
  image: string | null;
  video_link: string | null;
  background_color: string | null;
  price: string;
  compare_price: string | null;
  currency: string;
  is_available: boolean;
  is_featured: boolean;
  show_nutrition_label: boolean;
  category: number | null;
  category_name: string | null;
  category_slug: string | null;
  brand: number | null;
  brand_name: string | null;
  spice_level: number | null;
  servings: number | null;
  portions: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  is_organic: boolean;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens: string | null;
  images: MenuItemImageT[];
  ingredients: MenuItemIngredient[];
}

export const getMenuCategories = cache(async (): Promise<MenuCategory[]> => {
  const host = await getTenantHost();
  return fetchWithHost<MenuCategory>(
    "/api/catalog/menu-categories/",
    host,
    "menu categories",
  );
});

export const getAllMenuItems = cache(async (): Promise<MenuItemDetail[]> => {
  const host = await getTenantHost();
  return fetchWithHost<MenuItemDetail>(
    "/api/catalog/menu-items/",
    host,
    "all menu items",
  );
});

export const getFeaturedMenuItems = cache(
  async (): Promise<MenuItemDetail[]> => {
    const host = await getTenantHost();
    return fetchWithHost<MenuItemDetail>(
      "/api/catalog/menu-items/?featured=true",
      host,
      "featured menu items",
    );
  },
);

export async function getMenuCategory(
  slug: string,
): Promise<MenuCategory | null> {
  const categories = await getMenuCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function getMenuItemsByCategory(
  categoryId: number,
): Promise<MenuItemDetail[]> {
  const host = await getTenantHost();
  return fetchWithHost<MenuItemDetail>(
    `/api/catalog/menu-items/?category=${categoryId}`,
    host,
    `menu items(category=${categoryId})`,
  );
}

export async function getMenuItem(
  slug: string,
): Promise<MenuItemDetail | null> {
  const host = await getTenantHost();
  return fetchOneWithHost<MenuItemDetail>(
    `/api/catalog/menu-items/?slug=${encodeURIComponent(slug)}`,
    host,
    `menu item(${slug})`,
  );
}
