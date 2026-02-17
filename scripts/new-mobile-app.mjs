import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { APPS_DIR, createPrompt } from './utils.mjs';

// ── Update prompt ──────────────────────────────────────────────────────
// Update new-mobile-app.mjs to reflect changes for Expo React Native apps

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

function toPascalCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// ── Template Functions ─────────────────────────────────────────────────

function packageJson(name) {
  const pkg = {
    name,
    version: '0.1.0',
    private: true,
    main: 'expo-router/entry',
    scripts: {
      dev: 'expo start',
      android: 'expo run:android',
      ios: 'expo run:ios',
      web: 'expo start --web',
      build: 'eas build',
      lint: 'eslint --max-warnings 0',
      'check-types': 'tsc --noEmit',
    },
    dependencies: {
      '@expo/metro-runtime': '~6.1.2',
      '@expo/vector-icons': '~15.0.3',
      '@repo/helpers': 'workspace:*',
      expo: '~54.0.33',
      'expo-constants': '~18.0.13',
      'expo-font': '~14.0.11',
      'expo-linking': '~8.0.11',
      'expo-router': '~6.0.23',
      'expo-splash-screen': '~31.0.13',
      'expo-status-bar': '~3.0.9',
      'expo-system-ui': '~6.0.9',
      'expo-web-browser': '15.0.10',
      react: '19.1.0',
      'react-dom': '19.1.0',
      'react-native': '0.81.5',
      'react-native-gesture-handler': '~2.28.0',
      'react-native-reanimated': '~4.1.6',
      'react-native-safe-area-context': '5.6.2',
      'react-native-screens': '~4.16.0',
      'react-native-web': '~0.21.2',
    },
    devDependencies: {
      '@babel/core': '^7.20.0',
      '@repo/typescript-config': 'workspace:*',
      '@types/react': '~19.1.17',
      typescript: '~5.9.3',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

function appJson(name) {
  const title = toTitleCase(name);
  return (
    JSON.stringify(
      {
        expo: {
          name: title,
          slug: name,
          version: '0.1.0',
          orientation: 'portrait',
          icon: './assets/images/icon.png',
          scheme: name,
          userInterfaceStyle: 'automatic',
          newArchEnabled: true,
          ios: {
            supportsTablet: true,
            bundleIdentifier: `com.iguzman.${name.replace(/-/g, '')}`,
          },
          android: {
            adaptiveIcon: {
              foregroundImage: './assets/images/adaptive-icon.png',
              backgroundColor: '#ffffff',
            },
            package: `com.iguzman.${name.replace(/-/g, '')}`,
          },
          web: {
            bundler: 'metro',
            output: 'static',
            favicon: './assets/images/favicon.png',
          },
          plugins: [
            'expo-router',
            'expo-font',
            [
              'expo-splash-screen',
              {
                backgroundColor: '#ffffff',
                image: './assets/images/splash-icon.png',
                imageWidth: 200,
              },
            ],
          ],
          experiments: {
            typedRoutes: true,
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function tsConfig() {
  return (
    JSON.stringify(
      {
        extends: '@repo/typescript-config/expo.json',
        compilerOptions: {
          strict: true,
          paths: {
            '@/*': ['./*'],
          },
        },
        include: [
          '**/*.ts',
          '**/*.tsx',
          '.expo/types/**/*.ts',
          'expo-env.d.ts',
        ],
        exclude: ['node_modules'],
      },
      null,
      2,
    ) + '\n'
  );
}

function metroConfig() {
  return `const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const monorepoRoot = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
`;
}

function babelConfig() {
  return `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
`;
}

function gitignore() {
  return `node_modules/
.expo/
dist/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
ios/
android/

# @generated expo-cli sync-2b81b286409c56c40c2c616caf4c69c3bc45d46a
# The following patterns were generated by expo-cli

# OSX
.DS_Store

# Env
.env*

# Debug
npm-debug.*
yarn-debug.*
yarn-error.*

# @generated expo-cli sync-880ffbff9757297dc765c4cf4c3e7bcb0ecbcd73
# The following patterns were generated by expo-cli

# OSX
.DS_Store

# Env
.env*

# Debug
npm-debug.*
yarn-debug.*
yarn-error.*
expo-env.d.ts
# @end expo-cli
`;
}

// ── App directory (expo-router) ───────────────────────────────────────

function rootLayout(name, palette) {
  const title = toTitleCase(name);
  return `import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
          },
          headerTintColor: colorScheme === 'dark' ? '#fff' : '#000',
          contentStyle: {
            backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
`;
}

function tabsLayout(name, palette) {
  return `import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const activeTint = colorScheme === 'dark' ? '#68c3f7' : '#0a7ea4';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
        },
        headerStyle: {
          backgroundColor: colorScheme === 'dark' ? '#000' : '#fff',
        },
        headerTintColor: colorScheme === 'dark' ? '#fff' : '#000',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="explore" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
`;
}

function homeScreen(name) {
  const title = toTitleCase(name);
  return `import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>${title}</Text>
      <Text style={styles.subtitle}>Welcome to your app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
});
`;
}

function exploreScreen() {
  return `import { StyleSheet, Text, View } from 'react-native';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.subtitle}>Discover new things</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
  },
});
`;
}

function notFoundScreen() {
  return `import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  link: {
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 16,
    color: '#0a7ea4',
  },
});
`;
}

// ── EAS Configuration ─────────────────────────────────────────────────

function easJson() {
  return (
    JSON.stringify(
      {
        cli: {
          version: '>= 14.0.0',
        },
        build: {
          development: {
            developmentClient: true,
            distribution: 'internal',
          },
          preview: {
            distribution: 'internal',
          },
          production: {},
        },
        submit: {
          production: {},
        },
      },
      null,
      2,
    ) + '\n'
  );
}

// ── Env ───────────────────────────────────────────────────────────────

function envExample(name) {
  return `# ${toTitleCase(name)} environment variables
EXPO_PUBLIC_API_URL=http://localhost:3000
`;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  New Mobile App Scaffold (Expo)\n');

  const { rl, prompt } = createPrompt();

  // App name
  let name = '';
  while (true) {
    name = await prompt('  App name');
    const error = validateAppName(name);
    if (!error) break;
    console.log(`  Error: ${error}`);
  }

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

  // Core config files
  writeFile(appPath('package.json'), packageJson(name));
  writeFile(appPath('app.json'), appJson(name));
  writeFile(appPath('tsconfig.json'), tsConfig());
  writeFile(appPath('metro.config.js'), metroConfig());
  writeFile(appPath('babel.config.js'), babelConfig());
  writeFile(appPath('.gitignore'), gitignore());
  writeFile(appPath('eas.json'), easJson());
  writeFile(appPath('env.example'), envExample(name));

  // App directory (expo-router)
  writeFile(appPath('app/_layout.tsx'), rootLayout(name, palette));
  writeFile(appPath('app/(tabs)/_layout.tsx'), tabsLayout(name, palette));
  writeFile(appPath('app/(tabs)/index.tsx'), homeScreen(name));
  writeFile(appPath('app/(tabs)/explore.tsx'), exploreScreen());
  writeFile(appPath('app/+not-found.tsx'), notFoundScreen());

  // Assets (create empty directories)
  mkdirSync(appPath('assets/images'), { recursive: true });
  mkdirSync(appPath('assets/fonts'), { recursive: true });

  // Placeholder assets
  writeFile(
    appPath('assets/images/.gitkeep'),
    '# Add icon.png, splash-icon.png, adaptive-icon.png, favicon.png here\n',
  );

  console.log(`  Done! Created apps/${name} with the following setup:`);
  console.log(`    Type:     Expo (React Native)`);
  console.log(`    Palette:  ${palette}`);
  console.log(`    Router:   expo-router (file-based)`);
  console.log(`    Tabs:     Home, Explore`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. pnpm install');
  console.log(`    2. Add app icons to apps/${name}/assets/images/`);
  console.log(`    3. pnpm --filter ${name} dev`);
  console.log(`    4. cp apps/${name}/env.example apps/${name}/.env`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
