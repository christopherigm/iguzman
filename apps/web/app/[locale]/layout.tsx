import type { Metadata } from 'next';
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
import { Navbar } from '@repo/ui/core-elements/navbar';
import packageJson from '../../package.json';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

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
            <Navbar
              logo="/logo.png"
              items={[
                { label: 'Home', href: '/' },
                {
                  label: 'Products',
                  children: [
                    { label: 'Widget', href: '/products/widget' },
                    { label: 'Gadget', href: '/products/gadget' },
                  ],
                },
              ]}
              fixedItems={[{ label: 'Login', href: '/login' }]}
              version={`v${packageJson.version}`}
              searchBox
            />
            {children}
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
