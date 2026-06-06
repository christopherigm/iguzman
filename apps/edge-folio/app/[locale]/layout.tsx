import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { ThemeProvider, ThemeScript, RESOLVED_COOKIE_NAME } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { routing } from '@repo/i18n/routing';
import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';
import packageJson from '@/package.json';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

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
  const t = (await getTranslations({ locale, namespace: 'Metadata' })) as (
    key: string,
  ) => string;

  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/favicon.ico',
      apple: '/icons/icon-192x192.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: t('title'),
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

  const messages = await getMessages();

  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (
    key: string,
  ) => string;

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as
    | ThemeMode
    | undefined;
  const themeResolvedCookie = cookieStore.get(RESOLVED_COOKIE_NAME)?.value as
    | ResolvedTheme
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'system'
      ? (themeResolvedCookie ?? 'light')
      : (initialMode as ResolvedTheme);

  return (
    <html
      lang={locale}
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        {/* iOS PWA splash screens */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-640x1136.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-750x1334.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-828x1792.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1125x2436.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1242x2208.jpg"
        />
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
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1284x2778.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/splash/splash-1290x2796.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-1536x2048.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-1668x2388.jpg"
        />
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/splash/splash-2048x2732.jpg"
        />
      </head>
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider
          initialMode={initialMode}
          initialResolved={initialResolved}
        >
          <PaletteProvider palette="cyan" accent="#06b6d4">
            <NavbarWrapper
              logo="/logo-navbar.png"
              version={`v${packageJson.version}`}
              labels={{
                home: tNav('home'),
                matrix: tNav('matrix'),
                extract: tNav('extract'),
                account: tNav('account'),
                signOut: tNav('signOut'),
              }}
            />
            {children}
            <Footer />
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
