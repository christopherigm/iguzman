import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "supertortaselchino",
  name: "Super Tortas El Chino",
  hosts: ["supertortaselchino.iguzman.com.mx"],
  systemHost: "supertortaselchino.iguzman.com.mx",
};

export default config;
