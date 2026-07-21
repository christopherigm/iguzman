import { cache } from "react";
import type {
  HeroLayout,
  HeroLogoBackground,
  HeroOverlayStyle,
} from "@repo/ui/hero";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";

export interface System {
  id: number;
  enabled: boolean;
  created: string;
  modified: string;
  version: number;
  site_name: string;
  site_description: string | null;
  en_site_description: string | null;
  host: string;
  img_logo: string | null;
  img_logo_hero: string | null;
  img_favicon: string | null;
  img_manifest_1080: string | null;
  img_manifest_512: string | null;
  img_manifest_256: string | null;
  img_manifest_192: string | null;
  img_manifest_128: string | null;
  /** A small company symbol / brandmark, tiled as an alternate watermark and shown in cards. */
  img_brandmark: string | null;
  img_hero: string | null;
  video_link: string | null;
  slogan: string | null;
  primary_color: string;
  secondary_color: string;
  highlights_bg: string | null;
  highlights_title: string | null;
  en_highlights_title: string | null;
  highlights_subtitle: string | null;
  en_highlights_subtitle: string | null;
  catalog_items_bg: string | null;
  /** How the logo and text are composed over the hero video. */
  hero_video_layout: HeroLayout;
  /** Shape drawn behind the hero logo, in either layout ("none" = no badge). */
  hero_logo_background: HeroLogoBackground;
  /** Logo size inside the background shape, as a whole percent (50-100). */
  hero_logo_scale: number;
  /** Badge size as a whole percent of its default diameter (50-100). */
  hero_logo_background_scale: number;
  /** Shape of the dark overlay drawn over the hero background. */
  hero_overlay_style: HeroOverlayStyle;
  /** Overlay strength as a whole percent (0-100), not a 0-1 fraction. */
  hero_overlay_opacity: number;
  /**
   * Wrap the section/page heading over a hero (category, highlight and item
   * detail pages - not the landing hero) in an outline frame, with the
   * brandmark in a circle on top when `img_brandmark` is set.
   */
  hero_text_frame: boolean;
  watermark_enabled: boolean;
  watermark_rotation: number;
  /** Alternate each logo's rotation so neighbours lean opposite ways. */
  watermark_intercalated: boolean;
  /** Tile the brandmark instead of the logo in the page watermark (needs `img_brandmark`). */
  watermark_use_brandmark: boolean;
  watermark_size: number;
  watermark_spacing: number;
  /** Whole percent (1-25), not a 0-1 fraction. */
  watermark_opacity: number;
  background_light: string;
  background_dark: string;
  /**
   * Google Fonts stylesheet URL carrying this tenant's typefaces (one URL can
   * load both families). Empty keeps the platform default. The API restricts it
   * to a Google Fonts host, and the layout re-checks before rendering the
   * `<link>` - see `isGoogleFontUrl` in `lib/fonts.ts`.
   */
  google_font_url: string;
  /** CSS family name used for headings, e.g. "Fraunces". Empty = default. */
  font_display: string;
  /** CSS family name used for body text, e.g. "Karla". Empty = default. */
  font_body: string;
  about: string;
  en_about: string;
  mission: string;
  en_mission: string;
  vision: string;
  en_vision: string;
  img_about: string | null;
  privacy_policy: string;
  en_privacy_policy: string;
  terms_and_conditions: string;
  en_terms_and_conditions: string;
  user_data: string;
  en_user_data: string;
  /** Whether this tenant has switched payments on. */
  stripe_enabled: boolean;
  /**
   * Whether checkout can actually run: `stripe_enabled` *and* both Stripe
   * secrets present. The keys themselves have no read path - this flag is the
   * only thing the API will say about them. The cart reads it to decide whether
   * to offer a checkout button at all.
   */
  stripe_configured: boolean;
  product_count: number;
  service_count: number;
  menu_item_count: number;
}

/**
 * Fetches the System record matching the current request host.
 * React.cache() deduplicates repeated calls within the same request
 * (layout + generateMetadata + page all share one fetch).
 */
export const getSystem = cache(async (): Promise<System | null> => {
  const host = await getTenantHost();

  try {
    const res = await fetch(`${API_URL}/api/system/`, {
      headers: {
        // Forward the original request host so Django can match the correct
        // System record (the Django view reads HTTP_X_WEBSITE_HOST first).
        "X-Website-Host": host,
      },
    });

    if (!res.ok) {
      logger.warn(
        { host, status: res.status },
        "System API returned non-OK status",
      );
      return null;
    }

    return res.json() as Promise<System>;
  } catch (err) {
    logger.error({ host, err }, "Failed to fetch system configuration");
    return null;
  }
});
