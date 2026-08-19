import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "lacocinaderosalinda",
  name: "La Cocina de Rosalinda",
  hosts: ["lacocinaderosalinda.iguzman.com.mx"],
  systemHost: "lacocinaderosalinda.iguzman.com.mx",
};

export default config;
