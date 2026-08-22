import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import {
  ThemeProvider,
  ThemeScript,
  RESOLVED_COOKIE_NAME,
} from "@repo/ui/theme-provider";
import type { ThemeMode, ResolvedTheme } from "@repo/ui/theme-provider";
import { PaletteProvider } from "@repo/ui/palette-provider";
import { palettes } from "@repo/ui/palettes";
import { routing } from "@repo/i18n/routing";
import { SerwistProvider } from "@serwist/next/react";
import { getSession } from "@repo/auth/session";
import { SessionProvider } from "@repo/auth/session-provider";
import { NavbarClient } from "./navbar-client";
import { DevSiteSwitcher } from "./dev-site-switcher";
import { Footer } from "@/components/footer";
import { HideOnAdmin, HideOnFullScreenTool } from "@/components/hide-on-admin";
import { GuestMerge } from "@/components/guest-merge";
import { LogoWatermark } from "@/components/logo-watermark";
import packageJson from "@/package.json";
import { getCartCount } from "@/lib/cart";
import { kindLabels } from "@/lib/kind-labels";
import { getSystem } from "@/lib/system";
import { getMenuCategories, type MenuCategory } from "@/lib/catalog";
import { basemapFor } from "@/lib/basemap";
import { contrastText, accentInkVariables } from "@/lib/colors";
import { BasemapProvider } from "@/components/basemap-provider";
import { isGoogleFontUrl, cssFontFamily } from "@/lib/fonts";
import { DEV_SITE_COOKIE, SITE_CONFIGS } from "@/sites/registry";
import "../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// The browser UI color (Android Chrome's toolbar, iOS Safari's tab bar) comes
// from the resolved tenant's brand, not a platform default. `themeColor` only
// varies by media query, so the two brand colors map onto the two color
// schemes: primary in light, secondary in dark (falling back to primary when a
// tenant hasn't set one).
export async function generateViewport(): Promise<Viewport> {
  const system = await getSystem();

  const primary = system?.primary_color ?? "#68c3f7";
  const secondary = system?.secondary_color ?? primary;

  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: primary },
      { media: "(prefers-color-scheme: dark)", color: secondary },
    ],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: "Metadata" })) as (
    key: string,
  ) => string;

  const system = await getSystem();

  return {
    title: system?.site_name ?? t("title"),
    description: system?.site_description ?? t("description"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: system?.img_favicon ?? "/favicon.ico",
      apple: system?.img_manifest_128 ?? "/icons/icon-192x192.png",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: system?.site_name ?? t("title"),
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // The session is decoded from the access-token cookie during this request, so
  // the HTML we send already reflects who the user is - the admin link and the
  // account menu no longer pop in after hydration.
  const [messages, system, session, cartCount, menuCategories] =
    await Promise.all([
      getMessages(),
      getSystem(),
      getSession(),
      getCartCount(),
      // The navbar's Menu dropdown is one entry per category, so the list has
      // to be here rather than on the System payload - unlike the flat
      // per-family counts beside it, this is content. `getMenuCategories` is
      // `cache()`d per request and Django caches the response, so the bar costs
      // one already-warm read.
      getMenuCategories(),
    ]);

  // Only categories that actually have something in them: an empty one in the
  // dropdown is a link to a page that says nothing is there.
  const stockedMenuCategories = (menuCategories as MenuCategory[])
    .filter((category) => category.item_count > 0)
    .map((category) => ({
      slug: category.slug,
      // Resolved here, like `kindLabels` below, because the navbar is a client
      // component and this is per-locale tenant copy.
      name:
        (locale === "en" ? category.en_name : category.name) ??
        category.name ??
        category.en_name ??
        category.slug,
    }));

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get("theme-mode")?.value as
    ThemeMode | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as
    ResolvedTheme | undefined;
  // Customer sites default to a light theme for first-time visitors (no saved
  // theme-mode cookie yet) rather than following the OS setting. The ThemeSwitch
  // still lets a visitor pick dark, and that choice persists via the cookie.
  const initialMode: ThemeMode = themeModeCookie ?? "light";
  const initialResolved: ResolvedTheme =
    initialMode === "system"
      ? (themeResolvedCookie ?? "light")
      : (initialMode as ResolvedTheme);

  const isDev = process.env.NODE_ENV === "development";
  const devSite = isDev ? (cookieStore.get(DEV_SITE_COOKIE)?.value ?? "") : "";

  // Drive the accent from the resolved tenant's brand color so every core
  // component keyed on `--accent` (e.g. `Button kind="primary"`) renders in the
  // customer's brand without any per-site restyling. Falls back to the platform
  // cyan when the System has no primary_color set.
  const accent = system?.primary_color ?? "#68c3f7";

  const paletteVars = palettes["cyan"]?.[initialResolved] ?? {};
  const bodyStyle = Object.fromEntries(
    Object.entries(paletteVars),
  ) as React.CSSProperties;
  (bodyStyle as Record<string, string>)["--accent"] = accent;
  // The same brand colour again, but as **ink**: `--accent` is one tenant hex
  // published for both themes, and text painted in it is legible in only one of
  // them - La Cocina de Rosalinda's navy reads beautifully on a light card and
  // disappears into a dark one, and a brand yellow does the reverse. So the
  // layout resolves a per-theme variant that clears WCAG AA against every
  // surface a page can paint text on (the palette's three, plus the tenant's own
  // page background), and `globals.css` picks one per `data-theme` - exactly the
  // shape `--page-background-light` / `-dark` already uses, so a visitor
  // toggling the theme repaints without a reload.
  //
  // ⚠ It is only for text and icons. Every *fill* keeps the raw `--accent`: a
  // primary button, a filled badge, a border and the menu rail are the brand
  // colour itself, and their own foreground answers for the contrast there.
  // Nudging those would repaint the tenant's brand rather than make it readable.
  //
  // Published only when the hex parses, so a malformed `primary_color` leaves
  // the variables unset and every consumer's `var(--accent)` fallback stands.
  const pageBackgroundLight = system?.background_light ?? "#e5e5e5";
  const pageBackgroundDark = system?.background_dark ?? "#3c3c3c";
  Object.assign(
    bodyStyle,
    accentInkVariables(accent, palettes["cyan"], {
      light: [pageBackgroundLight],
      dark: [pageBackgroundDark],
    }),
  );
  // The tenant's *second* brand colour, published beside the accent so a
  // component can reach for it (`var(--secondary)`) without a prop threaded
  // down from whichever page holds the System - currently the menu's category
  // indexes, which light the section the reader is in with it. Its foreground
  // travels with it, because only the server knows the hex well enough to pick
  // black or white against it; CSS has no contrast function.
  //
  // ⚠ Deliberately left *unset* when the tenant has no secondary colour, rather
  // than falling back to the accent: on a surface already painted in the accent
  // an accent highlight is no highlight at all, so the consumer's own fallback
  // has to be the one that answers.
  const secondaryBrand = system?.secondary_color ?? "";
  if (secondaryBrand) {
    (bodyStyle as Record<string, string>)["--secondary"] = secondaryBrand;
    (bodyStyle as Record<string, string>)["--secondary-foreground"] =
      contrastText(secondaryBrand);
  }
  // Both page backgrounds are published as variables and globals.css picks one
  // per `data-theme`, so the switch still works after hydration - an inline
  // `background` here would be whatever the server resolved and would go stale
  // the moment the visitor toggles the theme.
  (bodyStyle as Record<string, string>)["--page-background-light"] =
    pageBackgroundLight;
  (bodyStyle as Record<string, string>)["--page-background-dark"] =
    pageBackgroundDark;

  // The tenant's typefaces. Both variables are optional: `globals.css` falls
  // back to the platform stack, so a tenant that has set no font (or only a
  // body one) renders exactly as before. The families are published as
  // variables rather than as a resolved `font-family` here so a component can
  // ask for the display face specifically (`var(--font-display)`), which is the
  // whole point of storing the two names separately.
  const fontUrl = isGoogleFontUrl(system?.google_font_url)
    ? (system?.google_font_url ?? "")
    : "";
  const fontDisplay = fontUrl ? cssFontFamily(system?.font_display) : null;
  const fontBody = fontUrl ? cssFontFamily(system?.font_body) : null;
  if (fontBody) (bodyStyle as Record<string, string>)["--font-body"] = fontBody;
  // A tenant that names only a body face gets it for headings too, which is a
  // legitimate single-family design - not a missing value to fall back from.
  const display = fontDisplay ?? fontBody;
  if (display)
    (bodyStyle as Record<string, string>)["--font-display"] = display;

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        {/* The tenant's own typefaces, if they set any. Rendered here rather
            than @import-ed from globals.css because the URL is per-tenant, and
            because an @import blocks on the CSS file before it even starts
            fetching the font. `isGoogleFontUrl` has already vetted the host. */}
        {fontUrl && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin=""
            />
            {/* ⚠ `crossOrigin` is load-bearing for the CMS's flyer exports, not
                a tidy-up. Without it the browser marks this stylesheet
                origin-unclean, and every read of `sheet.cssRules` throws a
                SecurityError - which is exactly what `html-to-image` does when
                it walks the page's stylesheets to embed the @font-face rules
                for a coupon or social-post capture. Google Fonts answers with
                `access-control-allow-origin: *`, so requesting it in CORS mode
                makes the sheet readable and the export silent. */}
            <link rel="stylesheet" href={fontUrl} crossOrigin="anonymous" />
          </>
        )}
        <ThemeScript defaultMode="light" />
      </head>
      <body style={bodyStyle}>
        <SerwistProvider swUrl="/sw.js">
          <NextIntlClientProvider messages={messages}>
            <SessionProvider session={session}>
              <ThemeProvider
                initialMode={initialMode}
                initialResolved={initialResolved}
              >
                <PaletteProvider
                  palette="cyan"
                  accent={accent}
                  // The two page backgrounds join the palette's own surfaces
                  // when the provider re-derives `--accent-text` on a theme
                  // toggle, so what it writes matches the pair published inline
                  // above rather than being measured against fewer surfaces.
                  inkSurfaceLight={pageBackgroundLight}
                  inkSurfaceDark={pageBackgroundDark}
                >
                  {/* One basemap for every map on the site - the contact page's
                      locations, an event's pin, the booking page's branch map -
                      resolved here because this layout already reads `getSystem`
                      and the maps themselves are client components several
                      levels down. See `components/basemap-provider.tsx`. */}
                  <BasemapProvider basemap={basemapFor(system)}>
                    {/* Sits behind everything (z-index -1) and off the CMS.
                      Which images tile: the logo, the brandmark (only if one is
                      uploaded), or both intercalated. With neither selected the
                      layer paints nothing, so it is not rendered at all. */}
                    {system?.watermark_enabled &&
                      (() => {
                        const showBrandmark =
                          system.watermark_show_brandmark &&
                          !!system.img_brandmark;
                        const logo = system.img_logo || "/logo.png";
                        const primary = system.watermark_show_logo
                          ? logo
                          : showBrandmark
                            ? system.img_brandmark
                            : undefined;
                        const secondary =
                          system.watermark_show_logo && showBrandmark
                            ? system.img_brandmark
                            : undefined;
                        if (!primary) return null;
                        return (
                          <HideOnAdmin>
                            <HideOnFullScreenTool>
                              <LogoWatermark
                                logo={primary}
                                secondaryLogo={secondary}
                                size={system.watermark_size}
                                spacing={system.watermark_spacing}
                                rotation={system.watermark_rotation}
                                intercalated={system.watermark_intercalated}
                                opacity={system.watermark_opacity}
                              />
                            </HideOnFullScreenTool>
                          </HideOnAdmin>
                        );
                      })()}
                    {/* The till and the order board render their own slim bar
                      instead - a full-screen single-purpose tool has no use for
                      a Favorites link mid-sale. The CMS keeps the navbar (its
                      layout reserves the height), which is why this is not
                      `HideOnAdmin`. */}
                    <HideOnFullScreenTool>
                      <NavbarClient
                        logo={system?.img_logo ?? "/logo.png"}
                        version={`v${packageJson.version}`}
                        productCount={system?.product_count ?? 0}
                        serviceCount={system?.service_count ?? 0}
                        menuCategories={stockedMenuCategories}
                        // Resolved here, from the System payload this layout
                        // already holds, because the navbar is a client
                        // component and the labels are per-locale content.
                        kindLabels={kindLabels(system, locale)}
                        showContact={
                          !!system?.contact_email ||
                          (system?.branch_count ?? 0) > 0
                        }
                        eventCount={system?.event_count ?? 0}
                        cartCount={cartCount}
                        // The tenant's own choice (/admin/logos-and-styles):
                        // a blurred bar over the hero, or a solid one.
                        translucent={system?.navbar_translucent ?? true}
                      />
                    </HideOnFullScreenTool>
                    {/* Renders nothing; folds a guest's localStorage cart and
                      favorites into their account as soon as a session exists. */}
                    <GuestMerge />
                    {children}
                    {isDev && (
                      <HideOnAdmin>
                        <HideOnFullScreenTool>
                          <DevSiteSwitcher
                            sites={SITE_CONFIGS.map((c) => ({
                              slug: c.slug,
                              name: c.name,
                            }))}
                            current={devSite}
                            cookieName={DEV_SITE_COOKIE}
                          />
                        </HideOnFullScreenTool>
                      </HideOnAdmin>
                    )}
                    <HideOnAdmin>
                      <HideOnFullScreenTool>
                        <Footer
                          logo={system?.img_logo ?? "/logo.png"}
                          system={system}
                        />
                      </HideOnFullScreenTool>
                    </HideOnAdmin>
                  </BasemapProvider>
                </PaletteProvider>
              </ThemeProvider>
            </SessionProvider>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
