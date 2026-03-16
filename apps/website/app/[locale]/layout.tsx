import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { routing } from '@repo/i18n/routing';
import { NavbarClient } from './navbar-client';
import packageJson from '@/package.json';
import { getSystem } from '@/lib/system';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#68c3f7',
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

  const system = await getSystem();

  return {
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.webmanifest',
    icons: {
      icon: system?.img_favicon ?? '/favicon.ico',
      apple: system?.img_manifest_128 ?? '/icons/icon-192x192.png',
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

  const [messages, system] = await Promise.all([getMessages(), getSystem()]);

  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as
    | ThemeMode
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'dark' ? 'dark' : 'light';

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
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider
          initialMode={initialMode}
          initialResolved={initialResolved}
        >
          <PaletteProvider palette="cyan">
            <NavbarClient
              logo={system?.img_logo ?? '/logo.png'}
              version={`v${packageJson.version}`}
            />
            {children}
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
