import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider, ThemeScript, RESOLVED_COOKIE_NAME } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { palettes } from '@repo/ui/palettes';
import { routing } from '@repo/i18n/routing';
import { getSession } from '@repo/auth/session';
import { SessionProvider } from '@repo/auth/session-provider';
import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';
import { HideOnAdmin } from './hide-on-admin';
import { LogoWatermark } from '@/components/logo-watermark';
import { getSystem, logoUrl } from '@/lib/system';
import { isGoogleFontUrl, cssFontFamily } from '@/lib/fonts';
import { localized } from '@/lib/i18n-field';
import { SerwistProvider } from '@serwist/next/react';
import packageJson from '@/package.json';
import '../globals.css';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'Metadata' })) as (key: string) => string;
  const system = await getSystem();

  // The site's own name and description win over the bundled strings, which
  // stay as the fallback for a site nobody has filled in yet. The description is
  // a Spanish/English pair like every other authored text here, so it is
  // resolved for this locale rather than published raw.
  const title = system.site_name || t('title');
  const description = localized(system, 'site_description', locale) ?? t('description');

  return {
    title,
    description,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: system.img_favicon ?? '/favicon.ico',
      apple: system.img_manifest_192 ?? '/icons/icon-192x192.png',
    },
    appleWebApp: { capable: true, statusBarStyle: 'default', title },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (key: string) => string;

  // Decoded from the access-token cookie during this request, so the HTML we
  // send already reflects who the user is - no logged-out flash, no reload.
  const session = await getSession();
  // Request-cached, so asking here costs nothing on top of what generateMetadata
  // already fetched.
  const system = await getSystem();

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as ThemeMode | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as
    | ResolvedTheme
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'light';
  const initialResolved: ResolvedTheme =
    initialMode === 'system' ? (themeResolvedCookie ?? 'light') : (initialMode as ResolvedTheme);

  const paletteVars = palettes['cyan']?.[initialResolved] ?? {};
  const bodyStyle = Object.fromEntries(Object.entries(paletteVars)) as React.CSSProperties;
  const style = bodyStyle as Record<string, string>;
  style['--accent'] = system.primary_color;
  style['--secondary'] = system.secondary_color;
  // Both backgrounds ship as variables and globals.css picks one per theme - an
  // inline `background` would be whatever the server resolved and would go stale
  // the moment the visitor toggles the theme.
  style['--page-background-light'] = system.background_light;
  style['--page-background-dark'] = system.background_dark;

  // The typefaces. Rejected rather than escaped when a family name is not
  // plausibly one: it ends up in an inline style attribute. `cssFontFamily`
  // returns null for anything else, which simply leaves the default stack.
  const displayFamily = cssFontFamily(system.font_display);
  const bodyFamily = cssFontFamily(system.font_body);
  if (displayFamily) style['--font-display'] = displayFamily;
  if (bodyFamily) style['--font-body'] = bodyFamily;

  // Re-checked here even though the API validates it on write: the value lands
  // in a <link rel="stylesheet"> on every page, and a row written before the
  // validator existed (or straight into the database) would otherwise pull a
  // stylesheet from an arbitrary origin. Cheap to re-check, expensive to miss.
  const fontUrl = isGoogleFontUrl(system.google_font_url) ? system.google_font_url : null;

  // Which images the watermark tiles: both on -> intercalate logo and brandmark;
  // one on -> that image; neither (or nothing uploaded) -> paint nothing.
  const showLogo = system.watermark_show_logo;
  const showBrandmark = system.watermark_show_brandmark && Boolean(system.img_brandmark);
  const watermarkPrimary = showLogo
    ? logoUrl(system)
    : showBrandmark
      ? (system.img_brandmark ?? undefined)
      : undefined;
  const watermarkSecondary =
    showLogo && showBrandmark ? (system.img_brandmark ?? undefined) : undefined;

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript defaultMode="light" />
        {/* A <link>, not an @import in globals.css: the URL is per-site, and an
            @import would block on the CSS file before the font fetch even
            starts. */}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        {/* iOS PWA splash screens */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1170x2532.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1179x2556.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1290x2796.jpg"
        />
      </head>
      <body style={bodyStyle}>
        <SerwistProvider swUrl="/sw.js">
          <NextIntlClientProvider messages={messages}>
            <SessionProvider session={session}>
              <ThemeProvider initialMode={initialMode} initialResolved={initialResolved}>
                <PaletteProvider palette="cyan" accent={system.primary_color}>
                  {/* Behind the public pages only: the CMS is a working surface
                      and a tiled logo behind a form is noise. */}
                  {system.watermark_enabled && watermarkPrimary && (
                    <HideOnAdmin>
                      <LogoWatermark
                        logo={watermarkPrimary}
                        secondaryLogo={watermarkSecondary}
                        size={system.watermark_size}
                        spacing={system.watermark_spacing}
                        rotation={system.watermark_rotation}
                        intercalated={system.watermark_intercalated}
                        opacity={system.watermark_opacity}
                      />
                    </HideOnAdmin>
                  )}
                  <NavbarWrapper
                    logo={logoUrl(system)}
                    version={`v${packageJson.version}`}
                    labels={{
                      home: tNav('home'),
                      account: tNav('account'),
                      signOut: tNav('signOut'),
                      admin: tNav('admin'),
                    }}
                  />
                  {children}
                  <HideOnAdmin>
                    <Footer logo={logoUrl(system)} />
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
