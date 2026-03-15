import type { MetadataRoute } from 'next';
import { getSystem } from '@/lib/system';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const system = await getSystem();

  const icons: MetadataRoute.Manifest['icons'] = [];

  if (system?.img_manifest_128) {
    icons.push({
      src: system.img_manifest_128,
      sizes: '128x128',
      type: 'image/png',
      purpose: 'any',
    });
  }
  if (system?.img_manifest_256) {
    icons.push({
      src: system.img_manifest_256,
      sizes: '256x256',
      type: 'image/png',
      purpose: 'any',
    });
  }
  if (system?.img_manifest_512) {
    icons.push({
      src: system.img_manifest_512,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    });
  }
  if (system?.img_manifest_1080) {
    icons.push({
      src: system.img_manifest_1080,
      sizes: '1080x1080',
      type: 'image/png',
      purpose: 'any',
    });
  }

  // Fall back to static icons when no system manifest images are configured.
  if (icons.length === 0) {
    icons.push(
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
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
    );
  }

  return {
    name: system?.site_name ?? 'Website',
    short_name: system?.site_name ?? 'Website',
    description: 'Website application',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: system?.primary_color ?? '#68c3f7',
    orientation: 'portrait-primary',
    icons,
  };
}
