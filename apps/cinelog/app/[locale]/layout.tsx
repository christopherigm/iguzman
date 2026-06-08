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
import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';
import { SerwistProvider } from '@serwist/next/react';
import packageJson from '@/package.json';
import '../globals.css';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#e11d48',
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
  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.webmanifest',
    icons: { icon: '/favicon.ico', apple: '/icons/icon-192x192.png' },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: t('title') },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) { notFound(); }
  setRequestLocale(locale);
  const messages = await getMessages();

  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (key: string) => string;
  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as ThemeMode | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as ResolvedTheme | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'system' ? (themeResolvedCookie ?? 'light') : (initialMode as ResolvedTheme);

  const paletteVars = palettes['rose']?.[initialResolved] ?? {};
  const bodyStyle = Object.fromEntries(Object.entries(paletteVars)) as React.CSSProperties;
  (bodyStyle as Record<string, string>)['--accent'] = '#e11d48';

  return (
    <html lang={locale} data-theme={initialResolved} style={{ colorScheme: initialResolved }} suppressHydrationWarning>
      <head>
        <ThemeScript />
        {/* iOS PWA splash screens */}
        <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1170x2532.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1179x2556.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1290x2796.jpg" />
      </head>
      <body style={bodyStyle}>
      <SerwistProvider swUrl="/sw.js">
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider initialMode={initialMode} initialResolved={initialResolved}>
          <PaletteProvider palette="rose" accent="#e11d48">
            <NavbarWrapper
              logo="/logo-navbar.png"
              version={`v${packageJson.version}`}
              labels={{ home: tNav('home'), account: tNav('account'), signOut: tNav('signOut') }}
            />
            {children}
            <Footer logo="/logo-navbar.png" />
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
      </SerwistProvider>
      </body>
    </html>
  );
}
