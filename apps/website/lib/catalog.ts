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
  name: string | null;
  en_name: string | null;
  slug: string;
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
