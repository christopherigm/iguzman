/**
 * Authenticated fetch for the admin CMS. Requests go to the same-origin
 * `/api/admin/*` route handler, which attaches the bearer token from the
 * HTTP-only cookie and transparently refreshes it on 401 - so there is no token
 * for this module (or any other browser code) to hold.
 */
import type {
  Order,
  OrderStatus,
  PaymentMethod,
  PosPaymentMethod,
} from "./orders-shared";

async function adminFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(path.replace(/^\/api\//, "/api/admin/"), {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  // A 401 here means the refresh token is gone or rejected too: genuinely logged
  // out. The session lives in the cookie the server already cleared, so a full
  // navigation to /auth is all that is needed - there is no client store to purge.
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/auth";
  }

  return res;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("Admin API request failed");
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- System ----
export async function getSystem(pk: number) {
  const res = await adminFetch(`/api/system/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateSystem(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/system/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Products ----
export async function listProducts(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/products/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getProduct(pk: number) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createProduct(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateProduct(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProduct(pk: number) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

/**
 * The names a clone is created with. `en_name` may be blank - the API stores
 * that as "no English name" rather than an empty one.
 */
export type CloneNames = { name: string; en_name: string };

/**
 * Deep-copy a catalog record: its own row, child rows (gallery, ingredients,
 * recipe) and its **own copies of the image files**.
 *
 * Server-side on purpose - the browser could only duplicate an image by
 * downloading it and re-uploading it as base64. The copy is made from what is
 * stored, so unsaved edits in the form are not part of it.
 */
export async function cloneProduct(pk: number, names: CloneNames) {
  const res = await adminFetch(`/api/catalog/products/${pk}/clone/`, {
    method: "POST",
    body: JSON.stringify(names),
  });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Product Images ----
export async function listProductImages(productId: number) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createProductImage(
  productId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProductImage(productId: number, imgId: number) {
  const res = await adminFetch(
    `/api/catalog/products/${productId}/images/${imgId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}
export async function updateProductImage(
  productId: number,
  imgId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/products/${productId}/images/${imgId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Product Categories ----
export async function listProductCategories(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/product-categories/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getProductCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createProductCategory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/product-categories/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateProductCategory(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProductCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Services ----
export async function listServices(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/services/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getService(pk: number) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createService(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateService(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteService(pk: number) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

/** Deep-copy a service. See `cloneProduct`. */
export async function cloneService(pk: number, names: CloneNames) {
  const res = await adminFetch(`/api/catalog/services/${pk}/clone/`, {
    method: "POST",
    body: JSON.stringify(names),
  });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Service Images ----
export async function listServiceImages(serviceId: number) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createServiceImage(
  serviceId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteServiceImage(serviceId: number, imgId: number) {
  const res = await adminFetch(
    `/api/catalog/services/${serviceId}/images/${imgId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}
export async function updateServiceImage(
  serviceId: number,
  imgId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/services/${serviceId}/images/${imgId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Service Categories ----
export async function listServiceCategories(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/service-categories/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getServiceCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createServiceCategory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/service-categories/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateServiceCategory(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteServiceCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Menu Items (food) ----
export async function listMenuItems(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/menu-items/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getMenuItem(pk: number) {
  const res = await adminFetch(`/api/catalog/menu-items/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createMenuItem(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/menu-items/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateMenuItem(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/menu-items/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteMenuItem(pk: number) {
  const res = await adminFetch(`/api/catalog/menu-items/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

/**
 * Deep-copy a menu item. See `cloneProduct`. Ingredients themselves are shared
 * catalog records, so the clone references the same ones rather than duplicating
 * them.
 */
export async function cloneMenuItem(pk: number, names: CloneNames) {
  const res = await adminFetch(`/api/catalog/menu-items/${pk}/clone/`, {
    method: "POST",
    body: JSON.stringify(names),
  });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Menu Item Images ----
export async function listMenuItemImages(menuItemId: number) {
  const res = await adminFetch(`/api/catalog/menu-items/${menuItemId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createMenuItemImage(
  menuItemId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/images/`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteMenuItemImage(menuItemId: number, imgId: number) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/images/${imgId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}
export async function updateMenuItemImage(
  menuItemId: number,
  imgId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/images/${imgId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Ingredients (reusable catalog) ----
export async function listIngredients(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/ingredients/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getIngredient(pk: number) {
  const res = await adminFetch(`/api/catalog/ingredients/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createIngredient(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/ingredients/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateIngredient(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/ingredients/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
/**
 * One menu-item row still referencing a shared ingredient, and so blocking its
 * delete. `role` says what the ingredient is to that row: an ordinary
 * single-ingredient row (`plain`), the *default* of a single-select choice group
 * (`group_default`), or one of that group's alternatives (`group_option`).
 * `can_promote` is whether a `group_default` has another alternative to take its
 * place - without one, detaching takes the group with it.
 */
export interface IngredientUsage {
  menu_item_ingredient: number;
  menu_item: number;
  menu_item_name: string | null;
  role: "plain" | "group_default" | "group_option";
  group_name: string | null;
  group_en_name: string | null;
  option_count: number;
  can_promote: boolean;
}

/**
 * How a delete should resolve the rows above. `detach` keeps the dishes and only
 * removes this ingredient from them (promoting a group's first alternative where
 * it was the default); `groups` deletes the whole choice group each usage belongs
 * to. Omitted, the API refuses with a 409 naming the usages.
 */
export type IngredientDeleteMode = "detach" | "groups";

export async function deleteIngredient(
  pk: number,
  mode?: IngredientDeleteMode,
) {
  const res = await adminFetch(
    `/api/catalog/ingredients/${pk}/${mode ? `?mode=${mode}` : ""}`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}
/**
 * Fetch FDA nutrition values for an ingredient from the open web (scraper +
 * LLM, all backend-side). Returns each nutrient field as a numeric string, or
 * `null` for anything the sources didn't support. Nothing is persisted - the
 * form previews the result and applies only the non-null fields.
 */
export async function lookupIngredientNutrition(data: {
  name?: string;
  en_name?: string;
  unit?: string;
  nutrition_basis_quantity?: string;
}) {
  const res = await adminFetch(`/api/catalog/ingredients/nutrition-lookup/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<{ nutrients: Record<string, string | null> }>(res);
}

/** A purchasing source for an ingredient, from the price lookup or the form. */
export type IngredientProviderResult = {
  name: string | null;
  url: string;
  price: string | null;
  currency: string;
};

/**
 * Estimate an ingredient's price from the open web and find its providers
 * (scraper + LLM, all backend-side). Returns a single estimated `price` mapped to
 * the requested unit/basis/currency, plus the provider sources found (store,
 * link, quoted price). Nothing is persisted - the form previews the result,
 * applies the price, and appends the providers.
 */
export async function lookupIngredientPrice(data: {
  name?: string;
  en_name?: string;
  unit?: string;
  nutrition_basis_quantity?: string;
  currency?: string;
}) {
  const res = await adminFetch(`/api/catalog/ingredients/price-lookup/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<{
    price: string | null;
    currency: string;
    providers: IngredientProviderResult[];
  }>(res);
}

// ---- Stock images (the CMS image picker) ----

/** One hit from a free stock bank, as the picker grid renders it. */
export type StockImageResult = {
  bank: string;
  bank_id: string;
  /** A small render, for the grid. The full photo is never fetched by the browser. */
  thumbnail: string;
  alt: string;
  attribution: string;
  attribution_url: string;
};

/** The chosen photo, downloaded by the API and handed over as a data URL. */
export type StockImageFile = {
  bank: string;
  bank_id: string;
  /** `data:image/…;base64,…` - the same shape the uploader produces from a file. */
  image: string;
  attribution: string;
  attribution_url: string;
  alt: string;
};

/**
 * Search the free stock banks (Pexels, then Pixabay) for a photo.
 *
 * The keys live in website-api beside the ones `fetch_seed_images` uses, so this
 * app holds no bank credential - the same split the LLM and Stripe calls make.
 * Read-only: nothing is downloaded or stored until `fetchStockImage`.
 */
export async function searchStockImages(data: {
  query: string;
  orientation?: string;
  bank?: string;
}) {
  const res = await adminFetch(`/api/stock-images/search/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<{ banks: string[]; results: StockImageResult[] }>(res);
}

/**
 * Download one chosen photo, as base64, with the credit its bank is owed.
 *
 * ⚠ Addressed by **bank + id, never by URL**: the API re-reads both the file and
 * the credit from the bank, so neither can be chosen by the browser. Feed the
 * result to the form's own save as `image` + `attribution` / `attribution_url` -
 * an upload clears any stored credit, so the pair has to travel with the file.
 */
/**
 * The `image` + credit keys one picked photo contributes to a form's save
 * payload.
 *
 * ⚠ **The three travel together, always in the same write.** Storing an image
 * clears whatever credit the record was carrying (a customer's own photo owes
 * nobody), so a credit sent in a second request is wiped by the first - see
 * website-api's `_apply_attribution`.
 */
export function stockImageFields(picked: StockImageFile) {
  return {
    image: picked.image,
    attribution: picked.attribution,
    attribution_url: picked.attribution_url,
  };
}

/**
 * Write each photo picked from a bank as a row in a record's gallery, after
 * whatever the operator uploaded themselves.
 *
 * `create` is the record's own gallery endpoint (`createProductImage` and its
 * siblings). Failures are swallowed per row, exactly as the upload loops beside
 * it do: one photo the bank could not deliver must not lose the operator the
 * save they just made.
 */
export async function createStockGalleryRows(
  picked: StockImageFile[],
  firstSortOrder: number,
  create: (payload: Record<string, unknown>) => Promise<unknown>,
) {
  for (let i = 0; i < picked.length; i++) {
    await create({
      ...stockImageFields(picked[i]!),
      sort_order: firstSortOrder + i,
    }).catch(() => null);
  }
}

export async function fetchStockImage(data: { bank: string; bank_id: string }) {
  const res = await adminFetch(`/api/stock-images/fetch/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<StockImageFile>(res);
}

// ---- Menu Item Ingredients ----
export async function listMenuItemIngredients(menuItemId: number) {
  // include_disabled is admin-gated server-side, so the CMS editor still sees
  // (and can re-enable) an ingredient whose `enabled` switch was turned off.
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/ingredients/?include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createMenuItemIngredient(
  menuItemId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/ingredients/`,
    { method: "POST", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateMenuItemIngredient(
  menuItemId: number,
  ingId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/ingredients/${ingId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteMenuItemIngredient(
  menuItemId: number,
  ingId: number,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/ingredients/${ingId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}

// ---- Menu Sizes ----
//
// One model, two owners: a category's list (which every dish in it inherits) and
// a dish's own override rows. The four calls below take the owner as a
// `{ owner, id }` pair rather than coming in two families, which is what lets
// `MenuSizesEditor` serve both forms unchanged.

/** Which side of the pair a size list belongs to. The URL segment matches. */
export type MenuSizeOwner = "menu-categories" | "menu-items";

export async function listMenuSizes(owner: MenuSizeOwner, ownerId: number) {
  // include_disabled is admin-gated server-side, so the CMS editor still sees
  // (and can re-enable) a size whose `enabled` switch was turned off.
  const res = await adminFetch(
    `/api/catalog/${owner}/${ownerId}/sizes/?include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createMenuSize(
  owner: MenuSizeOwner,
  ownerId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/${owner}/${ownerId}/sizes/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateMenuSize(
  owner: MenuSizeOwner,
  ownerId: number,
  sizeId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/${owner}/${ownerId}/sizes/${sizeId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteMenuSize(
  owner: MenuSizeOwner,
  ownerId: number,
  sizeId: number,
) {
  const res = await adminFetch(
    `/api/catalog/${owner}/${ownerId}/sizes/${sizeId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}

// ---- Menu Item Recipe (internal) ----
export async function getMenuItemRecipe(menuItemId: number) {
  const res = await adminFetch(`/api/catalog/menu-items/${menuItemId}/recipe/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function saveMenuItemRecipe(
  menuItemId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/catalog/menu-items/${menuItemId}/recipe/`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Menu Categories ----
export async function listMenuCategories(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/menu-categories/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getMenuCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/menu-categories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createMenuCategory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/menu-categories/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateMenuCategory(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/menu-categories/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteMenuCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/menu-categories/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Brands ----
export async function listBrands(systemId: number) {
  const res = await adminFetch(
    `/api/brands/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getBrand(pk: number) {
  const res = await adminFetch(`/api/brands/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createBrand(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/brands/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateBrand(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/brands/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteBrand(pk: number) {
  const res = await adminFetch(`/api/brands/${pk}/`, { method: "DELETE" });
  return parseResponse<void>(res);
}

// ---- Success Stories ----
export async function listSuccessStories(systemId: number) {
  const res = await adminFetch(
    `/api/success-stories/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getSuccessStory(pk: number) {
  const res = await adminFetch(`/api/success-stories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createSuccessStory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/success-stories/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateSuccessStory(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/success-stories/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteSuccessStory(pk: number) {
  const res = await adminFetch(`/api/success-stories/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Events ----
// The list read is unscoped by date on purpose: the CMS is where an author finds
// the event they have not published yet *and* the one that already happened, so
// it asks for `scope=all` (the default) rather than the upcoming/past split the
// public pages use.
export async function listEvents(systemId: number) {
  const res = await adminFetch(
    `/api/events/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getEvent(pk: number) {
  const res = await adminFetch(`/api/events/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createEvent(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/events/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateEvent(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/events/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteEvent(pk: number) {
  const res = await adminFetch(`/api/events/${pk}/`, { method: "DELETE" });
  return parseResponse<void>(res);
}

// ---- Event Images ----
export async function listEventImages(eventId: number) {
  const res = await adminFetch(`/api/events/${eventId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createEventImage(
  eventId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/events/${eventId}/images/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateEventImage(
  eventId: number,
  imgId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/events/${eventId}/images/${imgId}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteEventImage(eventId: number, imgId: number) {
  const res = await adminFetch(`/api/events/${eventId}/images/${imgId}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Success Story Images ----
export async function listSuccessStoryImages(storyId: number) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createSuccessStoryImage(
  storyId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateSuccessStoryImage(
  storyId: number,
  imgId: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(
    `/api/success-stories/${storyId}/images/${imgId}/`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteSuccessStoryImage(storyId: number, imgId: number) {
  const res = await adminFetch(
    `/api/success-stories/${storyId}/images/${imgId}/`,
    { method: "DELETE" },
  );
  return parseResponse<void>(res);
}

// ---- Highlights ----
export async function listHighlights(systemId: number) {
  const res = await adminFetch(
    `/api/highlights/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getHighlight(pk: number) {
  const res = await adminFetch(`/api/highlights/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createHighlight(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/highlights/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateHighlight(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/highlights/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteHighlight(pk: number) {
  const res = await adminFetch(`/api/highlights/${pk}/`, { method: "DELETE" });
  return parseResponse<void>(res);
}

// ---- Homepage flyers ----
export async function listHomepageFlyers(systemId: number) {
  const res = await adminFetch(
    `/api/homepage-flyers/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getHomepageFlyer(pk: number) {
  const res = await adminFetch(`/api/homepage-flyers/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createHomepageFlyer(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/homepage-flyers/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateHomepageFlyer(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/homepage-flyers/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteHomepageFlyer(pk: number) {
  const res = await adminFetch(`/api/homepage-flyers/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Branches (physical locations) ----
export async function listBranches(systemId: number) {
  const res = await adminFetch(
    `/api/branches/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getBranch(pk: number) {
  const res = await adminFetch(`/api/branches/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createBranch(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/branches/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateBranch(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/branches/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteBranch(pk: number) {
  const res = await adminFetch(`/api/branches/${pk}/`, { method: "DELETE" });
  return parseResponse<void>(res);
}

// ---- Contact messages (inbox) ----

/** One message in the admin inbox (see the API's ContactMessageSerializer). */
export interface AdminContactMessage {
  id: number;
  created: string;
  modified: string;
  name: string;
  /** Blank when the customer left only a WhatsApp number. */
  email: string;
  phone: string | null;
  /** Which channel the customer asked to be answered on. */
  preferred_channel: "email" | "whatsapp";
  subject: string | null;
  message: string;
  related_kind: "product" | "service" | "food" | null;
  related_id: number | null;
  related_name: string | null;
  is_read: boolean;
  // An admin's reply sent back to the customer. ⚠ For `email` this was recorded
  // once the mail actually went out; for `whatsapp` it is what an admin said
  // they sent from their own WhatsApp - the API never saw it delivered.
  reply_channel: "email" | "whatsapp" | null;
  reply_subject: string | null;
  reply_body: string | null;
  replied_at: string | null;
  replied_by_name: string | null;
}

export async function listContactMessages() {
  const res = await adminFetch(`/api/contact-messages/admin/`);
  return parseResponse<AdminContactMessage[]>(res);
}
export async function getContactMessage(pk: number) {
  const res = await adminFetch(`/api/contact-messages/admin/${pk}/`);
  return parseResponse<AdminContactMessage>(res);
}
export async function updateContactMessage(
  pk: number,
  data: { is_read?: boolean },
) {
  const res = await adminFetch(`/api/contact-messages/admin/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<AdminContactMessage>(res);
}
export async function deleteContactMessage(pk: number) {
  const res = await adminFetch(`/api/contact-messages/admin/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}
/**
 * Email the customer a reply from the inbox. The reply is recorded on the message
 * (and marks it read) server-side only if the email actually went out, so the
 * returned message carries the truthful `replied_at` / `replied_by_name`.
 */
/**
 * Record (and, for email, send) an admin's reply to a contact message.
 *
 * ⚠ `channel: "whatsapp"` only **records** the reply - the API sends nothing.
 * The caller is responsible for opening the wa.me link that actually delivers
 * it; see `admin/messages/[id]/page.tsx`.
 */
export async function replyToContactMessage(
  pk: number,
  data: { subject?: string; body: string; channel?: "email" | "whatsapp" },
) {
  const res = await adminFetch(`/api/contact-messages/admin/${pk}/reply/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<AdminContactMessage>(res);
}

// ---- Slug check ----
export async function checkSlug(
  model: string,
  slug: string,
  excludeId?: number,
) {
  const params = new URLSearchParams({ model, slug });
  if (excludeId !== undefined) params.set("exclude_id", String(excludeId));
  const res = await adminFetch(`/api/check-slug/?${params.toString()}`);
  return parseResponse<{ available: boolean }>(res);
}

// ---- Users ----
export async function listAdminUsers() {
  const res = await adminFetch(`/api/auth/admin/users/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function updateAdminUser(
  pk: number,
  data: { is_admin?: boolean; is_active?: boolean },
) {
  const res = await adminFetch(`/api/auth/admin/users/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Orders (tenant management) ----

/** One order in full for the CMS - the customer `Order` plus the fulfillment
 *  timestamp the tenant needs; still no Stripe ids. */
export interface AdminOrder extends Order {
  fulfilled_at: string | null;
}

/** One row in the CMS order list (see the API's AdminOrderSummarySerializer). */
export interface AdminOrderSummary {
  public_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  fulfilled: boolean;
  currency: string;
  total: string;
  email: string;
  phone: string;
  shipping_name: string;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  item_count: number;
}

/** The management actions the CMS can take on one order. `complete` settles
 *  payment and fulfillment together and is accepted on counter sales only - see
 *  `AdminOrderActionSerializer` in website-api. */
export type AdminOrderAction =
  "mark_paid" | "mark_fulfilled" | "unmark_fulfilled" | "cancel" | "complete";

export async function listAdminOrders() {
  const res = await adminFetch(`/api/orders/admin/`);
  return parseResponse<AdminOrderSummary[]>(res);
}

export async function getAdminOrder(publicId: string) {
  const res = await adminFetch(`/api/orders/admin/${publicId}/`);
  return parseResponse<AdminOrder>(res);
}

export async function adminOrderAction(
  publicId: string,
  action: AdminOrderAction,
) {
  const res = await adminFetch(`/api/orders/admin/${publicId}/`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return parseResponse<AdminOrder>(res);
}

// ---- POS (counter sales) ----

/** How a counter sale is settled. Both are `Order.POS_METHODS` in website-api;
 *  neither goes near Stripe. Defined next to the other payment methods so the
 *  two lists cannot drift - re-exported here for the POS screen's convenience. */
export type { PosPaymentMethod };

/** One rung-up line, as references only - the API re-prices every one of them
 *  from the tenant's catalog, so no amount travels in this body. */
export interface PosCartLine {
  kind: "product" | "service" | "menu_item";
  id: number;
  quantity: number;
  customization?: { ingredient: number; quantity: number; option?: number }[];
}

/** Optional details for a receipt. Every field may be omitted: at a counter
 *  there is usually nobody to record. */
export interface PosContact {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * Ring up a counter sale. Returns the created order, `placed` and awaiting
 * payment - `adminOrderAction(publicId, "complete")` is what settles it once the
 * associate confirms the customer paid.
 */
export async function posCheckout(payload: {
  cart: PosCartLine[];
  payment_method: PosPaymentMethod;
  contact?: PosContact;
  /**
   * A coupon the customer presented at the counter. The **code only** - the API
   * re-validates it and re-prices the basket, so the till can no more name a
   * discount than it can name a price.
   */
  coupon_code?: string;
}) {
  const res = await adminFetch(`/api/orders/admin/pos/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseResponse<AdminOrder>(res);
}

// ---- Social Posts ----
// Admin-authored social-media flyers. The endpoint is system-scoped from the
// admin's token (like the contact inbox), so no `system` param is sent.

/** The catalog family a social post features - the frontend's `kind` names. */
export type SocialItemKind = "product" | "service" | "food";

/** Aspect-ratio token the template maps to a pixel canvas. */
export type SocialFormat = "1x1" | "4x5";

/** The live item snapshot the API resolves for the flyer preview. */
export interface SocialPostItem {
  kind: SocialItemKind;
  id: number;
  name: string | null;
  en_name: string | null;
  image: string | null;
  price: string | null;
  compare_price: string | null;
  currency: string | null;
}

/** The tenant's brand kit, resolved from its System for the flyer. */
export interface SocialPostBrand {
  name: string | null;
  slogan: string | null;
  logo: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface SocialPost {
  id: number;
  created: string;
  modified: string;
  enabled: boolean;
  sort_order: number;
  name: string;
  related_kind: SocialItemKind;
  related_id: number | null;
  template_id: string;
  format: SocialFormat;
  prompt: string | null;
  image_text: string | null;
  caption: string | null;
  hashtags: string | null;
  include_item_data: boolean;
  include_brand: boolean;
  include_hashtags: boolean;
  /**
   * Post-specific artwork, uploaded in the CMS. `img_item` overrides the
   * catalog item's photo on the flyer; `img_background` is the full-bleed
   * backdrop the templates that declare `supportsBackground` paint. Both are
   * read back as URLs and written as base64 data URLs.
   */
  img_item: string | null;
  img_background: string | null;
  /** Shape framing the centred photo - the hero's logo-background vocabulary. */
  badge_shape: string;
  /** Whole-percent size of the badge (50-100). */
  badge_scale: number;
  /** Whole-percent size of the photo inside the badge (50-100). */
  badge_image_scale: number;
  /**
   * The plate behind the brand logo, in every template - the same shape
   * vocabulary again. "none" draws the logo bare.
   */
  brand_logo_background: string;
  /** Whole-percent size of the logo with its background (50-100). */
  brand_logo_background_scale: number;
  /** Whole-percent size of the logo inside its background (50-100). */
  brand_logo_scale: number;
  item: SocialPostItem | null;
  brand: SocialPostBrand | null;
}

export async function listSocialPosts() {
  const res = await adminFetch(`/api/social-posts/`);
  return parseResponse<SocialPost[]>(res);
}
export async function getSocialPost(pk: number) {
  const res = await adminFetch(`/api/social-posts/${pk}/`);
  return parseResponse<SocialPost>(res);
}
export async function createSocialPost(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/social-posts/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<SocialPost>(res);
}
export async function updateSocialPost(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/social-posts/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<SocialPost>(res);
}
export async function deleteSocialPost(pk: number) {
  const res = await adminFetch(`/api/social-posts/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Coupons ----
// Scoped to the admin's own tenant server-side (from the token), like the
// contact inbox and the order list, so no `system` param is sent.

/** How a coupon's `value` is read: a percentage, or an amount in `currency`. */
export type CouponKind = "percent" | "fixed";

/**
 * The six things a coupon can be aimed at, plus `""` for the whole order.
 * Mirrors `Coupon.SCOPE_CHOICES` in `orders/models.py` - a value here that the
 * API does not know is refused on save.
 *
 * Three families times two levels: an id alone cannot say which of six tables it
 * is in, which is why this rides beside `scope_id` rather than being one number.
 */
export const COUPON_SCOPE_ITEM_KINDS = [
  "product",
  "service",
  "menu_item",
] as const;
export const COUPON_SCOPE_CATEGORY_KINDS = [
  "product_category",
  "service_category",
  "menu_category",
] as const;
export type CouponScopeItemKind = (typeof COUPON_SCOPE_ITEM_KINDS)[number];
export type CouponScopeCategoryKind =
  (typeof COUPON_SCOPE_CATEGORY_KINDS)[number];
export type CouponScopeKind =
  "" | CouponScopeItemKind | CouponScopeCategoryKind;

/** The resolved target of a scoped coupon, as the API snapshots it. */
export interface CouponScopeTarget {
  kind: Exclude<CouponScopeKind, "">;
  id: number;
  name: string | null;
  en_name: string | null;
  /**
   * The category the target is filed under, in the tenant's primary language -
   * what the flyer prefixes its name with. Null for a category target (which is
   * filed under nothing) and for an uncategorized product or service.
   */
  category_name: string | null;
  /** Primary image, falling back to the first gallery row. Null when it has none. */
  image: string | null;
  /** Whether the target is a whole category rather than one item. */
  is_category: boolean;
}

export interface Coupon {
  id: number;
  public_id: string;
  code: string;
  /** Internal label for the CMS list - never shown to a customer. */
  name: string;
  /** Shown to the customer on the `/coupon/<code>` landing the QR points at. */
  description: string;
  kind: CouponKind;
  value: string;
  currency: string;
  /** 0 means unlimited. */
  max_redemptions: number;
  times_redeemed: number;
  /** Null when the coupon is unlimited. */
  redemptions_left: number | null;
  is_exhausted: boolean;
  starts_at: string | null;
  expires_at: string | null;
  min_order_amount: string;
  /**
   * What the discount is allowed to touch. `""` is the whole order - the
   * default, and what every coupon written before this existed is. Anything else
   * names exactly one target through `scope_id`, and the API then prices the
   * discount off **only** the matching cart lines.
   */
  scope_kind: CouponScopeKind;
  /** The target's id within `scope_kind`'s own table. Null when order-wide. */
  scope_id: number | null;
  /**
   * The resolved target - its name and photograph - for the CMS form and the
   * flyer. Read-only; `scope_kind` + `scope_id` are what is written.
   *
   * ⚠ **Null does not mean "order-wide".** It is also what a scope whose target
   * has since been deleted resolves to. Test `scope_kind` to ask whether a
   * coupon is scoped; this field only answers what to draw.
   */
  scope: CouponScopeTarget | null;
  enabled: boolean;
  template_id: string;
  /**
   * The stored QR PNG. **Null when the write failed** - a coupon with no code
   * image is still a working coupon, so every render site must cope rather than
   * assume one is there.
   */
  qr_code: string | null;
  /** The URL that QR encodes, resolved from the tenant's own host by the API. */
  landing_url: string;
  /**
   * The plate behind the brand logo on the flyer, and the two sizes that tune
   * it - the same trio a `SocialPost` carries, so a flyer and a post stay
   * recognisably one brand. Stored (unlike the flyer's backdrop upload) because
   * the lockup is part of how this coupon looks every time it is re-downloaded.
   */
  brand_logo_background: string;
  brand_logo_background_scale: number;
  brand_logo_scale: number;
  created_at: string;
  updated_at: string;
}

export async function listCoupons() {
  const res = await adminFetch(`/api/coupons/admin/`);
  return parseResponse<Coupon[]>(res);
}
export async function getCoupon(pk: number) {
  const res = await adminFetch(`/api/coupons/admin/${pk}/`);
  return parseResponse<Coupon>(res);
}
export async function createCoupon(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/coupons/admin/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Coupon>(res);
}
export async function updateCoupon(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/coupons/admin/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Coupon>(res);
}
export async function deleteCoupon(pk: number) {
  const res = await adminFetch(`/api/coupons/admin/${pk}/`, {
    method: "DELETE",
  });
  return parseResponse<void>(res);
}

// ---- Backups ----
// The four data sections a backup can carry, plus the cross-cutting `images`
// toggle (not a section of its own: it decides whether the media files of the
// selected sections travel with them). Mirrors core/backup.py's ALL_SECTIONS.
export const BACKUP_SECTIONS = [
  "products",
  "services",
  "menu",
  "system",
  "images",
] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export type RestoreMode = "replace" | "merge";

export interface SiteBackup {
  id: number;
  created: string;
  modified: string;
  name: string;
  sections: BackupSection[];
  include_images: boolean;
  size_bytes: number;
  media_files: number;
  /** Row counts keyed by "<app>.<model>", straight from the archive manifest. */
  record_counts: Record<string, number>;
  total_records: number;
  created_by_username: string | null;
  download_url: string;
}

export interface RestoreResult {
  manifest: { host: string; created_at: string; sections: BackupSection[] };
  mode: RestoreMode;
  sections: BackupSection[];
  results: Record<
    string,
    { created: number; updated: number; skipped: number }
  >;
}

export async function listBackups() {
  const res = await adminFetch(`/api/backups/`);
  return parseResponse<SiteBackup[]>(res);
}

export async function createBackup(name: string, sections: BackupSection[]) {
  const res = await adminFetch(`/api/backups/`, {
    method: "POST",
    body: JSON.stringify({ name, sections }),
  });
  return parseResponse<SiteBackup>(res);
}

export async function deleteBackup(pk: number) {
  const res = await adminFetch(`/api/backups/${pk}/`, { method: "DELETE" });
  return parseResponse<void>(res);
}

/**
 * Restore from an uploaded archive, or from a stored restore point.
 *
 * Posts straight to `/api/backups/restore/` rather than through `adminFetch`'s
 * `/api/admin/*` proxy: that proxy is JSON-only and would strip the multipart
 * boundary the file depends on. The route handler there attaches the bearer
 * token exactly the same way.
 */
export async function restoreBackup(options: {
  file?: File;
  backupId?: number;
  sections: BackupSection[];
  mode: RestoreMode;
}) {
  const form = new FormData();
  if (options.file) form.append("file", options.file);
  if (options.backupId != null)
    form.append("backup_id", String(options.backupId));
  form.append("mode", options.mode);
  // Sent as a comma list, not repeated fields: Django's QueryDict would hand the
  // view only the LAST value of a repeated key, silently restoring one section.
  form.append("sections", options.sections.join(","));

  const res = await fetch(`/api/backups/restore/`, {
    method: "POST",
    body: form,
  });
  return parseResponse<RestoreResult>(res);
}

// ---- Storage (per-tenant Cloudflare R2) ----
/**
 * A tenant's own R2 configuration, as the API is willing to report it back.
 *
 * The secret access key is **not** here and has no read path anywhere:
 * `storage_secret_set` is all the CMS is told, which is enough to render "leave
 * blank to keep the current key". Same stance as the Stripe secrets.
 */
export interface StorageConfig {
  storage_enabled: boolean;
  storage_account_id: string;
  storage_access_key_id: string;
  storage_bucket_name: string;
  storage_public_domain: string;
  /** Whether a secret key is on file - never the key itself. */
  storage_secret_set: boolean;
  /** Whether all of it is present, i.e. whether uploads actually go there. */
  storage_configured: boolean;
}

export interface StorageTestResult {
  ok: boolean;
  detail: string;
}

/**
 * Read this tenant's storage config.
 *
 * A separate endpoint from `getSystem`, deliberately: `GET /api/system/` is
 * public and feeds every page, so the bucket name and access key id are not on
 * it. This one is admin-only and scoped to the caller's own System.
 */
export async function getStorageConfig(systemId: number) {
  const res = await adminFetch(`/api/system/${systemId}/storage/`);
  return parseResponse<StorageConfig>(res);
}

/**
 * Round-trip a credential set against R2 without saving it.
 *
 * The values come from the form, so a typo is caught before it becomes the
 * destination for a customer's uploads. Omit `storage_secret_access_key` to test
 * against the stored one - which is the only way to re-test an existing
 * connection, since the form never receives the secret back.
 */
export async function testStorageConnection(
  systemId: number,
  config: Partial<Record<string, string>>,
) {
  const res = await adminFetch(`/api/system/${systemId}/storage/`, {
    method: "POST",
    body: JSON.stringify(config),
  });
  return parseResponse<StorageTestResult>(res);
}

// ---- Bookings (scheduled services) ----

/** The lifecycle of an appointment. Deliberately **not** the order's status:
 *  payment lives on `Order.status`, and a booking can be confirmed on an order
 *  that has not been paid (and never will be, when it is paid in person). */
export type BookingStatus = "pending" | "confirmed" | "completed" | "canceled";

/** Where the work happens. `on_premises` is the customer's own address, which
 *  is then carried on the booking's `address`. */
export type BookingFulfillment = "branch" | "on_premises";

/** What the customer chose to pay at booking time. */
export type BookingPaymentOption = "full" | "deposit" | "in_person";

/** One booking as the CMS list reads it (the API's AdminBookingSerializer). */
export interface AdminBooking {
  id: number;
  status: BookingStatus;
  fulfillment: BookingFulfillment;
  branch: number | null;
  branch_name: string | null;
  /** UTC instant. Render it with `timezone`, never the browser's own - the
   *  appointment happens at the branch's local time. */
  starts_at: string;
  ends_at: string;
  timezone: string;
  duration_minutes: number;
  address: string;
  notes: string;
  payment_option: BookingPaymentOption;
  deposit_percent: number;
  amount_due_now: string;
  amount_due_later: string;
  order_public_id: string;
  order_status: OrderStatus;
  order_total: string;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  service: number | null;
  service_name: string;
  created_at: string;
  /** How many people. `1` on every non-party booking. */
  party_size: number;
  /** The assigned resource's id, or null when the branch defines no pools. */
  resource: number | null;
  resource_name: string | null;
  resource_unit_label: string | null;
}

/** The transitions the CMS may apply. See `AdminBookingActionSerializer`. */
export type AdminBookingAction = "confirm" | "complete" | "cancel" | "reassign";

export async function listAdminBookings(params?: {
  status?: BookingStatus[];
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();
  if (params?.status?.length) search.set("status", params.status.join(","));
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  const res = await adminFetch(
    `/api/bookings/admin/${query ? `?${query}` : ""}`,
  );
  return parseResponse<AdminBooking[]>(res);
}

export async function adminBookingAction(
  id: number,
  action: AdminBookingAction,
) {
  const res = await adminFetch(`/api/bookings/admin/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
  return parseResponse<AdminBooking>(res);
}

/**
 * Move a booking onto another resource.
 *
 * `resource` is `null` to take the party off any specific one, which is what a
 * branch with no pools looks like - so it is sent explicitly rather than
 * omitted, and the API refuses a `reassign` with no key at all.
 *
 * `force` overbooks deliberately, behind a confirmation in the UI: an operator
 * sometimes knows what the seat count cannot (a toddler on a lap), and without
 * an override they would cancel and re-enter the booking to route around us.
 */
export async function reassignBooking(
  id: number,
  resource: number | null,
  force = false,
) {
  const res = await adminFetch(`/api/bookings/admin/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ action: "reassign", resource, force }),
  });
  return parseResponse<AdminBooking>(res);
}

// ---- Checkout recommendations ----
/**
 * One source's **own** recommendation rows.
 *
 * ⚠ For an *item* this is not what a customer is offered: an empty answer means
 * "offer whatever my category recommends", and loading the resolved list into
 * the editor instead would show an operator ticks they never made - which the
 * first save would then freeze into an override. The category's list is fetched
 * separately, for display only. Writes go through the source's own form (the
 * `recommendations` field), so there is no setter here.
 */
export type RecommendationSourceKind =
  | "product"
  | "service"
  | "menu_item"
  | "product_category"
  | "service_category"
  | "menu_category";

export interface RecommendationRow {
  kind: "product" | "service" | "menu_item";
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  image: string | null;
  price: string;
  currency: string;
  sort_order: number;
}

export async function listRecommendations(
  source: RecommendationSourceKind,
  sourceId: number,
) {
  const res = await adminFetch(
    `/api/catalog/recommendations/?source=${source}&id=${sourceId}`,
  );
  return parseResponse<RecommendationRow[]>(res);
}
