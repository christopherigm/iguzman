import type { SocialTemplate } from "./types";
import { ClassicTemplate } from "./classic-template";
import { BoldTemplate } from "./bold-template";
import { MinimalTemplate } from "./minimal-template";
import { EditorialTemplate } from "./editorial-template";
import { SaleTemplate } from "./sale-template";

/**
 * The code-defined social-flyer template collection. Each entry is a self-styled
 * React component that renders one flyer from `FlyerData`. Grow the variety by
 * adding a component + one entry here - the DB stores only the `id`, so no
 * migration is needed for a new template.
 *
 * `name` is an English fallback shown in the picker; the form maps a known id to
 * a localized label and only uses this for unknown/legacy ids.
 */
export const SOCIAL_TEMPLATES: readonly SocialTemplate[] = [
  { id: "classic", name: "Classic", Component: ClassicTemplate },
  { id: "bold", name: "Bold", Component: BoldTemplate },
  { id: "minimal", name: "Minimal", Component: MinimalTemplate },
  { id: "editorial", name: "Editorial", Component: EditorialTemplate },
  { id: "sale", name: "Sale", Component: SaleTemplate },
] as const;

export const DEFAULT_TEMPLATE_ID = "classic";

export function getTemplate(id: string): SocialTemplate {
  return (
    SOCIAL_TEMPLATES.find((t) => t.id === id) ??
    SOCIAL_TEMPLATES[0]!
  );
}
