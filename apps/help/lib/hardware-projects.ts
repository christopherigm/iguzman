import data from "./hardware-projects.json";

/**
 * The hardware project registry.
 *
 * **There is deliberately no database behind this.** A hardware project is a
 * physical thing that ships once and then changes about as often as the board
 * it is soldered to; its documentation lives in the repo beside the firmware,
 * and the list of projects is small enough to read in one screen. So the
 * registry is `hardware-projects.json` - edited in the same commit as the
 * project it describes, versioned with it, and requiring no migration, no admin
 * UI and no API round-trip to render.
 *
 * The JSON carries only what the **listing** needs plus the detail page's spec
 * chips. The body of each project's documentation is a React component under
 * `app/[locale]/hardware/[project]/`, registered in that route's
 * `PROJECT_DOCS` map - prose, schematics and wiring tables are authored, not
 * data, and trying to express an SVG figure in JSON would be a worse version of
 * a `.tsx` file.
 */
export interface HardwareSpec {
  /** Short column heading in the title block, e.g. "Runtime". */
  label: string;
  /** The value as it should read, units included, e.g. "≈ 20 h". */
  value: string;
}

export interface HardwareProject {
  /** URL segment: /hardware/<slug>. Also the key into `PROJECT_DOCS`. */
  slug: string;
  /** Emoji shown on the listing card - the same convention as ADMIN_NAV_ITEMS. */
  icon: string;
  /** `HomePage` message key for the project's display name (translated). */
  nameKey: string;
  /** `HomePage` message key for the one-line listing blurb (translated). */
  descKey: string;
  /** Board/MCU the firmware targets, e.g. "Raspberry Pi Pico". */
  board: string;
  /** Firmware language/runtime, e.g. "MicroPython". */
  language: string;
  /** Document revision line shown above the detail page title. */
  revision: string;
  /** Where the firmware still lives in the repo, e.g. "hardware/pumpkin-house". */
  sourcePath: string;
  /** Title-block chips on the detail page. */
  specs: HardwareSpec[];
}

export const HARDWARE_PROJECTS: HardwareProject[] = data.projects;

/** The project for a URL slug, or `undefined` so the route can `notFound()`. */
export function getHardwareProject(slug: string): HardwareProject | undefined {
  return HARDWARE_PROJECTS.find((project) => project.slug === slug);
}
