import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";
import { Artists } from "./pages/artists";

const site: SiteModule = {
  config,
  Landing,
  // "/artists" is the standing page for the café's monthly local-artist wall -
  // not a platform route, so it is safe to claim here. There is deliberately no
  // "/contact": that is a platform page (branches, map, social links, form) and
  // a site entry for it would be silently unreachable dead code.
  pages: {
    "/about": About,
    "/artists": Artists,
  },
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
