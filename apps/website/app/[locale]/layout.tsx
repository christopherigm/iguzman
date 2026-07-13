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
import { NavbarClient } from "./navbar-client";
import { DevSiteSwitcher } from "./dev-site-switcher";
import { Footer } from "@/components/footer";
import { FooterVisibility } from "@/components/footer-visibility";
import packageJson from "@/package.json";
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

  const [messages, system] = await Promise.all([getMessages(), getSystem()]);

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get("theme-mode")?.value as
    | ThemeMode
    | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as
    | ResolvedTheme
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? "system";
  const initialResolved: ResolvedTheme =
    initialMode === "system"
      ? (themeResolvedCookie ?? "light")
      : (initialMode as ResolvedTheme);

  const isDev = process.env.NODE_ENV === "development";
  const devSite = isDev ? (cookieStore.get(DEV_SITE_COOKIE)?.value ?? "") : "";

  const paletteVars = palettes["cyan"]?.[initialResolved] ?? {};
  const bodyStyle = Object.fromEntries(
    Object.entries(paletteVars),
  ) as React.CSSProperties;
  (bodyStyle as Record<string, string>)["--accent"] = "#68c3f7";

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body style={bodyStyle}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            initialMode={initialMode}
            initialResolved={initialResolved}
          >
            <PaletteProvider palette="cyan" accent="#68c3f7">
              <NavbarClient
                logo={system?.img_logo ?? "/logo.png"}
                version={`v${packageJson.version}`}
                productCount={system?.product_count ?? 0}
                serviceCount={system?.service_count ?? 0}
              />
              {children}
              {isDev && (
                <DevSiteSwitcher
                  sites={SITE_CONFIGS.map((c) => ({
                    slug: c.slug,
                    name: c.name,
                  }))}
                  current={devSite}
                  cookieName={DEV_SITE_COOKIE}
                />
              )}
              <FooterVisibility>
                <Footer
                  logo={system?.img_logo ?? "/logo.png"}
                  system={system}
                />
              </FooterVisibility>
            </PaletteProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
