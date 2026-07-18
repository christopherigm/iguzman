import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";
import { About } from "./pages/about";
import { Contact } from "./pages/contact";

const site: SiteModule = {
  config,
  Landing,
  pages: {
    "/about": About,
    "/contact": Contact,
  },
};

export default site;
