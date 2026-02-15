import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPS_DIR = join(ROOT, 'apps');
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

// ── Helpers ────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

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

function packageJson(name, port, includeI18n) {
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
      '@repo/ui': 'workspace:*',
      react: '^19.2.0',
      'react-dom': '^19.2.0',
    },
    devDependencies: {
      '@repo/eslint-config': 'workspace:*',
      '@repo/typescript-config': 'workspace:*',
      '@types/node': '^22.15.3',
      '@types/react': '19.2.2',
      '@types/react-dom': '19.2.2',
      eslint: '^9.39.1',
      typescript: '5.9.2',
    },
  };

  if (includeI18n) {
    pkg.dependencies['@repo/i18n'] = 'workspace:^';
    pkg.dependencies['next-intl'] = '^4';
  }

  return JSON.stringify(pkg, null, 2) + '\n';
}

function nextConfig(includeI18n) {
  if (includeI18n) {
    return `import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
`;
  }

  return `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;
}

function tsConfig() {
  return (
    JSON.stringify(
      {
        extends: '@repo/typescript-config/nextjs.json',
        compilerOptions: {
          plugins: [{ name: 'next' }],
          allowArbitraryExtensions: true,
        },
        include: [
          '**/*.ts',
          '**/*.tsx',
          'next-env.d.ts',
          'next.config.js',
          '.next/types/**/*.ts',
        ],
        exclude: ['node_modules'],
      },
      null,
      2,
    ) + '\n'
  );
}

function eslintConfig() {
  return `import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
`;
}

function gitignore() {
  return `# dependencies
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

function layoutTsx(palette, includeI18n) {
  if (includeI18n) {
    return `import type { Metadata } from 'next';
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
          <PaletteProvider palette="${palette}">
            <Navbar
              logo="/logo.png"
              items={[{ label: 'Home', href: '/' }]}
              version="v0.1.0"
            />
            {children}
          </PaletteProvider>
        </ThemeProvider>
      </NextIntlClientProvider>
    </html>
  );
}
`;
  }

  return `import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ThemeProvider, ThemeScript } from '@repo/ui/theme-provider';
import type { ThemeMode, ResolvedTheme } from '@repo/ui/theme-provider';
import { PaletteProvider } from '@repo/ui/palette-provider';
import { Navbar } from '@repo/ui/core-elements/navbar';
import './globals.css';

type Props = {
  children: React.ReactNode;
};

export const metadata: Metadata = {
  title: '${palette}',
  description: '',
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
        <ThemeScript />
      </head>
      <ThemeProvider
        initialMode={initialMode}
        initialResolved={initialResolved}
      >
        <PaletteProvider palette="${palette}">
          <Navbar
            logo="/logo.png"
            items={[{ label: 'Home', href: '/' }]}
            version="v0.1.0"
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
        <ThemeSwitch />
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

function proxyTs() {
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

function messagesJson(lang, name) {
  const title = toTitleCase(name);

  if (lang === 'en') {
    return (
      JSON.stringify(
        {
          Metadata: { title, description: '' },
          HomePage: { title },
        },
        null,
        2,
      ) + '\n'
    );
  }

  return (
    JSON.stringify(
      {
        Metadata: { title, description: '' },
        HomePage: { title },
      },
      null,
      2,
    ) + '\n'
  );
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  New App Scaffold\n');

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

  rl.close();

  // Build
  const appDir = join(APPS_DIR, name);
  const appPath = (rel) => join(appDir, rel);

  console.log(`\n  Creating apps/${name}...\n`);

  // Static files (always created)
  writeFile(appPath('package.json'), packageJson(name, port, includeI18n));
  writeFile(appPath('next.config.js'), nextConfig(includeI18n));
  writeFile(appPath('tsconfig.json'), tsConfig());
  writeFile(appPath('eslint.config.js'), eslintConfig());
  writeFile(appPath('.gitignore'), gitignore());
  writeFile(appPath('app/globals.css'), globalsCss());

  // Create empty public directory
  mkdirSync(appPath('public'), { recursive: true });

  if (includeI18n) {
    // i18n variant: files go under app/[locale]/
    writeFile(appPath('app/[locale]/layout.tsx'), layoutTsx(palette, true));
    writeFile(appPath('app/[locale]/page.tsx'), pageTsx(name, true));
    writeFile(appPath('proxy.ts'), proxyTs());
    writeFile(appPath('i18n/request.ts'), i18nRequestTs());
    writeFile(appPath('global.d.ts'), globalDts());
    writeFile(appPath('messages/en.json'), messagesJson('en', name));
    writeFile(appPath('messages/es.json'), messagesJson('es', name));
  } else {
    // No i18n: files go directly under app/
    writeFile(appPath('app/layout.tsx'), layoutTsx(palette, false));
    writeFile(appPath('app/page.tsx'), pageTsx(name, false));
  }

  console.log(`  Done! Created apps/${name} with the following setup:`);
  console.log(`    Port:    ${port}`);
  console.log(`    i18n:    ${includeI18n ? 'yes' : 'no'}`);
  console.log(`    Palette: ${palette}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. pnpm install');
  console.log(`    2. pnpm --filter ${name} dev`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
