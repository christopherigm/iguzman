import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPS_DIR = join(ROOT, 'apps');
const ENV_FILE = join(ROOT, '.env');

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

function readAppVersion(appDir) {
  const pkgPath = join(appDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function readDockerRegistry() {
  if (!existsSync(ENV_FILE)) {
    console.error('\n  Error: .env file not found at project root\n');
    process.exit(1);
  }

  const content = readFileSync(ENV_FILE, 'utf-8');
  const match = content.match(/^DOCKER_REGISTRY=(.+)$/m);

  if (!match || !match[1].trim()) {
    console.error('\n  Error: DOCKER_REGISTRY not found in .env file\n');
    process.exit(1);
  }

  return match[1].trim();
}

// ── Main ───────────────────────────────────────────────────────────────

const appName = process.argv[2];

if (!appName) {
  console.error('\n  Usage: pnpm docker <app-name>\n');
  process.exit(1);
}

const appDir = join(APPS_DIR, appName);
const dockerfile = join(appDir, 'Dockerfile');

if (!existsSync(appDir)) {
  console.error(`\n  Error: App "${appName}" not found at apps/${appName}/\n`);
  process.exit(1);
}

if (!existsSync(dockerfile)) {
  console.error(
    `\n  Error: No Dockerfile found at apps/${appName}/Dockerfile\n`,
  );
  process.exit(1);
}

console.log(`\n  Building Docker image for "${appName}"...\n`);

try {
  execSync(
    `docker build -f apps/${appName}/Dockerfile -t ${appName}:latest .`,
    { cwd: ROOT, stdio: 'inherit' },
  );
  console.log(`\n  Done! Image tagged as ${appName}:latest\n`);
} catch {
  process.exit(1);
}

// ── Tag & Publish ──────────────────────────────────────────────────────

const defaultVersion = readAppVersion(appDir);

const tag = await prompt('  Tag of the new docker image', defaultVersion);

execSync(`docker tag ${appName}:latest ${appName}:${tag}`, {
  cwd: ROOT,
  stdio: 'inherit',
});
console.log(`  Tagged ${appName}:${tag}\n`);

const publishInput = await prompt('  Do you want to publish it? [y/n]', 'y');

if (publishInput.toLowerCase().startsWith('y')) {
  const registry = readDockerRegistry();
  const remoteImage = `${registry}/${appName}:${tag}`;

  execSync(`docker tag ${appName}:${tag} ${remoteImage}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log(`\n  Pushing ${remoteImage}...\n`);

  execSync(`docker push ${remoteImage}`, { cwd: ROOT, stdio: 'inherit' });

  console.log(`\n  Published ${remoteImage}\n`);
}

rl.close();
