import { clearTokens, getAccessToken, refreshTokens } from './auth';
import { API_URL } from './config';

function buildHeaders(token: string | null, extra: HeadersInit = {}): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// Helper: authenticated fetch with automatic token refresh on 401
async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: buildHeaders(token, options.headers),
  });

  if (res.status === 401) {
    const newToken = await refreshTokens();
    if (!newToken) {
      clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
      return res;
    }
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: buildHeaders(newToken, options.headers),
    });
  }

  return res;
}

export class AdminApiError extends Error {
  constructor(public readonly status: number, public readonly data: Record<string, unknown>) {
    super('Admin API request failed');
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
  const res = await adminFetch(`/api/system/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Products ----
export async function listProducts(systemId: number) {
  const res = await adminFetch(`/api/catalog/products/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getProduct(pk: number) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createProduct(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateProduct(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProduct(pk: number) {
  const res = await adminFetch(`/api/catalog/products/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Product Images ----
export async function listProductImages(productId: number) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createProductImage(productId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProductImage(productId: number, imgId: number) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/${imgId}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}
export async function updateProductImage(productId: number, imgId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/products/${productId}/images/${imgId}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Product Categories ----
export async function listProductCategories(systemId: number) {
  const res = await adminFetch(`/api/catalog/product-categories/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getProductCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createProductCategory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/product-categories/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateProductCategory(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteProductCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/product-categories/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Services ----
export async function listServices(systemId: number) {
  const res = await adminFetch(`/api/catalog/services/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getService(pk: number) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createService(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateService(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteService(pk: number) {
  const res = await adminFetch(`/api/catalog/services/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Service Images ----
export async function listServiceImages(serviceId: number) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createServiceImage(serviceId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteServiceImage(serviceId: number, imgId: number) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/${imgId}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}
export async function updateServiceImage(serviceId: number, imgId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/services/${serviceId}/images/${imgId}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}

// ---- Service Categories ----
export async function listServiceCategories(systemId: number) {
  const res = await adminFetch(`/api/catalog/service-categories/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getServiceCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createServiceCategory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/service-categories/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateServiceCategory(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteServiceCategory(pk: number) {
  const res = await adminFetch(`/api/catalog/service-categories/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Brands ----
export async function listBrands(systemId: number) {
  const res = await adminFetch(`/api/brands/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getBrand(pk: number) {
  const res = await adminFetch(`/api/brands/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createBrand(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/brands/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateBrand(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/brands/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteBrand(pk: number) {
  const res = await adminFetch(`/api/brands/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Variant Options ----
export async function listVariantOptions(systemId: number) {
  const res = await adminFetch(`/api/catalog/variant-options/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getVariantOption(pk: number) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createVariantOption(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/variant-options/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateVariantOption(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteVariantOption(pk: number) {
  const res = await adminFetch(`/api/catalog/variant-options/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Success Stories ----
export async function listSuccessStories(systemId: number) {
  const res = await adminFetch(`/api/success-stories/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getSuccessStory(pk: number) {
  const res = await adminFetch(`/api/success-stories/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createSuccessStory(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/success-stories/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateSuccessStory(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/success-stories/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteSuccessStory(pk: number) {
  const res = await adminFetch(`/api/success-stories/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Success Story Images ----
export async function listSuccessStoryImages(storyId: number) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function createSuccessStoryImage(storyId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateSuccessStoryImage(storyId: number, imgId: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/${imgId}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteSuccessStoryImage(storyId: number, imgId: number) {
  const res = await adminFetch(`/api/success-stories/${storyId}/images/${imgId}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Highlights ----
export async function listHighlights(systemId: number) {
  const res = await adminFetch(`/api/highlights/?system=${systemId}`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function getHighlight(pk: number) {
  const res = await adminFetch(`/api/highlights/${pk}/`);
  return parseResponse<Record<string, unknown>>(res);
}
export async function createHighlight(data: Record<string, unknown>) {
  const res = await adminFetch(`/api/highlights/`, { method: 'POST', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function updateHighlight(pk: number, data: Record<string, unknown>) {
  const res = await adminFetch(`/api/highlights/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
export async function deleteHighlight(pk: number) {
  const res = await adminFetch(`/api/highlights/${pk}/`, { method: 'DELETE' });
  return parseResponse<void>(res);
}

// ---- Slug check ----
export async function checkSlug(model: string, slug: string, excludeId?: number) {
  const params = new URLSearchParams({ model, slug });
  if (excludeId !== undefined) params.set('exclude_id', String(excludeId));
  const res = await adminFetch(`/api/check-slug/?${params.toString()}`);
  return parseResponse<{ available: boolean }>(res);
}

// ---- Users ----
export async function listAdminUsers() {
  const res = await adminFetch(`/api/auth/admin/users/`);
  return parseResponse<Record<string, unknown>[]>(res);
}
export async function updateAdminUser(pk: number, data: { is_admin?: boolean; is_active?: boolean }) {
  const res = await adminFetch(`/api/auth/admin/users/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) });
  return parseResponse<Record<string, unknown>>(res);
}
