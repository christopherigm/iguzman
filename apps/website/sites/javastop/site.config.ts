import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
//
// The café's own domain is javastop.cafe; the site is built and published on
// the preview subdomain first. When the customer hands the real domain over,
// add "javastop.cafe" + "www.javastop.cafe" to `hosts`, point `systemHost` at
// it, create the matching System.host and re-run `pnpm sync-website-hosts`.
const config: SiteConfig = {
  slug: "javastop",
  name: "JavaStop Cafe",
  hosts: ["javastop.iguzman.com.mx"],
  systemHost: "javastop.iguzman.com.mx",
};

export default config;
