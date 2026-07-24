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
import { HideOnAdmin, HideOnPos } from "@/components/hide-on-admin";
import { GuestMerge } from "@/components/guest-merge";
import { LogoWatermark } from "@/components/logo-watermark";
import packageJson from "@/package.json";
import { getCartCount } from "@/lib/cart";
import { getSystem } from "@/lib/system";
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
  const [messages, system, session, cartCount] = await Promise.all([
    getMessages(),
    getSystem(),
    getSession(),
    getCartCount(),
  ]);

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get("theme-mode")?.value as
    | ThemeMode
    | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as
    | ResolvedTheme
    | undefined;
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
  // Both page backgrounds are published as variables and globals.css picks one
  // per `data-theme`, so the switch still works after hydration - an inline
  // `background` here would be whatever the server resolved and would go stale
  // the moment the visitor toggles the theme.
  (bodyStyle as Record<string, string>)["--page-background-light"] =
    system?.background_light ?? "#e5e5e5";
  (bodyStyle as Record<string, string>)["--page-background-dark"] =
    system?.background_dark ?? "#3c3c3c";

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
            <link rel="stylesheet" href={fontUrl} />
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
                <PaletteProvider palette="cyan" accent={accent}>
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
                          <HideOnPos>
                            <LogoWatermark
                              logo={primary}
                              secondaryLogo={secondary}
                              size={system.watermark_size}
                              spacing={system.watermark_spacing}
                              rotation={system.watermark_rotation}
                              intercalated={system.watermark_intercalated}
                              opacity={system.watermark_opacity}
                            />
                          </HideOnPos>
                        </HideOnAdmin>
                      );
                    })()}
                  {/* The till renders its own slim bar instead - a full-screen
                      single-purpose tool has no use for a Favorites link
                      mid-sale. The CMS keeps the navbar (its layout reserves
                      the height), which is why this is not `HideOnAdmin`. */}
                  <HideOnPos>
                    <NavbarClient
                      logo={system?.img_logo ?? "/logo.png"}
                      version={`v${packageJson.version}`}
                      productCount={system?.product_count ?? 0}
                      serviceCount={system?.service_count ?? 0}
                      foodCount={system?.menu_item_count ?? 0}
                      showContact={
                        !!system?.contact_email ||
                        (system?.branch_count ?? 0) > 0
                      }
                      cartCount={cartCount}
                    />
                  </HideOnPos>
                  {/* Renders nothing; folds a guest's localStorage cart and
                      favorites into their account as soon as a session exists. */}
                  <GuestMerge />
                  {children}
                  {isDev && (
                    <HideOnAdmin>
                      <HideOnPos>
                        <DevSiteSwitcher
                          sites={SITE_CONFIGS.map((c) => ({
                            slug: c.slug,
                            name: c.name,
                          }))}
                          current={devSite}
                          cookieName={DEV_SITE_COOKIE}
                        />
                      </HideOnPos>
                    </HideOnAdmin>
                  )}
                  <HideOnAdmin>
                    <HideOnPos>
                      <Footer
                        logo={system?.img_logo ?? "/logo.png"}
                        system={system}
                      />
                    </HideOnPos>
                  </HideOnAdmin>
                </PaletteProvider>
              </ThemeProvider>
            </SessionProvider>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
