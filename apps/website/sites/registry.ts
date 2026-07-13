import type { SiteConfig, SiteModule } from "./types";

// ── Site registration ────────────────────────────────────────────────────────
//
// Add one entry per customer site. The `config` is imported eagerly (it is a
// tiny, component-free descriptor) so the host index can be built without
// pulling any page code; `load` is a dynamic import so a request only ever
// downloads the ONE site module it resolves to. This is what keeps a single
// deploy cheap as the number of tenants grows.
//
// `pnpm new-site <domain>` scaffolds a sites/<slug>/ folder and inserts its
// entry here automatically. The `_default` entry MUST stay last - it is the
// fallback for any host no other site claims.

import defaultConfig from "./_default/site.config";
import bdroneConfig from "./bdrone/site.config";
// <new-site:import> - the CLI inserts new `import <slug>Config from ...` lines above this marker.

/**
 * Cookie that forces a specific site in local development, bypassing host
 * resolution. Set by the dev-only site switcher and honored ONLY when
 * `NODE_ENV === "development"` (see `lib/resolve-site.ts`) - it is ignored in
 * production, so it can never leak into a real deploy.
 */
export const DEV_SITE_COOKIE = "__dev_site";

interface SiteEntry {
  config: SiteConfig;
  load: () => Promise<{ default: SiteModule }>;
}

const SITES: SiteEntry[] = [
  { config: bdroneConfig, load: () => import("./bdrone") },
  // <new-site:entry> - the CLI inserts new `{ config, load }` entries above this marker.
  { config: defaultConfig, load: () => import("./_default") },
];

// The last entry is always the fallback (`_default`).
const DEFAULT_ENTRY: SiteEntry = SITES[SITES.length - 1]!;

const SLUG_INDEX: Map<string, SiteEntry> = new Map(
  SITES.map((entry) => [entry.config.slug, entry]),
);

/**
 * Every registered site's light config, in registration order. Component-free,
 * so this is safe to import from a client component (e.g. the dev site
 * switcher). Excludes the `_default` fallback - it has no host to select.
 */
export const SITE_CONFIGS: SiteConfig[] = SITES.slice(0, -1).map(
  (entry) => entry.config,
);

/**
 * Resolve a site module by its `slug`, loading only that site's code. Returns
 * `null` for an unknown slug. Used by the dev-only site override in
 * `lib/resolve-site.ts`; regular requests resolve by host instead.
 */
export async function resolveSiteBySlug(
  slug: string,
): Promise<SiteModule | null> {
  const entry = SLUG_INDEX.get(slug);
  if (!entry) return null;
  const mod = await entry.load();
  return mod.default;
}

// ── Host index ───────────────────────────────────────────────────────────────

const HOST_INDEX: Map<string, SiteEntry> = (() => {
  const index = new Map<string, SiteEntry>();
  for (const entry of SITES) {
    for (const host of entry.config.hosts) {
      index.set(host.toLowerCase(), entry);
    }
  }
  return index;
})();

/**
 * Resolve the site module for a request host, loading only that site's code.
 * Falls back to the `_default` template when no site claims the host.
 */
export async function resolveSiteByHost(host: string): Promise<SiteModule> {
  const entry = HOST_INDEX.get(host.toLowerCase()) ?? DEFAULT_ENTRY;
  const mod = await entry.load();
  return mod.default;
}
