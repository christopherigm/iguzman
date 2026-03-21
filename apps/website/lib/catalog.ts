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

async function fetchWithHost<T>(path: string, host: string, label: string): Promise<T[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'X-Website-Host': host },
    });

    if (!res.ok) {
      logger.warn({ host, status: res.status }, `${label} API returned non-OK status`);
      return [];
    }

    return res.json() as Promise<T[]>;
  } catch (err) {
    logger.error({ host, err }, `Failed to fetch ${label}`);
    return [];
  }
}

export const getProductCategories = cache(async (): Promise<ProductCategory[]> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';
  return fetchWithHost<ProductCategory>('/api/catalog/product-categories/', host, 'product categories');
});

export const getServiceCategories = cache(async (): Promise<ServiceCategory[]> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';
  return fetchWithHost<ServiceCategory>('/api/catalog/service-categories/', host, 'service categories');
});
