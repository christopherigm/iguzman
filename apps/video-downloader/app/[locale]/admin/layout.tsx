import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { Navbar } from '@repo/ui/core-elements/navbar';
import '../../globals.css';
import './admin.css';

export const metadata: Metadata = {
  title: 'Admin Dashboard — Video Downloader',
  description: 'Task management dashboard',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeModeCookie = cookieStore.get('theme-mode')?.value as
    | ThemeMode
    | undefined;
  const initialMode: ThemeMode = themeModeCookie ?? 'system';
  const initialResolved: ResolvedTheme =
    initialMode === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      data-theme={initialResolved}
      style={{ colorScheme: initialResolved }}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider
          initialMode={initialMode}
          initialResolved={initialResolved}
        >
          <PaletteProvider palette="cyan" accent="#68c3f7">
            <Navbar logo="/logo.png" items={[{ label: 'Home', href: '/' }]} />
            <br />
            <br />
            {children}
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
