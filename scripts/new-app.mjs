import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { APPS_DIR, createPrompt } from './utils.mjs';

// ── Update prompt ──────────────────────────────────────────────────────
// Update new-app.mjs file to reflect changes made in apps/web and its dependencies

// ── Constants ──────────────────────────────────────────────────────────

const VALID_PALETTES = [
  'cyan',
  'ocean',
  'rose',
  'emerald',
  'amber',
  'violet',
  'slate',
  'coral',
  'teal',
  'fuchsia',
];

// Light-mode accent color for each palette (mirrors packages/ui/src/palettes.ts)
const PALETTE_ACCENT = {
  cyan:    '#06b6d4',
  ocean:   '#2563eb',
  rose:    '#e11d48',
  emerald: '#059669',
  amber:   '#d97706',
  violet:  '#7c3aed',
  slate:   '#475569',
  coral:   '#ea580c',
  teal:    '#0d9488',
  fuchsia: '#c026d3',
};

// ── Helpers ────────────────────────────────────────────────────────────

function validateAppName(name) {
  if (!name) return 'App name is required.';
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    return 'Name must start with a letter and contain only lowercase letters, numbers, and hyphens.';
  if (existsSync(join(APPS_DIR, name)))
    return `Directory apps/${name} already exists.`;
  return null;
}

function writeFile(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function toTitleCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Template Functions ─────────────────────────────────────────────────

function packageJson(name, port, includeI18n, includePwa, includeAuth) {
  const pkg = {
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      dev: `next dev --port ${port}`,
      build: 'next build',
      start: 'next start',
      lint: 'eslint --max-warnings 0',
      'check-types': includeI18n
        ? 'next typegen && tsc --noEmit'
        : 'tsc --noEmit',
    },
    dependencies: {
      '@repo/helpers': 'workspace:*',
      '@swc/helpers': '^0.5.21',
      '@repo/ui': 'workspace:*',
      react: '^19.2.4',
      'react-dom': '^19.2.4',
      swiper: '^12.1.3',
    },
    devDependencies: {
      '@repo/eslint-config': 'workspace:*',
      '@repo/typescript-config': 'workspace:*',
      '@types/node': '^25.5.2',
      '@types/react': '19.2.14',
      '@types/react-dom': '19.2.3',
      eslint: '^10.2.0',
      typescript: '6.0.2',
    },
  };

  pkg.dependencies['pino'] = '^10.3.1';

  if (includeI18n) {
    pkg.dependencies['@repo/i18n'] = 'workspace:^';
    pkg.dependencies['next-intl'] = '^4';
  }

  if (includePwa) {
    pkg.dependencies['@serwist/next'] = '^9.5.11';
    pkg.devDependencies['serwist'] = '^9.5.11';
  }

  if (includeAuth) {
    pkg.dependencies['@simplewebauthn/browser'] = '^13.1.0';
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}

function nextConfig(includeI18n, includePwa) {
  const baseConfig = `  output: 'standalone',
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? path.join(__dirname, '../../') : undefined,
  allowedDevOrigins: ['127.0.0.1', '*'],
  logging: { incomingRequests: false },
  images: {
    dangerouslyAllowLocalIP: true,
    qualities: [75, 80, 85, 90],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },`;

  if (includeI18n && includePwa) {
    return `import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
${baseConfig}
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withSerwist(withNextIntl(nextConfig));
`;
  }

  if (includeI18n) {
    return `import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
${baseConfig}
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
`;
  }

  if (includePwa) {
    return `import withSerwistInit from '@serwist/next';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
${baseConfig}
};

export default withSerwist(nextConfig);
`;
  }

  return `import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
${baseConfig}
};

export default nextConfig;
`;
}

function tsConfig(includePwa) {
  const config = {
    extends: '@repo/typescript-config/nextjs.json',
    compilerOptions: {
      plugins: [{ name: 'next' }],
      allowArbitraryExtensions: true,
      paths: {
        '@/*': ['./*'],
      },
    },
    include: [
      '**/*.ts',
      '**/*.tsx',
      'next-env.d.ts',
      'next.config.js',
      '.next/types/**/*.ts',
    ],
    exclude: ['node_modules'],
  };

  if (includePwa) {
    config.compilerOptions.lib = ['es2022', 'DOM', 'DOM.Iterable', 'webworker'];
    config.compilerOptions.types = ['@serwist/next/typings'];
    config.exclude = ['node_modules', 'public/sw.js'];
  }

  return JSON.stringify(config, null, 2) + '\n';
}

function eslintConfig() {
  return `import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
`;
}

function gitignore(includePwa) {
  let content = `# dependencies
/node_modules
/.pnp
.pnp.js
.yarn/install-state.gz

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# env files (can opt-in for commiting if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
`;

  if (includePwa) {
    content += `
# PWA generated files
public/sw*
public/swe-worker*
`;
  }

  return content;
}

function globalsCss() {
  return `@import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap');

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: 'Roboto', sans-serif;
  font-optical-sizing: auto;
  font-style: normal;
}

body {
  color: var(--foreground);
  background: var(--background);
  touch-action: pan-x pan-y;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}
`;
}

const IOS_SPLASH_LINKS = `
        {/* iOS PWA splash screens */}
        <link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-640x1136.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-750x1334.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-828x1792.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1125x2436.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1242x2208.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1170x2532.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1179x2556.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1284x2778.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/icons/splash/splash-1290x2796.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-1536x2048.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-1668x2388.jpg" />
        <link rel="apple-touch-startup-image" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/icons/splash/splash-2048x2732.jpg" />`;

function layoutTsx(name, palette, includeI18n, includePwa, includeAuth) {
  const title = toTitleCase(name);
  const accent = PALETTE_ACCENT[palette] ?? '#06b6d4';

  if (includeI18n) {
    const metaImport = includePwa
      ? "import type { Metadata, Viewport } from 'next';"
      : "import type { Metadata } from 'next';";

    const viewportExport = includePwa
      ? `
export const viewport: Viewport = {
  themeColor: '${accent}',
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
};
`
      : '';

    const extendedMeta = includePwa
      ? `
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
    },`
      : '';

    const splashLinks = includePwa ? IOS_SPLASH_LINKS : '';

    const navbarImport = includeAuth
      ? `import { NavbarWrapper } from './navbar-wrapper';
import { Footer } from './footer';`
      : `import { Navbar } from '@repo/ui/core-elements/navbar';`;

    const tNavDecl = includeAuth
      ? `
  const tNav = (await getTranslations({ locale, namespace: 'Navbar' })) as (
    key: string,
  ) => string;
`
      : '';

    const navbarJsx = includeAuth
      ? `            <NavbarWrapper
              logo="/logo-navbar.png"
              version={\`v\${packageJson.version}\`}
              labels={{
                home: tNav('home'),
                account: tNav('account'),
                signOut: tNav('signOut'),
              }}
            />
            {children}
            <Footer />`
      : `            <Navbar
              logo="/logo.png"
              items={[{ label: 'Home', href: '/' }]}
              fixedItems={[]}
              version={\`v\${packageJson.version}\`}
            />
            {children}`;

    return `${metaImport}
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
${navbarImport}
import packageJson from '@/package.json';
import '../globals.css';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
${viewportExport}
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
    description: t('description'),${extendedMeta}
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
${tNavDecl}
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
        <ThemeScript />${splashLinks}
      </head>
      <NextIntlClientProvider messages={messages}>
        <ThemeProvider
          initialMode={initialMode}
          initialResolved={initialResolved}
        >
          <PaletteProvider palette="${palette}" accent="${accent}">
${navbarJsx}
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
`;
  }

  const metaImport = includePwa
    ? "import type { Metadata, Viewport } from 'next';"
    : "import type { Metadata } from 'next';";

  const viewportExport = includePwa
    ? `
export const viewport: Viewport = {
  themeColor: '${accent}',
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
};
`
    : '';

  const extendedMeta = includePwa
    ? `
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '${title}',
  },
  formatDetection: {
    telephone: false,
  },`
    : '';

  const splashLinks = includePwa ? IOS_SPLASH_LINKS : '';

  return `${metaImport}
import { cookies } from 'next/headers';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { Navbar } from '@repo/ui/core-elements/navbar';
import packageJson from '@/package.json';
import './globals.css';

type Props = {
  children: React.ReactNode;
};
${viewportExport}
export const metadata: Metadata = {
  title: '${title}',
  description: '',${extendedMeta}
};

export default async function RootLayout({ children }: Props) {
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
        <ThemeScript />${splashLinks}
      </head>
      <ThemeProvider
        initialMode={initialMode}
        initialResolved={initialResolved}
      >
        <PaletteProvider palette="${palette}" accent="${accent}">
          <Navbar
            logo="/logo.png"
            items={[{ label: 'Home', href: '/' }]}
            fixedItems={[]}
            version={\`v\${packageJson.version}\`}
          />
          {children}
        </PaletteProvider>
      </ThemeProvider>
    </html>
  );
}
`;
}

function pageTsx(name, includeI18n) {
  const title = toTitleCase(name);

  if (includeI18n) {
    return `import { setRequestLocale } from 'next-intl/server';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 16,
          }}
        >
          ${title}
        </h1>
        <ThemeSwitch hideOnMobile />
      </Box>
    </Container>
  );
}
`;
  }

  return `import { ThemeSwitch } from '@repo/ui/theme-switch';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';

export default function Home() {
  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
    >
      <Box
        width={360}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        alignItems="center"
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 16,
          }}
        >
          ${title}
        </h1>
        <ThemeSwitch />
      </Box>
    </Container>
  );
}
`;
}

function proxyTs(includeAuth) {
  if (includeAuth) {
    return `import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ['/account'];

function isProtectedPath(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\\/[a-z]{2}(-[A-Z]{2})?/, '');
  return PROTECTED_PREFIXES.some((prefix) => withoutLocale.startsWith(prefix));
}

export default function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname)) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      const locale = request.nextUrl.pathname.split('/')[1] ?? 'en';
      return NextResponse.redirect(new URL(\`/\${locale}/auth\`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\\\..*).*)',],
};
`;
  }

  return `import createMiddleware from 'next-intl/middleware';
import { routing } from '@repo/i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)',
};
`;
}

function i18nRequestTs() {
  return `import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@repo/i18n/routing';
import { getSharedMessages } from '@repo/i18n/request';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const [sharedMessages, localMessages] = await Promise.all([
    getSharedMessages(locale),
    import(\`../messages/\${locale}.json\`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: { ...sharedMessages, ...localMessages },
  };
});
`;
}

function cssDts() {
  return `declare module 'swiper/css';
declare module 'swiper/css/*';
`;
}

function globalDts() {
  return `import type sharedMessages from '@repo/i18n/messages/en';
import type localMessages from './messages/en.json';

type Messages = typeof sharedMessages & typeof localMessages;

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
`;
}

function messagesJson(lang, name, includeAuth) {
  const title = toTitleCase(name);

  const base = {
    Metadata: { title, description: '' },
    HomePage: { title },
  };

  if (!includeAuth) {
    return JSON.stringify(base, null, 2) + '\n';
  }

  const authMessages =
    lang === 'en'
      ? {
          Navbar: { home: 'Home', account: 'Account', signOut: 'Sign out' },
          Footer: {
            appHeading: 'App',
            legalHeading: 'Legal',
            home: 'Home',
            account: 'Account',
            privacyPolicy: 'Privacy Policy',
            terms: 'Terms of Service',
            userData: 'User Data',
            copyright: `© {year} ${title}. All rights reserved.`,
          },
          VerifyEmailPage: {
            loading: 'Verifying your email…',
            successTitle: 'Email Verified',
            successDetail: 'Your email has been verified. You can now sign in.',
            redirecting: 'Redirecting in {seconds}…',
            redirectProgress: 'Redirect progress',
            expiredTitle: 'Link Expired',
            expiredDetail:
              'This verification link has expired. Please sign up again to request a new one.',
            invalidTitle: 'Invalid Link',
            invalidDetail:
              'This verification link is invalid. Please check your email or sign up again.',
          },
          AuthPage: {
            tabSignIn: 'Sign In',
            tabSignUp: 'Sign Up',
            tabReset: 'Reset Password',
            signIn: {
              title: 'Sign In',
              subtitle: 'Welcome back',
              emailLabel: 'Email',
              passwordLabel: 'Password',
              submitButton: 'Sign In',
              submitting: 'Signing in…',
              errorInvalidCredentials: 'Invalid email or password.',
              errorGeneric: 'Something went wrong. Please try again.',
              forgotPassword: 'Forgot your password?',
              noAccount: "Don't have an account? Sign up",
              orDivider: 'or',
              passkeyButton: 'Sign in with passkey',
              errorPasskeyFailed:
                'Passkey authentication failed. Please try again.',
              errorEmailRequired: 'Please enter your email first.',
              rememberEmail: 'Remember email',
            },
            signUp: {
              title: 'Create Account',
              subtitle: `Join ${title} today`,
              emailLabel: 'Email',
              firstNameLabel: 'First Name',
              lastNameLabel: 'Last Name',
              passwordLabel: 'Password',
              confirmPasswordLabel: 'Confirm Password',
              submitButton: 'Create Account',
              submitting: 'Creating account…',
              successDetail:
                'Account created! Please check your email to verify your account.',
              errorEmailTaken: 'An account with this email already exists.',
              errorPasswordMismatch: 'Passwords do not match.',
              errorGeneric: 'Something went wrong. Please try again.',
              haveAccount: 'Already have an account? Sign in',
              forgotPassword: 'Forgot your password?',
            },
            resetPassword: {
              title: 'Reset Password',
              subtitle: 'Enter your email to receive a reset link',
              emailLabel: 'Email',
              submitButton: 'Send Reset Link',
              submitting: 'Sending…',
              successDetail:
                'If an account with that email exists, a password reset link has been sent.',
              errorGeneric: 'Something went wrong. Please try again.',
              backToSignIn: 'Back to Sign In',
            },
            passkey: {
              promptTitle: 'Set up a passkey?',
              promptDescription:
                'Sign in faster and more securely with a passkey. Use your fingerprint, face, or device PIN.',
              registerButton: 'Set up passkey',
              skipButton: 'Skip for now',
              successMessage: 'Passkey registered successfully!',
              errorGeneric:
                'Failed to register passkey. You can try again later.',
            },
          },
        }
      : {
          Navbar: { home: 'Home', account: 'Account', signOut: 'Sign out' },
          Footer: {
            appHeading: 'App',
            legalHeading: 'Legal',
            home: 'Home',
            account: 'Account',
            privacyPolicy: 'Privacy Policy',
            terms: 'Terms of Service',
            userData: 'User Data',
            copyright: `© {year} ${title}. All rights reserved.`,
          },
          VerifyEmailPage: {
            loading: 'Verifying your email…',
            successTitle: 'Email Verified',
            successDetail: 'Your email has been verified. You can now sign in.',
            redirecting: 'Redirecting in {seconds}…',
            redirectProgress: 'Redirect progress',
            expiredTitle: 'Link Expired',
            expiredDetail:
              'This verification link has expired. Please sign up again to request a new one.',
            invalidTitle: 'Invalid Link',
            invalidDetail:
              'This verification link is invalid. Please check your email or sign up again.',
          },
          AuthPage: {
            tabSignIn: 'Sign In',
            tabSignUp: 'Sign Up',
            tabReset: 'Reset Password',
            signIn: {
              title: 'Sign In',
              subtitle: 'Welcome back',
              emailLabel: 'Email',
              passwordLabel: 'Password',
              submitButton: 'Sign In',
              submitting: 'Signing in…',
              errorInvalidCredentials: 'Invalid email or password.',
              errorGeneric: 'Something went wrong. Please try again.',
              forgotPassword: 'Forgot your password?',
              noAccount: "Don't have an account? Sign up",
              orDivider: 'or',
              passkeyButton: 'Sign in with passkey',
              errorPasskeyFailed:
                'Passkey authentication failed. Please try again.',
              errorEmailRequired: 'Please enter your email first.',
              rememberEmail: 'Remember email',
            },
            signUp: {
              title: 'Create Account',
              subtitle: `Join ${title} today`,
              emailLabel: 'Email',
              firstNameLabel: 'First Name',
              lastNameLabel: 'Last Name',
              passwordLabel: 'Password',
              confirmPasswordLabel: 'Confirm Password',
              submitButton: 'Create Account',
              submitting: 'Creating account…',
              successDetail:
                'Account created! Please check your email to verify your account.',
              errorEmailTaken: 'An account with this email already exists.',
              errorPasswordMismatch: 'Passwords do not match.',
              errorGeneric: 'Something went wrong. Please try again.',
              haveAccount: 'Already have an account? Sign in',
              forgotPassword: 'Forgot your password?',
            },
            resetPassword: {
              title: 'Reset Password',
              subtitle: 'Enter your email to receive a reset link',
              emailLabel: 'Email',
              submitButton: 'Send Reset Link',
              submitting: 'Sending…',
              successDetail:
                'If an account with that email exists, a password reset link has been sent.',
              errorGeneric: 'Something went wrong. Please try again.',
              backToSignIn: 'Back to Sign In',
            },
            passkey: {
              promptTitle: 'Set up a passkey?',
              promptDescription:
                'Sign in faster and more securely with a passkey. Use your fingerprint, face, or device PIN.',
              registerButton: 'Set up passkey',
              skipButton: 'Skip for now',
              successMessage: 'Passkey registered successfully!',
              errorGeneric:
                'Failed to register passkey. You can try again later.',
            },
          },
        };

  return JSON.stringify({ ...base, ...authMessages }, null, 2) + '\n';
}

function loggerTs(name) {
  return `import pino from 'pino';

/**
 * Root logger for the ${name} app.
 *
 * Outputs structured JSON to stdout so container log aggregators
 * (kubectl logs, Loki, etc.) can parse and query log fields directly.
 *
 * LOG_LEVEL env var defaults to "info" in production and "debug" otherwise.
 */
const logger = pino({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: '${name}' },
});

export default logger;
`;
}

// ── PWA Template Functions ────────────────────────────────────────────

function offlinePageTsx() {
  return `export default function OfflinePage() {
  return (
    <body>
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          You are offline
        </h1>
        <p style={{ fontSize: '1.125rem', opacity: 0.7, maxWidth: '28rem' }}>
          It looks like you lost your internet connection. Please check your
          network and try again.
        </p>
      </main>
    </body>
  );
}
`;
}

function manifestTs(name) {
  const title = toTitleCase(name);
  return `import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '${title}',
    short_name: '${title}',
    description: '${title} application',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#68c3f7',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
`;
}

function swTs() {
  return `import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // \`injectionPoint\` is the string that will be replaced by the actual
    // precache manifest. By default it is set to \`"self.__SW_MANIFEST"\`.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
`;
}

// ── Deployment Template Functions ─────────────────────────────────────

function dockerignore() {
  return `# Dependencies & build artifacts
node_modules
.next
.turbo

# Environment files
.env
.env.*
!.env.example

# Dev / editor
.DS_Store
.vscode
.idea

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Helm / k8s configs (not needed inside the container)
helm
`;
}

function dockerfile(name) {
  return `# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# ---------------------------------------------------------------------------
# Stage 1 – Prune the monorepo so only packages needed by "${name}" are kept.
# This avoids installing unnecessary workspace dependencies.
# ---------------------------------------------------------------------------
FROM base AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune ${name} --docker

# ---------------------------------------------------------------------------
# Stage 2 – Install production + build dependencies (cached layer).
# Only the pruned package.json files and lockfile are copied so that
# source-code changes do not invalidate this layer.
# ---------------------------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=pruner /app/out/json/ ./
RUN corepack enable pnpm && pnpm i --no-frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3 – Build the Next.js application.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm exec turbo run build --filter=${name} --no-daemon

# @swc/helpers is resolved via Node.js conditional package exports at runtime,
# so Next.js static file tracing misses it in pnpm monorepos.
# pnpm stores @swc/helpers as a symlink inside next@*/node_modules/, so:
#   - use \`find -L\` to follow symlinks during traversal (matches -type d on symlinked dirs)
#   - increase maxdepth to 5 to account for symlink resolution adding one level
#   - use \`cp -rL\` to dereference symlinks when copying so the real files land in the image
RUN find -L /app/node_modules/.pnpm -maxdepth 5 \\
      -path "*/next@*/node_modules/@swc/helpers" -type d \\
    | while read src; do \\
        rel="\${src#/app/}"; \\
        dest="/app/apps/${name}/.next/standalone/\${rel}"; \\
        mkdir -p "\$dest"; \\
        cp -rL "\$src/." "\$dest/"; \\
      done

# ---------------------------------------------------------------------------
# Stage 4 – Minimal production image.
# Uses the standalone output so node_modules are NOT copied.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime system dependencies
RUN apk add --no-cache \\
    ffmpeg \\
    curl \\
    jq \\
    wget \\
    python3

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs

# Copy only what the standalone server needs
COPY --from=builder /app/apps/${name}/public ./apps/${name}/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${name}/.next/static ./apps/${name}/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is generated by \`next build\` when output is "standalone"
CMD ["node", "apps/${name}/server.js"]
`;
}

function envExample(name, registryUser = 'my-dockerhub-username', includeAuth) {
  const authVars = includeAuth
    ? `\n# Django API base URL (server-side only, never NEXT_PUBLIC_)\nAPI_URL=http://localhost:8000\n`
    : '';
  return `DOCKER_REGISTRY=${registryUser}
NAMESPACE=${name}
${authVars}`;
}

function helmChartYaml(name) {
  return `apiVersion: v2
name: ${name}
description: Helm chart for the Next.js ${name} application
type: application
version: 0.1.0
appVersion: '0.1.0'
`;
}

function helmValuesYaml(name, registryUser, includeAuth) {
  return `# ─────────────────────────────────────────────────────────────
# ${toTitleCase(name)} Application – Helm Values
# ─────────────────────────────────────────────────────────────

# -- Number of old ReplicaSets to keep for rollbacks (default: 2)
revisionHistoryLimit: 2 # how many old ReplicaSets to keep for rollbacks

# -- Number of pod replicas
replicaCount: 2

# ─── Container image ────────────────────────────────────────
image:
  repository: ${registryUser}/${name} # registry/image (no tag)
  tag: 'latest' # overrides Chart.appVersion
  pullPolicy: IfNotPresent

imagePullSecrets: []
# - name: my-registry-secret

# ─── Name overrides ─────────────────────────────────────────
nameOverride: ''
fullnameOverride: ''

# ─── Service ────────────────────────────────────────────────
service:
  type: ClusterIP
  port: 80 # port exposed by the Service
  targetPort: 3000 # port the container listens on

# ─── Ingress ────────────────────────────────────────────────
ingress:
  enabled: true
  className: 'nginx' # MicroK8s uses the nginx ingress class
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
  hosts:
    - host: ${name}.iguzman.com.mx
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${name}-tls
      hosts:
        - ${name}.iguzman.com.mx

# ─── Environment variables ──────────────────────────────────
# Plain environment variables injected into the container.
env:
  NODE_ENV: 'production'
  NEXT_TELEMETRY_DISABLED: '1'

# Sensitive values – reference existing Kubernetes Secrets.
${includeAuth ? `envFromSecret:
  - name: API_URL
    secretName: ${name}-secrets
    secretKey: API_URL` : `# envFromSecret:
#   - name: DATABASE_URL
#     secretName: ${name}-secrets
#     secretKey: database-url`}

# ─── Shared storage (ReadWriteMany) ─────────────────────────
sharedStorage:
  enabled: true
  storageClass: '' # leave empty for the cluster default
  accessModes:
    - ReadWriteMany
  size: 1Gi
  mountPath: /app/shared # path inside each container

# ─── Health probes (HTTP-based) ─────────────────────────────
probes:
  startupProbe:
    httpGet:
      path: /
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 30 # allow up to ~150 s for first boot

  livenessProbe:
    httpGet:
      path: /
    initialDelaySeconds: 0
    periodSeconds: 10
    failureThreshold: 3

# ─── Node affinity (schedule on specific nodes) ─────────────
nodeAffinity:
  enabled: false
  # List of node names where the pods should be scheduled.
  nodeNames: []
  # - node-1
  # - node-2
  # - node-3

# ─── Resources ──────────────────────────────────────────────
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
`;
}

function helmHelpersTpl(name) {
  return `{{/*
Expand the name of the chart.
*/}}
{{- define "${name}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncated at 63 chars because some Kubernetes name fields are limited to that.
*/}}
{{- define "${name}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version for the chart label.
*/}}
{{- define "${name}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "${name}.labels" -}}
helm.sh/chart: {{ include "${name}.chart" . }}
{{ include "${name}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "${name}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${name}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PVC name for shared storage.
*/}}
{{- define "${name}.pvcName" -}}
{{- printf "%s-shared" (include "${name}.fullname" .) }}
{{- end }}
`;
}

function helmDeploymentYaml(name) {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  revisionHistoryLimit: {{ .Values.revisionHistoryLimit }}
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      {{- if .Values.nodeAffinity.enabled }}
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values:
                      {{- toYaml .Values.nodeAffinity.nodeNames | nindent 22 }}
      {{- end }}

      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}

          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP

          {{- /* ── Plain environment variables ── */}}
          {{- if or .Values.env .Values.envFromSecret }}
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
            {{- range .Values.envFromSecret }}
            - name: {{ .name }}
              valueFrom:
                secretKeyRef:
                  name: {{ .secretName }}
                  key: {{ .secretKey }}
            {{- end }}
          {{- end }}

          {{- /* ── Probes ── */}}
          startupProbe:
            httpGet:
              path: {{ .Values.probes.startupProbe.httpGet.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.startupProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.startupProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.startupProbe.failureThreshold }}

          livenessProbe:
            httpGet:
              path: {{ .Values.probes.livenessProbe.httpGet.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.livenessProbe.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.livenessProbe.periodSeconds }}
            failureThreshold: {{ .Values.probes.livenessProbe.failureThreshold }}

          {{- /* ── Resources ── */}}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}

          {{- /* ── Volume mounts ── */}}
          {{- if .Values.sharedStorage.enabled }}
          volumeMounts:
            - name: shared-data
              mountPath: {{ .Values.sharedStorage.mountPath }}
          {{- end }}

      {{- if .Values.sharedStorage.enabled }}
      volumes:
        - name: shared-data
          persistentVolumeClaim:
            claimName: {{ include "${name}.pvcName" . }}
      {{- end }}
`;
}

function helmServiceYaml(name) {
  return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.targetPort }}
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
`;
}

function helmIngressYaml(name) {
  return `{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - secretName: {{ .secretName | default (printf "%s-tls" (index .hosts 0 | default "${name}")) }}
      hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- $paths := .paths | default (list (dict "path" "/" "pathType" "Prefix")) }}
          {{- range $paths }}
          - path: {{ .path }}
            pathType: {{ .pathType | default "Prefix" }}
            backend:
              service:
                name: {{ include "${name}.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
`;
}

function helmPvcYaml(name) {
  return `{{- if .Values.sharedStorage.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "${name}.pvcName" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  accessModes:
    {{- toYaml .Values.sharedStorage.accessModes | nindent 4 }}
  {{- if .Values.sharedStorage.storageClass }}
  storageClassName: {{ .Values.sharedStorage.storageClass | quote }}
  {{- end }}
  resources:
    requests:
      storage: {{ .Values.sharedStorage.size }}
{{- end }}
`;
}

function helmNotesTxt(name) {
  return `──────────────────────────────────────────────────────────────
  {{ include "${name}.fullname" . }} has been deployed!
──────────────────────────────────────────────────────────────

{{- if .Values.ingress.enabled }}
The application is accessible at:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}
{{- end }}
{{- else }}

To access the application, run:

  kubectl port-forward svc/{{ include "${name}.fullname" . }} {{ .Values.service.port }}:{{ .Values.service.targetPort }}

Then open http://localhost:{{ .Values.service.port }} in your browser.
{{- end }}

Replicas: {{ .Values.replicaCount }}
{{- if .Values.sharedStorage.enabled }}
Shared volume: {{ .Values.sharedStorage.mountPath }} ({{ .Values.sharedStorage.size }})
{{- end }}
`;
}

// ── Auth Template Functions ───────────────────────────────────────────

function libAuthTs() {
  return `export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_picture: string | null;
}

const USER_PROFILE_KEY = 'app_user';

export function storeUser(profile: UserProfile): void {
  const raw = (profile.first_name?.trim() || profile.email) ?? '';
  const displayName = raw.substring(0, 10);
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify({ displayName }));
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName } }));
}

export function clearUser(): void {
  localStorage.removeItem(USER_PROFILE_KEY);
  window.dispatchEvent(new CustomEvent('app-auth', { detail: { displayName: null } }));
}

export function getStoredUser(): { displayName: string } | null {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { displayName: string }) : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('API request failed');
  }
}

export class LoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Login failed');
  }
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new LoginError(res.status, data);
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function signUp(payload: {
  email: string;
  password: string;
  password2: string;
  first_name?: string;
  last_name?: string;
}): Promise<void> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const res = await fetch(\`/api/auth/verify-email/\${token}\`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch('/api/auth/password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile');
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function updateProfile(payload: {
  first_name?: string;
  last_name?: string;
}): Promise<UserProfile> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export async function uploadProfilePicture(
  base64Image: string,
): Promise<{ profile_picture: string | null }> {
  const res = await fetch('/api/auth/profile/picture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64_image: base64Image }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<{ profile_picture: string | null }>;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPassword2: string,
): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      new_password2: newPassword2,
    }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}

export async function deletePasskeyCredential(id: number): Promise<void> {
  const res = await fetch(\`/api/auth/passkey/credentials/\${id}\`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new ApiError(res.status, {});
  }
}

export async function getPasskeyCredentials(): Promise<{
  count: number;
  credentials: { id: number; name: string; created_at: string }[];
}> {
  const res = await fetch('/api/auth/passkey/credentials');
  if (!res.ok) return { count: 0, credentials: [] };
  return res.json() as Promise<{
    count: number;
    credentials: { id: number; name: string; created_at: string }[];
  }>;
}

export async function registerPasskey(
  name = 'My passkey',
): Promise<{ id: number; name: string }> {
  const { startRegistration } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
  });
  if (!optionsRes.ok) {
    const data: Record<string, unknown> = await optionsRes.json().catch(() => ({}));
    throw new ApiError(optionsRes.status, data);
  }

  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startRegistration>[0]['optionsJSON'];
    challenge_id: string;
  };

  const credential = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, challenge_id, name }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new ApiError(verifyRes.status, data);
  }

  return verifyRes.json() as Promise<{ id: number; name: string }>;
}

export async function loginWithPasskey(email: string): Promise<void> {
  const { startAuthentication } = await import('@simplewebauthn/browser');

  const optionsRes = await fetch('/api/auth/passkey/authenticate/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!optionsRes.ok) {
    const data: Record<string, unknown> = await optionsRes.json().catch(() => ({}));
    throw new LoginError(optionsRes.status, data);
  }

  const { options, challenge_id } = (await optionsRes.json()) as {
    options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
    challenge_id: string;
  };

  const credential = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, credential, challenge_id }),
  });
  if (!verifyRes.ok) {
    const data: Record<string, unknown> = await verifyRes.json().catch(() => ({}));
    throw new LoginError(verifyRes.status, data);
  }
}
`;
}

function navbarWrapperTsx() {
  return `'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { logout, clearUser, getStoredUser } from '@/lib/auth';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: {
    home: string;
    account: string;
    signOut: string;
  };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(getStoredUser()?.displayName ?? null);

    const handler = (e: Event) => {
      setDisplayName(
        (e as CustomEvent<{ displayName: string | null }>).detail.displayName,
      );
    };
    window.addEventListener('app-auth', handler);
    return () => window.removeEventListener('app-auth', handler);
  }, []);

  const handleSignOut = async () => {
    await logout();
    clearUser();
    router.push('/auth');
  };

  const accountItem: MenuItem = displayName
    ? {
        label: displayName,
        children: [
          { label: labels.account, href: '/account' },
          { label: labels.signOut, onClick: handleSignOut },
        ],
      }
    : { label: labels.account, href: '/account' };

  const items: MenuItem[] = [{ label: labels.home, href: '/' }, accountItem];

  return (
    <Navbar
      logo={logo}
      items={items}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
`;
}

function footerTsx(name) {
  const title = toTitleCase(name);
  return `import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { LocaleSwitcher } from '@repo/ui/core-elements/locale-switcher';
import { routing } from '@repo/i18n/routing';
import './footer.css';

export async function Footer() {
  const [t, locale] = await Promise.all([
    getTranslations('Footer'),
    getLocale(),
  ]);

  const appLinks = [
    { label: t('home'), href: '/' },
    { label: t('account'), href: '/account' },
  ];

  const legalLinks = [
    { label: t('privacyPolicy'), href: '/privacy-policy' },
    { label: t('terms'), href: '/terms' },
    { label: t('userData'), href: '/user-data' },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <Container paddingX={10}>
        <Grid container spacing={4}>
          {/* Column 1 – Brand */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Image
                src="/logo-navbar.png"
                alt="${title}"
                width={140}
                height={44}
                className="footer__logo"
              />
              <Typography as="span" variant="h5" fontWeight={700}>
                ${title}
              </Typography>
              <Box
                display="flex"
                alignItems="center"
                gap="12px"
                flexWrap="wrap"
              >
                <ThemeSwitch />
                <LocaleSwitcher
                  locales={routing.locales}
                  currentLocale={locale}
                />
              </Box>
            </Box>
          </Grid>

          {/* Column 2 – App */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('appHeading')}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {appLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">
                    {link.label}
                  </Link>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Column 3 – Legal */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('legalHeading')}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {legalLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">
                    {link.label}
                  </Link>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>

        {/* Bottom bar */}
        <Box className="footer__bottom">
          <Typography
            as="p"
            variant="body-sm"
            textAlign="center"
            className="footer__description"
          >
            {t('copyright', { year: currentYear })}
          </Typography>
        </Box>
      </Container>
    </footer>
  );
}
`;
}

function footerCss() {
  return `.footer {
  width: 100%;
  background: var(--background);
  border-top: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent);
  padding-top: 56px;
}

.footer__logo {
  object-fit: contain;
  object-position: left center;
}

.footer__description {
  color: color-mix(in srgb, var(--foreground) 60%, transparent);
  line-height: 1.6;
  overflow-wrap: break-word;
}

.footer__col-heading {
  margin-bottom: 20px;
}

.footer__link {
  font-size: 14px;
  color: color-mix(in srgb, var(--foreground) 65%, transparent);
  text-decoration: none;
  transition: color 0.2s ease;
  width: fit-content;
}

.footer__link:hover {
  color: var(--accent);
}

.footer__bottom {
  border-top: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent);
  padding: 20px 0;
  margin-top: 40px;
}

@media (max-width: 599px) {
  .footer {
    padding-top: 40px;
  }
}
`;
}

function authFormCss() {
  return `.auth-form__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-form__tabs {
  display: flex;
  border-bottom: 1px solid var(--border, #e5e7eb);
  margin-bottom: 4px;
}

.auth-form__tab-btn {
  flex: 1;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 400;
  color: var(--muted-foreground, #6b7280);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: -1px;
}

.auth-form__tab-btn[data-active='true'] {
  font-weight: 600;
  color: var(--foreground);
  border-bottom-color: var(--foreground);
}

.auth-form__error {
  color: var(--error, #ef4444);
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--error-bg, rgba(239, 68, 68, 0.08));
}

.auth-form__divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted-foreground, #6b7280);
  font-size: 13px;
}

.auth-form__divider::before,
.auth-form__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border, #e5e7eb);
}

.auth-form__passkey-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1.5px solid var(--border, #e5e7eb);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  padding: 0;
}

.auth-form__passkey-icon-btn:hover:not(:disabled) {
  background: var(--surface-2, #f3f4f6);
}

.auth-form__passkey-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.auth-form__success {
  color: var(--success, #22c55e);
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--success-bg, rgba(34, 197, 94, 0.08));
  text-align: center;
}
`;
}

function authFormTsx() {
  return `'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { LinkButton } from '@repo/ui/core-elements/link-button';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import { Switch } from '@repo/ui/core-elements/switch';
import './auth-form.css';
import {
  login,
  LoginError,
  signUp,
  requestPasswordReset,
  ApiError,
  loginWithPasskey,
  registerPasskey,
  getPasskeyCredentials,
  getProfile,
  storeUser,
} from '@/lib/auth';

const REMEMBERED_EMAIL_KEY = 'auth_remembered_email';
const REMEMBER_EMAIL_PREF_KEY = 'auth_remember_email';

type Tab = 'sign-in' | 'sign-up' | 'reset-password';

function ErrorMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" role="alert" className="auth-form__error">
      {message}
    </Typography>
  );
}

// ── Sign-in tab ───────────────────────────────────────────────────────────────

function SignInTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyPrompt, setPasskeyPrompt] = useState(false);
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    const pref = localStorage.getItem(REMEMBER_EMAIL_PREF_KEY) === 'true';
    setRememberEmail(pref);
    if (pref) {
      const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
      if (saved) setEmail(saved);
    }
  }, []);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, value);
  }

  function handleRememberEmailChange(checked: boolean) {
    setRememberEmail(checked);
    localStorage.setItem(REMEMBER_EMAIL_PREF_KEY, String(checked));
    if (checked) {
      if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ email, password });
      storeUser(await getProfile());

      const { count } = await getPasskeyCredentials();
      if (count === 0) {
        setPasskeyPrompt(true);
        setLoading(false);
        return;
      }

      router.push('/');
    } catch (err) {
      if (err instanceof LoginError && err.status === 401) {
        setError(t('signIn.errorInvalidCredentials'));
      } else {
        setError(t('signIn.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeySignIn() {
    if (!email) {
      setError(t('signIn.errorEmailRequired'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await loginWithPasskey(email);
      storeUser(await getProfile());
      router.push('/');
    } catch (err) {
      if (err instanceof LoginError) {
        setError(t('signIn.errorPasskeyFailed'));
      } else {
        setError(t('signIn.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterPasskey() {
    setError(null);
    setLoading(true);
    try {
      await registerPasskey();
      setPasskeySuccess(true);
      setTimeout(() => router.push('/'), 1500);
    } catch {
      setError(t('passkey.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  if (passkeyPrompt) {
    return (
      <Box display="flex" flexDirection="column" gap={16} alignItems="center">
        <Typography variant="body-sm" fontWeight={600}>
          {t('passkey.promptTitle')}
        </Typography>
        <Typography variant="caption" styles={{ textAlign: 'center' }}>
          {t('passkey.promptDescription')}
        </Typography>
        {passkeySuccess && (
          <Typography variant="caption" className="auth-form__success">
            {t('passkey.successMessage')}
          </Typography>
        )}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar />}
        {!passkeySuccess && (
          <>
            <Button
              text={t('passkey.registerButton')}
              type="button"
              onClick={handleRegisterPasskey}
              size="md"
              width="100%"
              kind="success"
            />
            <LinkButton
              onClick={() => router.push('/')}
              label={t('passkey.skipButton')}
            />
          </>
        )}
      </Box>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form__form">
      <TextInput
        label={t('signIn.emailLabel')}
        type="email"
        value={email}
        onChange={handleEmailChange}
        required
        autoComplete="email"
      />
      <TextInput
        label={t('signIn.passwordLabel')}
        type="password"
        value={password}
        onChange={setPassword}
        required
        autoComplete="current-password"
      />
      <Box display="flex" alignItems="center" gap={8}>
        <Switch checked={rememberEmail} onChange={handleRememberEmailChange} />
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t('signIn.rememberEmail')}
        </Typography>
      </Box>
      {error && <ErrorMessage message={error} />}
      {loading && <ProgressBar label={t('signIn.submitting')} />}
      <Button
        text={loading ? t('signIn.submitting') : t('signIn.submitButton')}
        type="submit"
        size="md"
        width="100%"
        marginTop={4}
        kind={email && password ? 'success' : undefined}
        disabled={!email || !password}
      />
      <Typography variant="none" className="auth-form__divider">
        {t('signIn.orDivider')}
      </Typography>
      <Box display="flex" justifyContent="center" gap={12}>
        <Button
          unstyled
          type="button"
          onClick={handlePasskeySignIn}
          disabled={!email}
          className="auth-form__passkey-icon-btn"
          aria-label={t('signIn.passkeyButton')}
          title={t('signIn.passkeyButton')}
        >
          <Image src="/icons/fingerprint.svg" width={28} height={28} alt="" />
        </Button>
      </Box>
      <Box display="flex" flexDirection="column" gap={8} alignItems="center">
        <LinkButton
          onClick={() => switchTab('reset-password')}
          label={t('signIn.forgotPassword')}
        />
        <LinkButton
          onClick={() => switchTab('sign-up')}
          label={t('signIn.noAccount')}
        />
      </Box>
    </form>
  );
}

// ── Sign-up tab ───────────────────────────────────────────────────────────────

function SignUpTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== password2) {
      setError(t('signUp.errorPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await signUp({
        email,
        password,
        password2,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      });
      setSuccess(t('signUp.successDetail'));
    } catch (err) {
      if (err instanceof ApiError) {
        const emailErr = (err.data as Record<string, string[]>)?.email;
        if (emailErr) {
          setError(
            Array.isArray(emailErr)
              ? (emailErr[0] ?? t('signUp.errorGeneric'))
              : String(emailErr),
          );
        } else {
          setError(t('signUp.errorGeneric'));
        }
      } else {
        setError(t('signUp.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        gap={16}
        alignItems="center"
        styles={{ textAlign: 'center' }}
      >
        <Typography variant="body-sm">{success}</Typography>
        <LinkButton
          onClick={() => switchTab('sign-in')}
          label={t('signUp.haveAccount')}
        />
      </Box>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form__form">
      <Box display="flex" gap={12}>
        <TextInput
          label={t('signUp.firstNameLabel')}
          type="text"
          value={firstName}
          onChange={setFirstName}
          autoComplete="given-name"
        />
        <TextInput
          label={t('signUp.lastNameLabel')}
          type="text"
          value={lastName}
          onChange={setLastName}
          autoComplete="family-name"
        />
      </Box>
      <TextInput
        label={t('signUp.emailLabel')}
        type="email"
        value={email}
        onChange={setEmail}
        required
        autoComplete="email"
      />
      <TextInput
        label={t('signUp.passwordLabel')}
        type="password"
        value={password}
        onChange={setPassword}
        required
        autoComplete="new-password"
      />
      <TextInput
        label={t('signUp.confirmPasswordLabel')}
        type="password"
        value={password2}
        onChange={setPassword2}
        required
        autoComplete="new-password"
      />
      {error && <ErrorMessage message={error} />}
      {loading && <ProgressBar label={t('signUp.submitting')} />}
      <Button
        text={loading ? t('signUp.submitting') : t('signUp.submitButton')}
        type="submit"
        size="md"
        width="100%"
        marginTop={4}
        kind={
          email && password && password2 && password === password2
            ? 'success'
            : undefined
        }
        disabled={!email || !password || !password2 || password !== password2}
      />
      <Box display="flex" flexDirection="column" gap={8} alignItems="center">
        <LinkButton
          onClick={() => switchTab('sign-in')}
          label={t('signUp.haveAccount')}
        />
        <LinkButton
          onClick={() => switchTab('reset-password')}
          label={t('signUp.forgotPassword')}
        />
      </Box>
    </form>
  );
}

// ── Reset-password tab ────────────────────────────────────────────────────────

function ResetPasswordTab({ switchTab }: { switchTab: (tab: Tab) => void }) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSuccess(t('resetPassword.successDetail'));
    } catch {
      setError(t('resetPassword.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {success ? (
        <Box display="flex" flexDirection="column" gap={16}>
          <Typography variant="body-sm">{success}</Typography>
          <LinkButton
            onClick={() => switchTab('sign-in')}
            label={t('resetPassword.backToSignIn')}
          />
        </Box>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form__form">
          <TextInput
            label={t('resetPassword.emailLabel')}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          {error && <ErrorMessage message={error} />}
          {loading && <ProgressBar label={t('resetPassword.submitting')} />}
          <Button
            text={
              loading
                ? t('resetPassword.submitting')
                : t('resetPassword.submitButton')
            }
            type="submit"
            size="md"
            width="100%"
            marginTop={4}
            kind={email ? 'success' : undefined}
            disabled={!email}
          />
          <Box display="flex" justifyContent="center">
            <LinkButton
              onClick={() => switchTab('sign-in')}
              label={t('resetPassword.backToSignIn')}
            />
          </Box>
        </form>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AuthForm() {
  const t = useTranslations('AuthPage');
  const [tab, setTab] = useState<Tab>('sign-in');

  const tabHeadings: Record<Tab, { title: string; subtitle: string }> = {
    'sign-in': { title: t('signIn.title'), subtitle: t('signIn.subtitle') },
    'sign-up': { title: t('signUp.title'), subtitle: t('signUp.subtitle') },
    'reset-password': {
      title: t('resetPassword.title'),
      subtitle: t('resetPassword.subtitle'),
    },
  };

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'sign-up' || hash === 'reset-password') {
        setTab(hash);
      } else {
        setTab('sign-in');
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  const switchTab = (newTab: Tab) => {
    window.location.hash = newTab;
    setTab(newTab);
  };

  const tabLabels: Record<Tab, string> = {
    'sign-in': t('tabSignIn'),
    'sign-up': t('tabSignUp'),
    'reset-password': t('tabReset'),
  };

  const { title, subtitle } = tabHeadings[tab];

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
      paddingTop={16}
      paddingX={10}
    >
      <Box width="100%" maxWidth={420} marginBottom={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {title}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {subtitle}
        </Typography>
      </Box>
      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        <Box className="auth-form__tabs">
          {(['sign-in', 'sign-up', 'reset-password'] as Tab[]).map((id) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              data-active={String(tab === id)}
              className="auth-form__tab-btn"
            >
              {tabLabels[id]}
            </button>
          ))}
        </Box>

        {tab === 'sign-in' && <SignInTab switchTab={switchTab} />}
        {tab === 'sign-up' && <SignUpTab switchTab={switchTab} />}
        {tab === 'reset-password' && <ResetPasswordTab switchTab={switchTab} />}
      </Box>
    </Container>
  );
}
`;
}

function authPageTsx() {
  return `import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from './auth-form';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NavbarSpacer />
      <AuthForm />
    </>
  );
}
`;
}

function verifyEmailPageTsx() {
  return `import { setRequestLocale } from 'next-intl/server';
import { VerifyEmailClient } from './verify-email-client';

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <VerifyEmailClient token={token} />;
}
`;
}

function verifyEmailClientTsx() {
  return `'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import { verifyEmail, ApiError } from '@/lib/auth';

type Status = 'loading' | 'success' | 'expired' | 'invalid';

const REDIRECT_SECONDS = 3;

interface Props {
  token: string;
}

export function VerifyEmailClient({ token }: Props) {
  const t = useTranslations('VerifyEmailPage');
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        if (err instanceof ApiError) {
          const detail = String((err.data as Record<string, unknown>).detail ?? '');
          if (detail.toLowerCase().includes('expired')) {
            setStatus('expired');
          } else {
            setStatus('invalid');
          }
        } else {
          setStatus('invalid');
        }
      });
  }, [token]);

  useEffect(() => {
    if (status !== 'success') return;

    if (countdown === 0) {
      router.push('/');
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, router]);

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      paddingX={10}
    >
      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {status === 'loading' && (
          <Box display="flex" flexDirection="column" gap={16}>
            <ProgressBar label={t('loading')} />
            <Typography
              variant="body-sm"
              color="var(--muted-foreground, #6b7280)"
              textAlign="center"
            >
              {t('loading')}
            </Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5">{t('successTitle')}</Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('successDetail')}
            </Typography>
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t('redirecting', { seconds: countdown })}
            </Typography>
            <ProgressBar
              value={((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}
              label={t('redirectProgress')}
            />
          </Box>
        )}

        {status === 'expired' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t('expiredTitle')}
            </Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('expiredDetail')}
            </Typography>
          </Box>
        )}

        {status === 'invalid' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t('invalidTitle')}
            </Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('invalidDetail')}
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
`;
}

// ── Auth API Route Handlers ───────────────────────────────────────────

function apiAuthLoginRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/login/\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieStore = await cookies();
  cookieStore.set('access_token', data.access as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  });
  cookieStore.set('refresh_token', data.refresh as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
`;
}

function apiAuthLogoutRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  cookieStore.delete('refresh_token');
  return NextResponse.json({ ok: true });
}
`;
}

function apiAuthSignupRouteTs() {
  return `import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/signup/\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiAuthProfileRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(\`\${process.env.API_URL}/api/auth/profile/\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/profile/\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiAuthProfilePictureRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/profile/picture/\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiAuthChangePasswordRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/change-password/\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiAuthPasswordResetRouteTs() {
  return `import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/password-reset/\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiAuthVerifyEmailRouteTs() {
  return `import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(\`\${process.env.API_URL}/api/auth/verify-email/\${token}/\`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiPasskeyRegisterOptionsRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const res = await fetch(\`\${process.env.API_URL}/api/auth/passkey/register/options/\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`,
    },
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiPasskeyRegisterVerifyRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/passkey/register/verify/\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiPasskeyAuthOptionsRouteTs() {
  return `import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/passkey/authenticate/options/\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
`;
}

function apiPasskeyAuthVerifyRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(\`\${process.env.API_URL}/api/auth/passkey/authenticate/verify/\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieStore = await cookies();
  cookieStore.set('access_token', data.access as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  });
  cookieStore.set('refresh_token', data.refresh as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
`;
}

function apiPasskeyCredentialsRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ count: 0, credentials: [] });

  const res = await fetch(\`\${process.env.API_URL}/api/auth/passkey/credentials/\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });

  if (!res.ok) return NextResponse.json({ count: 0, credentials: [] });
  const data: unknown = await res.json();
  return NextResponse.json(data);
}
`;
}

function apiPasskeyCredentialByIdRouteTs() {
  return `import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const res = await fetch(
    \`\${process.env.API_URL}/api/auth/passkey/credentials/\${id}/\`,
    { method: 'DELETE', headers: { Authorization: \`Bearer \${token}\` } },
  );

  return new NextResponse(null, { status: res.status });
}
`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  New App Scaffold\n');

  const { rl, prompt } = createPrompt();

  // App name
  let name = '';
  while (true) {
    name = await prompt('  App name');
    const error = validateAppName(name);
    if (!error) break;
    console.log(`  Error: ${error}`);
  }

  // Port
  let port = 3001;
  while (true) {
    const portInput = await prompt('  Port', '3001');
    const parsed = parseInt(portInput, 10);
    if (!isNaN(parsed) && parsed >= 1024 && parsed <= 65535) {
      port = parsed;
      break;
    }
    console.log('  Error: Port must be a number between 1024 and 65535.');
  }

  // i18n
  const i18nInput = await prompt('  Include i18n (next-intl)? [y/n]', 'y');
  const includeI18n = i18nInput.toLowerCase().startsWith('y');

  // PWA
  const pwaInput = await prompt('  Include PWA (serwist)? [y/n]', 'y');
  const includePwa = pwaInput.toLowerCase().startsWith('y');

  // Auth
  const authInput = await prompt('  Include auth (navbar, footer, sign-in/up pages, API routes)? [y/n]', 'y');
  const includeAuth = authInput.toLowerCase().startsWith('y');

  // Palette
  let palette = 'cyan';
  while (true) {
    const paletteInput = await prompt(
      `  Palette [${VALID_PALETTES.join(', ')}]`,
      'cyan',
    );
    if (VALID_PALETTES.includes(paletteInput)) {
      palette = paletteInput;
      break;
    }
    console.log(`  Error: Must be one of: ${VALID_PALETTES.join(', ')}`);
  }

  // Docker registry user
  const registryUser = await prompt('  Docker registry user', 'docker');

  rl.close();

  // Build
  const appDir = join(APPS_DIR, name);
  const appPath = (rel) => join(appDir, rel);

  console.log(`\n  Creating apps/${name}...\n`);

  // Static files (always created)
  writeFile(
    appPath('package.json'),
    packageJson(name, port, includeI18n, includePwa, includeAuth),
  );
  writeFile(appPath('next.config.js'), nextConfig(includeI18n, includePwa));
  writeFile(appPath('tsconfig.json'), tsConfig(includePwa));
  writeFile(appPath('eslint.config.js'), eslintConfig());
  writeFile(appPath('.gitignore'), gitignore(includePwa));
  writeFile(appPath('.dockerignore'), dockerignore());
  writeFile(appPath('app/globals.css'), globalsCss());
  writeFile(appPath('css.d.ts'), cssDts());

  // Create public directory structure
  writeFile(appPath('public/icons/.gitkeep'), '');

  if (includeI18n) {
    // i18n variant: files go under app/[locale]/
    writeFile(
      appPath('app/[locale]/layout.tsx'),
      layoutTsx(name, palette, true, includePwa, includeAuth),
    );
    writeFile(appPath('app/[locale]/page.tsx'), pageTsx(name, true));
    writeFile(appPath('proxy.ts'), proxyTs(includeAuth));
    writeFile(appPath('i18n/request.ts'), i18nRequestTs());
    writeFile(appPath('global.d.ts'), globalDts());
    writeFile(appPath('messages/de.json'), messagesJson('de', name, includeAuth));
    writeFile(appPath('messages/en.json'), messagesJson('en', name, includeAuth));
    writeFile(appPath('messages/es.json'), messagesJson('es', name, includeAuth));
    writeFile(appPath('messages/fr.json'), messagesJson('fr', name, includeAuth));
    writeFile(appPath('messages/pt.json'), messagesJson('pt', name, includeAuth));

    if (includePwa) {
      writeFile(appPath('app/[locale]/~offline/page.tsx'), offlinePageTsx());
    }

    if (includeAuth) {
      writeFile(appPath('lib/auth.ts'), libAuthTs());
      writeFile(appPath('app/[locale]/navbar-wrapper.tsx'), navbarWrapperTsx());
      writeFile(appPath('app/[locale]/footer.tsx'), footerTsx(name));
      writeFile(appPath('app/[locale]/footer.css'), footerCss());
      writeFile(appPath('app/[locale]/(auth)/auth/page.tsx'), authPageTsx());
      writeFile(appPath('app/[locale]/(auth)/auth/auth-form.tsx'), authFormTsx());
      writeFile(appPath('app/[locale]/(auth)/auth/auth-form.css'), authFormCss());
      writeFile(appPath('app/[locale]/(auth)/verify-email/[token]/page.tsx'), verifyEmailPageTsx());
      writeFile(appPath('app/[locale]/(auth)/verify-email/[token]/verify-email-client.tsx'), verifyEmailClientTsx());
      writeFile(appPath('app/api/auth/login/route.ts'), apiAuthLoginRouteTs());
      writeFile(appPath('app/api/auth/logout/route.ts'), apiAuthLogoutRouteTs());
      writeFile(appPath('app/api/auth/signup/route.ts'), apiAuthSignupRouteTs());
      writeFile(appPath('app/api/auth/profile/route.ts'), apiAuthProfileRouteTs());
      writeFile(appPath('app/api/auth/profile/picture/route.ts'), apiAuthProfilePictureRouteTs());
      writeFile(appPath('app/api/auth/change-password/route.ts'), apiAuthChangePasswordRouteTs());
      writeFile(appPath('app/api/auth/password-reset/route.ts'), apiAuthPasswordResetRouteTs());
      writeFile(appPath('app/api/auth/verify-email/[token]/route.ts'), apiAuthVerifyEmailRouteTs());
      writeFile(appPath('app/api/auth/passkey/register/options/route.ts'), apiPasskeyRegisterOptionsRouteTs());
      writeFile(appPath('app/api/auth/passkey/register/verify/route.ts'), apiPasskeyRegisterVerifyRouteTs());
      writeFile(appPath('app/api/auth/passkey/authenticate/options/route.ts'), apiPasskeyAuthOptionsRouteTs());
      writeFile(appPath('app/api/auth/passkey/authenticate/verify/route.ts'), apiPasskeyAuthVerifyRouteTs());
      writeFile(appPath('app/api/auth/passkey/credentials/route.ts'), apiPasskeyCredentialsRouteTs());
      writeFile(appPath('app/api/auth/passkey/credentials/[id]/route.ts'), apiPasskeyCredentialByIdRouteTs());
    }
  } else {
    // No i18n: files go directly under app/
    writeFile(
      appPath('app/layout.tsx'),
      layoutTsx(name, palette, false, includePwa, includeAuth),
    );
    writeFile(appPath('app/page.tsx'), pageTsx(name, false));

    if (includePwa) {
      writeFile(appPath('app/~offline/page.tsx'), offlinePageTsx());
    }
  }

  // PWA files
  if (includePwa) {
    writeFile(appPath('app/manifest.ts'), manifestTs(name));
    writeFile(appPath('app/sw.ts'), swTs());
    writeFile(appPath('public/icons/splash/.gitkeep'), '');
  }

  // Logger
  writeFile(appPath('lib/logger.ts'), loggerTs(name));

  // Deployment files
  writeFile(appPath('Dockerfile'), dockerfile(name));
  writeFile(appPath('env.example'), envExample(name, registryUser, includeAuth));

  // Helm chart
  writeFile(appPath('helm/Chart.yaml'), helmChartYaml(name));
  writeFile(appPath('helm/values.yaml'), helmValuesYaml(name, registryUser, includeAuth));
  writeFile(appPath('helm/templates/_helpers.tpl'), helmHelpersTpl(name));
  writeFile(
    appPath('helm/templates/deployment.yaml'),
    helmDeploymentYaml(name),
  );
  writeFile(appPath('helm/templates/service.yaml'), helmServiceYaml(name));
  writeFile(appPath('helm/templates/ingress.yaml'), helmIngressYaml(name));
  writeFile(appPath('helm/templates/pvc.yaml'), helmPvcYaml(name));
  writeFile(appPath('helm/templates/NOTES.txt'), helmNotesTxt(name));

  console.log(`  Done! Created apps/${name} with the following setup:`);
  console.log(`    Port:     ${port}`);
  console.log(`    i18n:     ${includeI18n ? 'yes' : 'no'}`);
  console.log(`    PWA:      ${includePwa ? 'yes (serwist)' : 'no'}`);
  console.log(`    Auth:     ${includeAuth ? 'yes (navbar, footer, auth pages, API routes)' : 'no'}`);
  console.log(`    Palette:  ${palette}`);
  console.log(`    Registry: ${registryUser}/${name}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. pnpm install');
  console.log(`    2. pnpm --filter ${name} dev`);
  console.log(`    3. cp apps/${name}/env.example apps/${name}/.env`);
  console.log(
    `    4. Update the .env file with your Docker registry credentials`,
  );
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
