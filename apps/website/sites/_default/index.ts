import type { SiteModule } from "../types";
import config from "./site.config";
import { DefaultLanding } from "./landing";

const site: SiteModule = {
  config,
  Landing: DefaultLanding,
};

export default site;
