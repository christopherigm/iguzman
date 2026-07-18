import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "panorganico",
  name: "Pan que hace bien",
  hosts: ["panbueno.iguzman.com.mx"],
  systemHost: "panbueno.iguzman.com.mx",
};

export default config;
