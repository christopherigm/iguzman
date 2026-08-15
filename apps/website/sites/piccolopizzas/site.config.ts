import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
//
// The customer's real domain (piccolopizzas.com) still points at their old
// Weebly template, so this ships on the demo subdomain first. When they cut DNS
// over, add "piccolopizzas.com" + "www.piccolopizzas.com" to `hosts` and move
// `systemHost` to the real domain (creating the matching System.host and
// re-running `pnpm sync-website-hosts`).
const config: SiteConfig = {
  slug: "piccolopizzas",
  name: "Piccolo Pizzas",
  hosts: ["piccolopizzas.iguzman.com.mx"],
  systemHost: "piccolopizzas.iguzman.com.mx",
};

export default config;
