import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPS_DIR = join(ROOT, 'apps');

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

  return { oldVersion, newVersion };
}

function runCommand(command, description) {
  console.log(`\n  ${description}...\n`);
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
    console.log(`\n  ✓ ${description} completed\n`);
  } catch (error) {
    console.error(`\n  ✗ ${description} failed\n`);
    process.exit(1);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

const appName = process.argv[2];

if (!appName) {
  console.error('\n  Usage: pnpm deployment <app-name>\n');
  process.exit(1);
}

const appDir = join(APPS_DIR, appName);

if (!existsSync(appDir)) {
  console.error(`\n  Error: App "${appName}" not found at apps/${appName}/\n`);
  process.exit(1);
}

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
const { oldVersion, newVersion } = updateAppVersion(appDir);
console.log(`        ${oldVersion} → ${newVersion}\n`);

// Step 2: Build Next.js app
console.log('  [2/4] Building Next.js application');
runCommand(`pnpm build --filter=${appName}`, 'Building Next.js app');

// Step 3: Build Docker image
console.log('  [3/4] Building Docker image');
runCommand(`pnpm docker ${appName}`, 'Building Docker image');

// Step 4: Deploy with Helm
console.log('  [4/4] Deploying with Helm');
runCommand(`pnpm helm ${appName}`, 'Deploying with Helm');

console.log('  ═══════════════════════════════════════════════════════════');
console.log(`\n  ✓ Deployment workflow completed successfully!`);
console.log(`    App:     ${appName}`);
console.log(`    Version: ${newVersion}\n`);
