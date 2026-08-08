import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "tamaratours",
  name: "Tamara Tours Los Cabos",
  hosts: ["tamaratours.iguzman.com.mx"],
  systemHost: "tamaratours.iguzman.com.mx",
};

export default config;
