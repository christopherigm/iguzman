import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const APPS_DIR = join(ROOT, 'apps');

// ── Prompting ─────────────────────────────────────────────────────────

export function createPrompt(options = {}) {
  const { defaultYes = false } = options;

  if (defaultYes) {
    const rl = { close: () => {} };

    function prompt(_question, defaultValue) {
      return Promise.resolve(defaultValue || '');
    }

    return { rl, prompt };
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  function prompt(question, defaultValue) {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    return new Promise((resolve) => {
      rl.question(`${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  }

  return { rl, prompt };
}

// ── Command Execution ─────────────────────────────────────────────────

export function runCommand(command, description) {
  console.log(`\n  ${description}...\n`);
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
    console.log(`\n  ✓ ${description} completed\n`);
  } catch (error) {
    console.error(`\n  ✗ ${description} failed\n`);
    process.exit(1);
  }
}

// ── App Helpers ───────────────────────────────────────────────────────

export function resolveApp(appName, usage) {
  if (!appName) {
    console.error(`\n  Usage: ${usage}\n`);
    process.exit(1);
  }

  const appDir = join(APPS_DIR, appName);

  if (!existsSync(appDir)) {
    console.error(
      `\n  Error: App "${appName}" not found at apps/${appName}/\n`,
    );
    process.exit(1);
  }

  return appDir;
}

export function readAppVersion(appDir) {
  const pkgPath = join(appDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

// ── Env File ──────────────────────────────────────────────────────────

export function readEnvFile(envPath) {
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return env;
}
