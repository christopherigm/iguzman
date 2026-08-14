import type { ComponentType } from "react";
import type { HeroLogoBackground } from "@repo/ui/hero";
import {
  FORMAT_DIMENSIONS,
  contrastText,
  tint,
  type SocialFormat,
} from "../social-templates/types";

/**
 * A coupon flyer is drawn on the same canvases a social post is, so the format
 * token, the pixel dimensions and the three colour helpers are **imported from
 * the social templates rather than re-declared** - per the repo's shared-constant
 * rule. Two copies of `contrastText` would eventually disagree, and the first
 * symptom would be a headline that is readable on a flyer and not on a post
 * built from the same brand colour.
 */
export { FORMAT_DIMENSIONS, contrastText, tint };
export type CouponFormat = SocialFormat;

/**
 * Everything a coupon template needs to compose one flyer.
 *
 * Images arrive as **data URLs** already, resolved same-origin upstream, so a
 * template never triggers a network fetch during capture - which is what keeps
 * the `html-to-image` export canvas untainted. That applies to the QR code as
 * much as the logo: the PNG is served from R2 on a CDN hostname, so a template
 * that pointed an `<img>` straight at `coupon.qr_code` would taint the canvas
 * and fail every download.
 */
export interface CouponFlyerData {
  format: CouponFormat;

  /** The code the customer types, printed exactly as the tenant wrote it. */
  code: string;
  /**
   * The offer as one short line - "20% OFF", "$150 OFF". Composed upstream so
   * every template prints the same words, and so the percent/fixed distinction
   * is resolved in one place rather than four.
   */
  valueLabel: string;
  /** The tenant's own sentence about the offer. May be empty. */
  description?: string;
  /** Already formatted in the viewer's locale, or undefined when open-ended. */
  expiryLabel?: string;
  /** "Minimum $500" - already formatted, or undefined when there is no floor. */
  minOrderLabel?: string;

  /** The coupon's QR code as a data URL. Undefined when the PNG write failed. */
  qrImage?: string;
  /**
   * Stand-in copy for the QR that does not exist yet, drawn in the space the
   * real one will occupy. Only ever set while composing an **unsaved** coupon:
   * the API mints the code's PNG on create, so before the first save every
   * template would otherwise render the one element the flyer exists to deliver
   * as a silent hole - and nothing on screen would say the hole is temporary.
   */
  qrPlaceholder?: string;
  /** The URL that QR encodes, printed as readable text beneath it. */
  landingUrl?: string;

  /** Brand logo as a data URL. */
  brandLogo?: string;
  brandName?: string;
  brandSlogan?: string;
  primaryColor: string;
  secondaryColor: string;

  /**
   * The plate behind the brand logo, and the two whole-percent scales that size
   * it - the shape vocabulary the hero and the social flyer already use, so a
   * tenant tunes the coupon with controls they know. `"none"` (the default)
   * draws the logo bare, exactly as every coupon did before these existed.
   */
  brandLogoBackground: HeroLogoBackground;
  /** Size of the plate (shape and logo together), 30-100. */
  brandLogoBackgroundScale: number;
  /** Size of the logo inside the plate - or of the bare logo - 30-100. */
  brandLogoScale: number;

  /** Full-bleed backdrop as a data URL, for templates that paint one. */
  backgroundImage?: string;
  /** Draw the logo, name and slogan at all. */
  includeBrand: boolean;
}

export interface CouponTemplate {
  /** Registry key persisted on the Coupon row (`template_id`). */
  id: string;
  /** Human label shown in the picker (English fallback). */
  name: string;
  /** Renders the flyer at `FORMAT_DIMENSIONS[data.format]`. */
  Component: ComponentType<{ data: CouponFlyerData }>;
  /**
   * Paints `backgroundImage` as a full-bleed backdrop. The form uses this to
   * hint which templates the uploaded background actually reaches.
   */
  supportsBackground?: boolean;
}
