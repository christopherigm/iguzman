import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveApp,
  readAppVersion,
  readEnvFile,
  createPrompt,
  ROOT,
} from './utils.mjs';

// ── Main ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const yesIndex = rawArgs.indexOf('-y');
const autoYes = yesIndex !== -1;
if (autoYes) rawArgs.splice(yesIndex, 1);

const appName = rawArgs[0];
const appDir = resolveApp(appName, 'pnpm docker <app-name>');

const dockerfile = join(appDir, 'Dockerfile');

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
const { rl, prompt } = createPrompt({ defaultYes: autoYes });

const tag = await prompt('  Tag of the new docker image', defaultVersion);

execSync(`docker tag ${appName}:latest ${appName}:${tag}`, {
  cwd: ROOT,
  stdio: 'inherit',
});
console.log(`  Tagged ${appName}:${tag}\n`);

const publishInput = await prompt('  Do you want to publish it? [y/n]', 'y');

if (publishInput.toLowerCase().startsWith('y')) {
  const envPath = join(appDir, '.env');
  const env = readEnvFile(envPath);

  if (!env.DOCKER_REGISTRY) {
    console.error('\n  Error: DOCKER_REGISTRY not found in .env file\n');
    rl.close();
    process.exit(1);
  }

  const remoteImage = `${env.DOCKER_REGISTRY}/${appName}:${tag}`;

  execSync(`docker tag ${appName}:${tag} ${remoteImage}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log(`\n  Pushing ${remoteImage}...\n`);

  execSync(`docker push ${remoteImage}`, { cwd: ROOT, stdio: 'inherit' });

  console.log(`\n  Published ${remoteImage}\n`);
}

rl.close();
