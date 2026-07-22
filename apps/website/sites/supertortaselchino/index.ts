import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { Contact } from "./pages/contact";

const site: SiteModule = {
  config,
  Landing,
  pages: {
    "/contact": Contact,
  },
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
