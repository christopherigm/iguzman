import type { SiteConfig } from "../types";

/**
 * The fallback site. Rendered for any host that no other site claims - so a
 * freshly-provisioned System (whose domain has been synced to the ingress but
 * whose bespoke site folder has not been built yet) still gets the generic,
 * fully DB-driven template. `hosts` is intentionally empty: this site is
 * selected as the registry's default, never by host match.
 */
const config: SiteConfig = {
  slug: "default",
  name: "Default Template",
  hosts: [],
};

export default config;
