import { cache } from 'react';
import { headers } from 'next/headers';
import logger from './logger';

export interface System {
  id: number;
  enabled: boolean;
  created: string;
  modified: string;
  version: number;
  site_name: string;
  host: string;
  img_logo: string | null;
  img_logo_hero: string | null;
  img_favicon: string | null;
  img_manifest_1080: string | null;
  img_manifest_512: string | null;
  img_manifest_256: string | null;
  img_manifest_128: string | null;
  video_link: string | null;
  primary_color: string;
  secondary_color: string;
  about: string;
  en_about: string;
  mission: string;
  en_mission: string;
  vision: string;
  en_vision: string;
  img_about: string | null;
  privacy_policy: string;
  en_privacy_policy: string;
  terms_and_conditions: string;
  en_terms_and_conditions: string;
  user_data: string;
  en_user_data: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';
const SYSTEM_REVALIDATE = process.env.NODE_ENV === 'production' ? 3600 : 0;

/**
 * Fetches the System record matching the current request host.
 *
 * - React.cache() deduplicates repeated calls within the same request
 *   (layout + generateMetadata + page all share one fetch).
 * - next: { revalidate: 3600 } caches the response in the Next.js Data
 *   Cache for 1 hour, avoiding repeated upstream calls across requests.
 */
export const getSystem = cache(async (): Promise<System | null> => {
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  try {
    const res = await fetch(`${API_URL}/api/system/`, {
      headers: {
        // Forward the original request host so Django can match the correct
        // System record (the Django view reads HTTP_X_WEBSITE_HOST first).
        'X-Website-Host': host,
      },
      next: { revalidate: SYSTEM_REVALIDATE },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        'System API returned non-OK status',
      );
      return null;
    }

    return res.json() as Promise<System>;
  } catch (err) {
    logger.error({ host, err }, 'Failed to fetch system configuration');
    return null;
  }
});
