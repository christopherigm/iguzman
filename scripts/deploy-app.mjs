import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveApp,
  readAppVersion,
  runCommand,
  createPrompt,
} from './utils.mjs';

// ── Helpers ────────────────────────────────────────────────────────────

function bumpVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }
  parts[2] = String(parseInt(parts[2], 10) + 1);
  return parts.join('.');
}

function updateAppVersion(appDir) {
  const pkgPath = join(appDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion);

  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  const manifestPath = join(appDir, 'public', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifest.version = newVersion;
    writeFileSync(
      manifestPath,
      JSON.stringify(manifest, null, 2) + '\n',
      'utf-8',
    );
  }

  return { oldVersion, newVersion };
}

// ── Main ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const yesIndex = rawArgs.indexOf('-y');
const autoYes = yesIndex !== -1;
if (autoYes) rawArgs.splice(yesIndex, 1);

const appName = rawArgs[0];
const appDir = resolveApp(appName, 'pnpm deployment <app-name>');

const pkgPath = join(appDir, 'package.json');
if (!existsSync(pkgPath)) {
  console.error(
    `\n  Error: package.json not found at apps/${appName}/package.json\n`,
  );
  process.exit(1);
}

console.log(`\n  Starting deployment workflow for "${appName}"\n`);
console.log('  ═══════════════════════════════════════════════════════════\n');

// Step 1: Bump version
console.log('  [1/4] Bumping version number');
const { rl, prompt } = createPrompt({ defaultYes: autoYes });
const answer = await prompt('        Bump app version? [y/n]', 'y');
rl.close();

let oldVersion, newVersion;
if (answer.toLowerCase() === 'n') {
  oldVersion = readAppVersion(appDir);
  newVersion = oldVersion;
  console.log(`        Skipping version bump (staying at ${newVersion})\n`);
} else {
  ({ oldVersion, newVersion } = updateAppVersion(appDir));
  console.log(`        ${oldVersion} → ${newVersion}\n`);
}

// Step 2: Build Next.js app
console.log('  [2/4] Building Next.js application');
runCommand(`pnpm build --filter=${appName}`, 'Building Next.js app');

// Step 3: Build Docker image
console.log('  [3/4] Building Docker image');
runCommand(
  `pnpm docker ${appName}${autoYes ? ' -y' : ''}`,
  'Building Docker image',
);

// Step 4: Deploy with Helm
console.log('  [4/4] Deploying with Helm');
runCommand(
  `pnpm helm ${appName}${autoYes ? ' -y' : ''}`,
  'Deploying with Helm',
);

console.log('  ═══════════════════════════════════════════════════════════');
console.log(`\n  ✓ Deployment workflow completed successfully!`);
console.log(`    App:     ${appName}`);
console.log(`    Version: ${newVersion}\n`);
