import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";

// This site has no bespoke extra pages: `/contact` is a platform route
// (app/[locale]/contact/page.tsx) and always wins over a site's `pages` map. It
// already renders both branches with their maps, the contact email, the social
// links and the shared contact form, all resolved by request host - which is
// exactly what the old Weebly site's "Sucursales" and "Contacto" tabs were for.
const site: SiteModule = {
  config,
  Landing,
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
