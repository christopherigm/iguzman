import type { ComponentType } from "react";

/**
 * Props every per-site page component receives. Kept intentionally small - a
 * page pulls the rest of what it needs from the shared `lib/` data helpers
 * (getSystem, getSuccessStories, getHighlights, catalog…), which resolve the
 * active tenant by request host on their own.
 */
export interface SitePageProps {
  locale: string;
}

/**
 * Lightweight, eagerly-importable descriptor for a customer site.
 *
 * MUST NOT import React components or any heavy module - the registry imports
 * every site's config up front to build the host -> site index, while the page
 * components (index.ts) are loaded lazily per request for code-splitting.
 */
export interface SiteConfig {
  /** Stable identifier for this site, matches the sites/<slug>/ folder name. */
  slug: string;
  /** Human-readable customer/site name (for logs and tooling). */
  name: string;
  /**
   * Every hostname that should render this site (primary domain + any preview
   * or staging hosts). Matched case-insensitively against the request host.
   * The `_default` fallback site leaves this empty.
   */
  hosts: string[];
  /**
   * The `System.host` value the backend uses to resolve this tenant's data
   * (products, services, branding…). Usually the primary production domain.
   * Leave empty on the `_default` site to use the raw request host as-is.
   */
  systemHost?: string;
}

/**
 * The full runtime module for a customer site. `index.ts` in each
 * sites/<slug>/ folder default-exports one of these.
 */
export interface SiteModule {
  config: SiteConfig;
  /** The landing page ("/") for this site. */
  Landing: ComponentType<SitePageProps>;
  /**
   * Optional extra top-level pages keyed by their path, e.g.
   * { "/about": AboutPage, "/contact": ContactPage }. Served by the
   * [locale]/[...sitePath] catch-all. Paths that clash with a platform route
   * (auth, admin, account, products, services, categories…) never reach
   * here - those explicit routes always win.
   */
  pages?: Record<string, ComponentType<SitePageProps>>;
}
