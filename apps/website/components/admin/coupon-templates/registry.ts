import type { CouponTemplate } from "./types";
import { TicketTemplate } from "./ticket-template";
import { BoldTemplate } from "./bold-template";
import { ElegantTemplate } from "./elegant-template";
import { ScanTemplate } from "./scan-template";

/**
 * The code-defined coupon-flyer template collection, mirroring
 * `../social-templates/registry.ts` exactly - each entry is a self-styled React
 * component rendering one flyer from `CouponFlyerData`. **The DB stores only the
 * `id`, so adding a template is a component plus one entry here, never a
 * migration.**
 *
 * Kept separate from the social registry rather than merged into it: a social
 * template composes an *item* (photo, price, compare price, discount badge) and
 * a coupon template composes an *offer* (a code, a QR, an expiry). Neither set
 * can render the other's data, so one list would be a picker where most entries
 * are wrong for whatever you are making.
 *
 * `name` is an English fallback shown in the picker; the form maps a known id to
 * a localized label and only falls back to this for an unknown/legacy id.
 */
export const COUPON_TEMPLATES: readonly CouponTemplate[] = [
  { id: "ticket", name: "Ticket", Component: TicketTemplate },
  { id: "bold", name: "Bold", Component: BoldTemplate, supportsBackground: true },
  { id: "elegant", name: "Elegant", Component: ElegantTemplate },
  { id: "scan", name: "Scan me", Component: ScanTemplate },
] as const;

/** Matches `Coupon.template_id`'s model default - keep the two in step. */
export const DEFAULT_COUPON_TEMPLATE_ID = "ticket";

export function getCouponTemplate(id: string): CouponTemplate {
  return COUPON_TEMPLATES.find((t) => t.id === id) ?? COUPON_TEMPLATES[0]!;
}
