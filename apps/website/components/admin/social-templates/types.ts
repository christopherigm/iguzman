import type { ComponentType } from "react";
import type { HeroLogoBackground } from "@repo/ui/hero";
import type { SocialFormat } from "@/lib/admin-api";

export type { SocialFormat };

/**
 * The shapes a template may frame the centred item photo with. Deliberately the
 * hero's own vocabulary: the CMS offers one set of shapes everywhere, and both
 * consumers clip with the same exported `heroLogoBackgroundStyle`, so a shape
 * cannot come out different on a flyer than it does on the hero.
 */
export type BadgeShape = HeroLogoBackground;

/**
 * The pixel canvas each format renders at. The flyer node is laid out at these
 * exact dimensions (regardless of the scaled-down on-screen preview), so the
 * exported JPG is a true 1080-wide social asset.
 */
export const FORMAT_DIMENSIONS: Record<SocialFormat, { w: number; h: number }> =
  {
    "1x1": { w: 1080, h: 1080 },
    "4x5": { w: 1080, h: 1350 },
  };

/**
 * Everything a template needs to compose one flyer. Images arrive as **data
 * URLs** already (resolved same-origin upstream), so a template never triggers a
 * network fetch during capture - which is what keeps the export canvas untainted.
 */
export interface FlyerData {
  format: SocialFormat;
  /**
   * Item photo as a data URL (the flyer subject). Already resolved upstream: the
   * post's own uploaded override when it has one, else the catalog item's photo.
   */
  itemImage?: string;
  itemName?: string;
  /**
   * Full-bleed backdrop as a data URL, painted by templates that declare
   * `supportsBackground`. Undefined when none is uploaded - a template must
   * still render (on its own brand-coloured ground) without one.
   */
  backgroundImage?: string;
  /** LLM-drafted text overlaid on the flyer (headline/caption on the image). */
  imageText?: string;
  price?: string | null;
  comparePrice?: string | null;
  currency?: string | null;
  /** Whole-percent discount (compare_price → price), or null when none. */
  discountPercent?: number | null;
  /** Brand logo as a data URL. */
  brandLogo?: string;
  brandName?: string;
  brandSlogan?: string;
  /**
   * Shape of the plate behind the brand logo, in **every** template (unlike
   * `badgeShape`, which frames the item photo in the templates that centre one).
   * `"none"` - the default - draws the logo bare, exactly as before.
   */
  brandLogoBackground: BadgeShape;
  /** Whole-percent size of the logo *with* its background (50-100). */
  brandLogoBackgroundScale: number;
  /** Whole-percent size of the logo *inside* its background (50-100). */
  brandLogoScale: number;
  primaryColor: string;
  secondaryColor: string;
  includeItemData: boolean;
  includeBrand: boolean;
  /** Shape framing the centred photo, in templates that badge it. */
  badgeShape: BadgeShape;
  /** Whole-percent size of the badge itself (50-100). */
  badgeScale: number;
  /** Whole-percent size of the photo inside the badge (50-100). */
  badgeImageScale: number;
}

export interface SocialTemplate {
  /** Registry key persisted on the SocialPost row. */
  id: string;
  /** Human label shown in the template picker (English fallback). */
  name: string;
  /** Renders the flyer at `FORMAT_DIMENSIONS[data.format]`. */
  Component: ComponentType<{ data: FlyerData }>;
  /**
   * Paints `backgroundImage` as a full-bleed backdrop. The form uses this to
   * hint which templates the uploaded background actually reaches.
   */
  supportsBackground?: boolean;
  /**
   * Frames the centred photo in a shaped badge, so `badgeShape` and the two
   * scales apply. The form hides those controls for templates without one
   * rather than leaving sliders that do nothing - the stored values are kept,
   * so switching back restores what the admin had picked.
   */
  supportsBadge?: boolean;
}

/** Format a decimal price string for display, e.g. "199.00" + "MXN". */
export function formatMoney(
  value: string | null | undefined,
  currency: string | null | undefined,
): string {
  if (value == null || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return `${value}`;
  // Trim a trailing ".00" so a whole price reads "$199", not "$199.00".
  const body = Number.isInteger(num)
    ? num.toLocaleString("en-US")
    : num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return currency ? `${body} ${currency}` : body;
}

/**
 * A translucent tint of a hex color, for overlays. Falls back to a plain rgba of
 * black when the input isn't a 6-digit hex (so templates never render nothing).
 */
export function tint(hex: string | undefined, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m || !m[1]) return `rgba(0,0,0,${alpha})`;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Pick black or white for legible text over a solid background color.
 *
 * It lives in `@/lib/colors` now - the locale layout needs the same answer to
 * publish `--secondary-foreground`, and a page-wide layout has no business
 * importing from the admin CMS's flyer templates. Re-exported here so every
 * template keeps reading it off the module it already imports.
 */
export { contrastText } from "@/lib/colors";
