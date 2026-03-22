import { cache } from 'react';
import { headers } from 'next/headers';
import { API_URL } from './config';
import logger from './logger';

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
      headers: { 'X-Website-Host': host },
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
      headers: { 'X-Website-Host': host },
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
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return fetchWithHost<ProductCategory>(
      '/api/catalog/product-categories/',
      host,
      'product categories',
    );
  },
);

export const getServiceCategories = cache(
  async (): Promise<ServiceCategory[]> => {
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return fetchWithHost<ServiceCategory>(
      '/api/catalog/service-categories/',
      host,
      'service categories',
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
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return fetchWithHost<FeaturedProduct>(
      '/api/catalog/products/?featured=true',
      host,
      'featured products',
    );
  },
);

export const getFeaturedServices = cache(
  async (): Promise<FeaturedService[]> => {
    const headersList = await headers();
    const host = headersList.get('host') ?? '';
    return fetchWithHost<FeaturedService>(
      '/api/catalog/services/?featured=true',
      host,
      'featured services',
    );
  },
);

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';
  return fetchOneWithHost<ProductDetail>(
    `/api/catalog/products/?slug=${encodeURIComponent(slug)}`,
    host,
    `product(${slug})`,
  );
}

export async function getService(slug: string): Promise<ServiceDetail | null> {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';
  return fetchOneWithHost<ServiceDetail>(
    `/api/catalog/services/?slug=${encodeURIComponent(slug)}`,
    host,
    `service(${slug})`,
  );
}
