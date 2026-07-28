import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { API_URL } from './config';
import logger from './logger';

/**
 * The site's own settings: its name, its brand kit, its palette.
 *
 * Read on **every** page - the locale layout paints the fonts, the page
 * backgrounds and the watermark from it - so it is the one payload in this app
 * that is always fetched. The cache that serves it is animals-api's (Redis in
 * production), which `core/signals.py` clears on every write; `cache()` here
 * collapses the repeated asks within one render into a single fetch.
 *
 * `no-store`, like every other read in this app - see `lib/catalog.ts` for why
 * Next's data cache is deliberately not used.
 *
 * `GET /api/system/` is public, so this is a plain `fetch` - there is no token
 * to attach and no 401 to refresh past.
 */

export interface System {
  id: number;
  site_name: string;
  /** Spanish. Read it through `localized()`, never directly. */
  site_description: string | null;
  en_site_description: string | null;

  contact_email: string | null;
  social_links: { platform: string; url: string }[];

  img_logo: string | null;
  img_logo_hero: string | null;
  img_favicon: string | null;
  img_brandmark: string | null;
  img_about: string | null;
  img_hero: string | null;
  img_manifest_1080: string | null;
  img_manifest_512: string | null;
  img_manifest_256: string | null;
  img_manifest_192: string | null;
  img_manifest_128: string | null;

  primary_color: string;
  secondary_color: string;

  google_font_url: string;
  font_display: string;
  font_body: string;

  hero_text_frame: boolean;

  watermark_enabled: boolean;
  watermark_rotation: number;
  watermark_intercalated: boolean;
  watermark_show_logo: boolean;
  watermark_show_brandmark: boolean;
  watermark_size: number;
  watermark_spacing: number;
  watermark_opacity: number;
  background_light: string;
  background_dark: string;
}

/**
 * What the site renders when the API is unreachable.
 *
 * Not an optional payload: this is on the critical path of every page, so a
 * backend that is down or still migrating must cost the *branding*, not the
 * site. The values match the model's own defaults, so a fresh database and a
 * dead one look the same.
 */
export const SYSTEM_FALLBACK: System = {
  id: 0,
  site_name: 'Field Journal',
  site_description: null,
  en_site_description: null,
  contact_email: null,
  social_links: [],
  img_logo: null,
  img_logo_hero: null,
  img_favicon: null,
  img_brandmark: null,
  img_about: null,
  img_hero: null,
  img_manifest_1080: null,
  img_manifest_512: null,
  img_manifest_256: null,
  img_manifest_192: null,
  img_manifest_128: null,
  primary_color: '#06b6d4',
  secondary_color: '#7c9a3f',
  google_font_url: '',
  font_display: '',
  font_body: '',
  hero_text_frame: false,
  watermark_enabled: false,
  watermark_rotation: -12,
  watermark_intercalated: false,
  watermark_show_logo: true,
  watermark_show_brandmark: false,
  watermark_size: 120,
  watermark_spacing: 70,
  watermark_opacity: 4,
  background_light: '#e5e5e5',
  background_dark: '#3c3c3c',
};

export const getSystem = cache(async (): Promise<System> => {
  try {
    const res = await fetch(`${API_URL}/api/system/`, { cache: 'no-store' });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'system API returned non-OK status');
      return SYSTEM_FALLBACK;
    }
    // Merged over the defaults rather than returned raw, so a payload from an
    // older API (one field short) cannot leave a `undefined` in a CSS variable.
    return { ...SYSTEM_FALLBACK, ...((await res.json()) as Partial<System>) };
  } catch (err) {
    // Next signals its own control flow by throwing; a bare catch around a fetch
    // would swallow it. See the matching note in lib/catalog.ts.
    unstable_rethrow(err);
    logger.error({ err }, 'Failed to fetch the site settings');
    return SYSTEM_FALLBACK;
  }
});

/** The logo to paint, falling back to the file this app ships. */
export function logoUrl(system: System): string {
  return system.img_logo ?? '/logo.png';
}

/**
 * The manifest icons, largest first, dropping the sizes that are not uploaded.
 *
 * Returns `[]` when nothing has been uploaded, so `app/manifest.ts` can fall
 * back to the static icons in `public/` rather than shipping a manifest that
 * points at nothing.
 */
export function manifestIcons(system: System): { src: string; size: number }[] {
  const candidates: { src: string | null; size: number }[] = [
    { src: system.img_manifest_1080, size: 1080 },
    { src: system.img_manifest_512, size: 512 },
    { src: system.img_manifest_256, size: 256 },
    { src: system.img_manifest_192, size: 192 },
    { src: system.img_manifest_128, size: 128 },
  ];
  return candidates.filter((icon): icon is { src: string; size: number } => Boolean(icon.src));
}
