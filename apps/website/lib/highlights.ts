import { cache } from 'react';
import { headers } from 'next/headers';
import { API_URL } from './config';
import logger from './logger';

export interface CompanyHighlightItem {
  id: number;
  name: string | null;
  en_name: string | null;
  short_description: string | null;
  en_short_description: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  fit: string | null;
  background_color: string | null;
  href: string | null;
  icon: string | null;
  sort_order: number;
}

export interface CompanyHighlight {
  id: number;
  enabled: boolean;
  created: string;
  modified: string;
  system: number | null;
  category: string | null;
  en_category: string | null;
  name: string | null;
  en_name: string | null;
  short_description: string | null;
  en_short_description: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  fit: string | null;
  background_color: string | null;
  href: string | null;
  icon: string | null;
  size: 'sm' | 'md' | 'lg' | 'xl';
  slug: string | null;
  sort_order: number;
  items: CompanyHighlightItem[];
}

export const getHighlight = cache(async (slug: string): Promise<CompanyHighlight | null> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  try {
    const res = await fetch(`${API_URL}/api/highlights/slug/${slug}/`, {
      headers: { 'X-Website-Host': host },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      logger.warn(
        { host, slug, status: res.status },
        'Highlight by slug API returned non-OK status',
      );
      return null;
    }

    return res.json() as Promise<CompanyHighlight>;
  } catch (err) {
    logger.error({ host, slug, err }, 'Failed to fetch highlight by slug');
    return null;
  }
});

export const getHighlights = cache(async (): Promise<CompanyHighlight[]> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  try {
    const res = await fetch(`${API_URL}/api/highlights/`, {
      headers: { 'X-Website-Host': host },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        'Highlights API returned non-OK status',
      );
      return [];
    }

    return res.json() as Promise<CompanyHighlight[]>;
  } catch (err) {
    logger.error({ host, err }, 'Failed to fetch highlights');
    return [];
  }
});
