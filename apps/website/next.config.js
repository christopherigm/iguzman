import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? path.join(__dirname, '../../') : undefined,
  webpack(config) {
    // Reached via @repo/ui's speech-button → @huggingface/transformers.
    // onnxruntime-node ships native .node binaries webpack cannot parse; alias it
    // to false so webpack emits an empty module. (The browser never uses that code
    // path.) Needed since serwist requires a webpack build - edge-folio does the same.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
    };
    return config;
  },
  // Two rounds of catalog URL history, both still in the wild on printed menus,
  // flyers, QR codes and search indexes - so they are redirected, not 404'd.
  //
  //  1. The menu used to be sectioned by a `MenuItem.kind` enum, which gave it
  //     five listing pages (`/categories/food`, …) and five detail routes
  //     (`/food/<slug>`, …). Both sets went when the tenant's own categories
  //     became the only sectioning a menu has.
  //  2. Category listings lived in a `/categories/*` tree parallel to the items
  //     themselves (`/categories/products` beside `/products/<slug>`). All three
  //     families share one shape now - `/<family>/<category>/<item>` - so that
  //     prefix is gone and its pages moved one level up.
  //
  // ⚠ Only *listings* and the dead per-kind paths need rules here. A bare
  // `/<family>/<slug>` - an old flat product URL, an old menu-category URL, or
  // an item permalink - is handled by the one-segment route itself, which
  // resolves the slug against that family's categories and then its items (see
  // `lib/catalog-permalink.ts`). A static rule cannot know which of the two a
  // slug is; that route can.
  //
  // Written twice per path because a request may or may not carry a locale
  // prefix by the time it reaches here; the locale is pinned to the real list so
  // `/:locale/...` cannot swallow an unrelated two-segment path.
  async redirects() {
    const LOCALE = ':locale(de|en|es|fr|pt)';
    // The five dead per-kind menu listings -> the one menu listing.
    const listings = ['food', 'drinks', 'desserts', 'sides', 'appetizers'];
    // The five dead per-kind detail routes -> the one-segment permalink, which
    // looks the dish up and redirects on to `/menu/<category>/<slug>`.
    const details = ['food', 'drink', 'dessert', 'side', 'appetizer'];
    // The `/categories/*` tree -> the same page one level up.
    const families = ['products', 'services', 'menu'];

    // Both spellings of one rule: bare, and locale-prefixed.
    const pair = (source, destination) => [
      { source, destination, permanent: true },
      {
        source: `/${LOCALE}${source}`,
        destination: `/:locale${destination}`,
        permanent: true,
      },
    ];

    return [
      ...listings.flatMap((kind) => pair(`/categories/${kind}`, '/menu')),
      // Menu categories were briefly at `/categories/food/<slug>`, between the
      // `kind` enum going and the `/categories` prefix going.
      ...pair('/categories/food/:slug', '/menu/:slug'),
      ...details.flatMap((kind) => pair(`/${kind}/:slug`, `/menu/:slug`)),
      // Each family needs both rules: `/categories/products` and
      // `/categories/products/:slug` are different segment counts, and Next
      // matches on those.
      ...families.flatMap((family) => [
        ...pair(`/categories/${family}`, `/${family}`),
        ...pair(`/categories/${family}/:slug`, `/${family}/:slug`),
      ]),
    ];
  },
  async headers() {
    return [
      {
        source: '/admin/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  allowedDevOrigins: ['127.0.0.1', '192.168.0.*'],
  images: {
    qualities: [75, 80, 85, 90],
    dangerouslyAllowLocalIP: true,
    // Stored media lives in Cloudflare R2 in production, so it is fetched
    // straight from the edge instead of being proxied through this pod. See
    // ./image-loader.ts for what the loader does and what it costs.
    loader: 'custom',
    loaderFile: './image-loader.ts',
    // ⚠ `remotePatterns` is **inert while `loader` is 'custom'**: Next only
    // serves `/_next/image` for the default loader and 404s the route
    // otherwise, so this list gates nothing at runtime. It is kept only so the
    // config still makes sense if the custom loader is ever dropped - do NOT
    // add a tenant's CDN hostname here expecting it to fix anything.
    //
    // The features that need a *same-origin* copy of a remote image - the flyer
    // exports (canvas taint) and the branch map capture - go through this app's
    // own `/api/media` route, which allowlists by request host and so needs no
    // per-customer entry anywhere. (The hero `logo`-shape CSS mask still points
    // at `/_next/image` inside `@repo/ui` and is therefore still broken in
    // production for tenants on a separate media origin.)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'website-api.iguzman.com.mx',
      },
      // The platform R2 bucket's public hostname, and any other media host on
      // the company domain. Covers every tenant that has not brought its own.
      {
        protocol: 'https',
        hostname: '**.iguzman.com.mx',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withSerwist(withNextIntl(nextConfig));
