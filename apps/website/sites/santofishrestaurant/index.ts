import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";

const site: SiteModule = {
  config,
  Landing,
  // "/contact" is deliberately absent: it is a platform route that already
  // renders this tenant's branches, map, contact email, social links and form.
  pages: { "/about": About },
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
