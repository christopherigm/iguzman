import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";
import { Arch } from "./pages/arch";

// No "/contact" here: `/contact` is a platform route
// (app/[locale]/contact/page.tsx) and always wins over a site's `pages` map. It
// already renders this tenant's branches (with a map), contact email, social
// links and the shared contact form, all resolved by request host - which is
// exactly what `sections/departure.tsx` links out to.
//
// NOTE: Landing + pages/ are Server Components — never import from
// @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
// fixed navbar / add bottom spacing, use props-first padding with the shared
// CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
// paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
const site: SiteModule = {
  config,
  Landing,
  pages: {
    "/about": About,
    "/el-arco": Arch,
  },
};

export default site;
