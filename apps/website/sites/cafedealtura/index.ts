import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";
import { WholesalePage } from "./pages/wholesale";

const site: SiteModule = {
  config,
  Landing,
  // "/mayoreo" is the wholesale (B2B) door for the buyers who resell this
  // farm's coffee - not a platform route, so it is safe to claim here.
  pages: {
    "/about": About,
    "/mayoreo": WholesalePage,
  },
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
