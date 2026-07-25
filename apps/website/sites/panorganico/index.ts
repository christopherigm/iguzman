import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";

// No "/contact" here: `/contact` is a platform route
// (app/[locale]/contact/page.tsx) and always wins over a site's `pages` map. It
// already renders this tenant's branches, contact email, social links and the
// shared contact form, all resolved by request host.
const site: SiteModule = {
  config,
  Landing,
  pages: {
    "/about": About,
  },
};

export default site;
