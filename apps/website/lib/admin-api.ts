/**
 * Authenticated fetch for the admin CMS. Requests go to the same-origin
 * `/api/admin/*` route handler, which attaches the bearer token from the
 * HTTP-only cookie and transparently refreshes it on 401 - so there is no token
 * for this module (or any other browser code) to hold.
 */
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
export async function deleteIngredient(pk: number) {
  const res = await adminFetch(`/api/catalog/ingredients/${pk}/`, {
    method: "DELETE",
  });
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
  description?: string;
}) {
  const res = await adminFetch(`/api/catalog/ingredients/nutrition-lookup/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<{ nutrients: Record<string, string | null> }>(res);
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

// ---- Variant Options ----
export async function listVariantOptions(systemId: number) {
  const res = await adminFetch(
    `/api/catalog/variant-options/?system=${systemId}&include_disabled=true`,
  );
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getVariantOption(pk: number) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createVariantOption(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/variant-options/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateVariantOption(
  pk: number,
  data: Record<string, unknown>,
) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteVariantOption(pk: number) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`, {
    method: "DELETE",
  });
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
