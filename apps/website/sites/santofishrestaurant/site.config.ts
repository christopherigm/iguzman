import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// `systemHost` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "santofishrestaurant",
  name: "Santo Fish Restaurant",
  hosts: ["santofishrestaurant.iguzman.com.mx"],
  systemHost: "santofishrestaurant.iguzman.com.mx",
};

export default config;
