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
import { HideOnAdmin } from "@/components/hide-on-admin";
import { GuestMerge } from "@/components/guest-merge";
import packageJson from "@/package.json";
import { getCartCount } from "@/lib/cart";
import { getSystem } from "@/lib/system";
import { DEV_SITE_COOKIE, SITE_CONFIGS } from "@/sites/registry";
import "../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#68c3f7",
};

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

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
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
                  <NavbarClient
                    logo={system?.img_logo ?? "/logo.png"}
                    version={`v${packageJson.version}`}
                    productCount={system?.product_count ?? 0}
                    serviceCount={system?.service_count ?? 0}
                    foodCount={system?.menu_item_count ?? 0}
                    cartCount={cartCount}
                  />
                  {/* Renders nothing; folds a guest's localStorage cart and
                      favorites into their account as soon as a session exists. */}
                  <GuestMerge />
                  {children}
                  {isDev && (
                    <HideOnAdmin>
                      <DevSiteSwitcher
                        sites={SITE_CONFIGS.map((c) => ({
                          slug: c.slug,
                          name: c.name,
                        }))}
                        current={devSite}
                        cookieName={DEV_SITE_COOKIE}
                      />
                    </HideOnAdmin>
                  )}
                  <HideOnAdmin>
                    <Footer
                      logo={system?.img_logo ?? "/logo.png"}
                      system={system}
                    />
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
