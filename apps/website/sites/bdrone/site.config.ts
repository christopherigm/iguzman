import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "bdrone",
  name: "Bdrone",
  hosts: ["bdrone.com.mx"],
  systemHost: "bdrone.com.mx",
};

export default config;
