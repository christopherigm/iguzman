import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";

const site: SiteModule = {
  config,
  Landing,
  // No extra pages: the story lives in the landing's Intro, and everything else
  // this kitchen needs is already a platform route - "/menu" for the
  // whole carta, "/menu/<category>/<dish>" for a dish, and "/contact" for the
  // branches, their maps, the hours and the form. A site "/contact" in
  // particular would be dead code; the platform route always wins.
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
