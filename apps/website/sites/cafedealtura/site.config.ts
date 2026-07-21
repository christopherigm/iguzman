import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "cafedealtura",
  name: "Café de Altura",
  hosts: ["cafedealtura.iguzman.com.mx", "www.cafedealtura.iguzman.com.mx"],
  systemHost: "cafedealtura.iguzman.com.mx",
};

export default config;
