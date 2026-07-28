import type { MetadataRoute } from 'next';
import { getSystem, manifestIcons } from '@/lib/system';
import { localized } from '@/lib/i18n-field';

/**
 * The PWA manifest, built from the site's own settings.
 *
 * The icons come from the manifest fields an author generated from their logo in
 * the CMS; a site that has uploaded none falls back to the static files this app
 * ships, so an installed icon is never missing. The description is resolved for
 * English - a manifest has one name and one description, and there is no locale
 * in its URL to pick another by.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const system = await getSystem();
  const icons = manifestIcons(system);

  return {
    name: system.site_name,
    short_name: system.site_name,
    description: localized(system, 'site_description', 'en') ?? system.site_name,
    start_url: '/',
    display: 'standalone',
    background_color: system.background_light,
    theme_color: system.primary_color,
    orientation: 'portrait-primary',
    icons:
      icons.length > 0
        ? [
            ...icons.map(({ src, size }) => ({
              src,
              sizes: `${size}x${size}`,
              type: 'image/png',
              purpose: 'any' as const,
            })),
            // The same files again as `maskable`: they are generated with the
            // padding an OS mask needs (see the CMS's manifest options), so
            // there is no second set to upload.
            ...icons
              .filter(({ size }) => size === 512 || size === 192)
              .map(({ src, size }) => ({
                src,
                sizes: `${size}x${size}`,
                type: 'image/png',
                purpose: 'maskable' as const,
              })),
          ]
        : [
            { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/icon-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
  };
}
