import { cache } from "react";
import type {
  HeroLayout,
  HeroLogoBackground,
  HeroOverlayStyle,
} from "@repo/ui/hero";
import type { ShapeDividerMask } from "@repo/ui/shape-divider";
import type { MenuItemKind } from "./catalog";
import { getTenantHost } from "./resolve-site";
import { API_URL } from "./config";
import logger from "./logger";
import type { SocialLink } from "./contact";

/**
 * A reference to one hand-picked catalog item in the Spotlight section. Same
 * `{kind, id}` shape the guest cart uses; `food` is the MenuItem family. The
 * frontend resolves these to live cards via the `getAll*` catalog helpers.
 */
export interface SpotlightRef {
  kind: "product" | "service" | "food";
  id: number;
}

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
  /** Site-wide contact email shown on the contact page (business info, not PII). */
  contact_email: string | null;
  /** Ordered social links; the frontend maps each platform to its icon. */
  social_links: SocialLink[];
  highlights_bg: string | null;
  highlights_title: string | null;
  en_highlights_title: string | null;
  highlights_subtitle: string | null;
  en_highlights_subtitle: string | null;
  catalog_items_bg: string | null;
  /**
   * The shape of the transparent notch cut into each background band's top and
   * bottom edge, so the page (and its watermark) shows through and the band
   * dissolves into the sections around it. "none" = a straight edge. Both edges
   * are settable per band, unlike the hero, which only dissolves downward.
   */
  highlights_top_divider: ShapeDividerMask | "none";
  highlights_bottom_divider: ShapeDividerMask | "none";
  catalog_top_divider: ShapeDividerMask | "none";
  catalog_bottom_divider: ShapeDividerMask | "none";
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
  /** How far the gradient overlay reaches, as a whole percent (0-100); 50 = default reach. */
  hero_overlay_extent: number;
  /**
   * Shape of the transparent notch cut into the hero's bottom edge so the page
   * (and its watermark) shows through, softening the seam. "none" = hard edge.
   */
  hero_bottom_divider: ShapeDividerMask | "none";
  /**
   * Depth of the bottom divider edge's drop-shadow, on the 0-24 elevation scale
   * (mirrors `@repo/ui-native`'s `Box`). 0 is a flat edge; 10 is the default.
   */
  hero_bottom_divider_elevation: number;
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
  /** Include the logo in the page watermark. */
  watermark_show_logo: boolean;
  /**
   * Include the brandmark in the page watermark (needs `img_brandmark`). With
   * `watermark_show_logo` also on, the two images are intercalated.
   */
  watermark_show_brandmark: boolean;
  watermark_size: number;
  watermark_spacing: number;
  /** Whole percent (1-25), not a 0-1 fraction. */
  watermark_opacity: number;
  background_light: string;
  background_dark: string;
  /**
   * Which basemap every map on the site is painted from - one of the ids in
   * `@repo/ui`'s `basemaps.ts`, or `"custom"`, in which case the three fields
   * below are the operator's own. Resolved once by `lib/basemap.ts` and
   * published to the whole tree by `BasemapProvider`, so no map reads these
   * columns directly.
   */
  map_style: string;
  /** Only read for `map_style: "custom"` - a `{z}/{x}/{y}` template. */
  map_tile_url: string;
  /**
   * The credit that provider requires, drawn in the map's corner. Blank falls
   * back to OpenStreetMap's. ⚠ Never render a message key here instead: the
   * string changes with the tile URL, and an i18n key cannot follow a setting
   * an operator edits at runtime.
   */
  map_attribution: string;
  /** Where that credit links. Blank draws it as plain text, never someone else's href. */
  map_attribution_url: string;
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
  /** Offline checkout switches, independent of Stripe and of each other. The
   *  cart offers a "pay in store" / "pay on delivery" option on each flag. */
  pay_in_store_enabled: boolean;
  pay_on_delivery_enabled: boolean;
  /** Spotlight section - a promo panel + up to three hand-picked catalog items.
   *  Copy is bilingual; the button link is a single path/URL. All optional. */
  spotlight_enabled: boolean;
  spotlight_label: string | null;
  en_spotlight_label: string | null;
  spotlight_title: string | null;
  en_spotlight_title: string | null;
  spotlight_text: string | null;
  en_spotlight_text: string | null;
  spotlight_button_label: string | null;
  en_spotlight_button_label: string | null;
  spotlight_button_link: string | null;
  spotlight_items: SpotlightRef[];
  product_count: number;
  service_count: number;
  menu_item_count: number;
  /**
   * Enabled menu items per `kind`, every choice present (zero included). Drives
   * which per-kind links the navbar's Menu dropdown renders, which is why it
   * rides along on the System payload the layout already fetches rather than
   * costing one catalog call per kind.
   */
  menu_item_kind_counts: Record<MenuItemKind, number>;
  /** Number of enabled physical locations; drives the Contact link alongside `contact_email`. */
  branch_count: number;
  /**
   * Number of enabled events, **past ones included** - it says whether this site
   * has an events surface at all, not whether anything is coming up, and it
   * drives the navbar's Events link.
   *
   * Counting only the upcoming ones would take the link away the day after the
   * last event and strand `/events` and every shared `/events/<slug>` with no
   * way back into the site. The landing band does its own upcoming/past split.
   */
  event_count: number;
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
