import type { ComponentType } from "react";
import type { SocialFormat } from "@/lib/admin-api";

export type { SocialFormat };

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
  /** Item photo as a data URL (the flyer subject). */
  itemImage?: string;
  itemName?: string;
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
  primaryColor: string;
  secondaryColor: string;
  includeItemData: boolean;
  includeBrand: boolean;
}

export interface SocialTemplate {
  /** Registry key persisted on the SocialPost row. */
  id: string;
  /** Human label shown in the template picker (English fallback). */
  name: string;
  /** Renders the flyer at `FORMAT_DIMENSIONS[data.format]`. */
  Component: ComponentType<{ data: FlyerData }>;
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
 * Pick black or white for legible text over a solid background color, via
 * relative luminance. Used so a headline stays readable whatever brand color the
 * tenant chose.
 */
export function contrastText(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m || !m[1]) return "#ffffff";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
