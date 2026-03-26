import { cache } from 'react';
import { headers } from 'next/headers';
import { API_URL } from './config';
import logger from './logger';

export interface SuccessStoryImage {
  id: number;
  name: string | null;
  en_name: string | null;
  short_description: string | null;
  en_short_description: string | null;
  description: string | null;
  en_description: string | null;
  image: string | null;
  href: string | null;
  fit: string | null;
  background_color: string | null;
}

export interface SuccessStory {
  id: number;
  enabled: boolean;
  created: string;
  modified: string;
  system: number | null;
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
  slug: string | null;
  images: SuccessStoryImage[];
}

export const getSuccessStory = cache(async (slug: string): Promise<SuccessStory | null> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  try {
    const res = await fetch(`${API_URL}/api/success-stories/slug/${slug}/`, {
      headers: { 'X-Website-Host': host },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      logger.warn(
        { host, slug, status: res.status },
        'Success story by slug API returned non-OK status',
      );
      return null;
    }

    return res.json() as Promise<SuccessStory>;
  } catch (err) {
    logger.error({ host, slug, err }, 'Failed to fetch success story by slug');
    return null;
  }
});

export const getSuccessStories = cache(async (): Promise<SuccessStory[]> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  try {
    const res = await fetch(`${API_URL}/api/success-stories/`, {
      headers: { 'X-Website-Host': host },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        'Success stories API returned non-OK status',
      );
      return [];
    }

    return res.json() as Promise<SuccessStory[]>;
  } catch (err) {
    logger.error({ host, err }, 'Failed to fetch success stories');
    return [];
  }
});
