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

// ── Helpers ────────────────────────────────────────────────────────────

function releaseExists(releaseName, namespace) {
  try {
    execSync(`helm status ${releaseName} -n ${namespace}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const yesIndex = rawArgs.indexOf('-y');
const autoYes = yesIndex !== -1;
if (autoYes) rawArgs.splice(yesIndex, 1);

const appName = rawArgs[0];
const appDir = resolveApp(appName, 'pnpm deploy <app-name>');

const helmDir = join(appDir, 'helm');

if (!existsSync(helmDir)) {
  console.error(`\n  Error: No Helm chart found at apps/${appName}/helm/\n`);
  process.exit(1);
}

const envPath = join(appDir, '.env');
const env = readEnvFile(envPath);
const appVersion = readAppVersion(appDir);

console.log(`\n  Deploying "${appName}" via Helm\n`);

// ── Interactive Prompts ────────────────────────────────────────────────

const { rl, prompt } = createPrompt({ defaultYes: autoYes });

const namespace = await prompt(`  Namespace`, env.NAMESPACE || '');

if (!namespace) {
  console.error('\n  Error: Namespace is required\n');
  rl.close();
  process.exit(1);
}

const defaultTag = env.IMAGE_TAG || appVersion;
const imageTag = await prompt('  Image tag', defaultTag);
const replicaCount = await prompt('  Replica count', env.REPLICA_COUNT || '');

// ── Build Helm Command ─────────────────────────────────────────────────

const setFlags = [];

if (imageTag) {
  setFlags.push(`--set image.tag=${imageTag}`);
}
if (replicaCount) {
  setFlags.push(`--set replicaCount=${replicaCount}`);
}

const helmChart = `./apps/${appName}/helm`;
const command = [
  'helm upgrade --install',
  appName,
  helmChart,
  `--namespace ${namespace}`,
  '--create-namespace',
  ...setFlags,
].join(' ');

// ── Summary & Confirmation ─────────────────────────────────────────────

const isUpgrade = releaseExists(appName, namespace);
const action = isUpgrade ? 'Upgrade' : 'Install';

console.log('\n  ── Deployment Summary ──────────────────────────────────');
console.log(`  Action:      ${action}`);
console.log(`  Release:     ${appName}`);
console.log(`  Namespace:   ${namespace}`);
console.log(`  Chart:       ${helmChart}`);
console.log(`  Tag:         ${imageTag || '(chart default)'}`);
if (replicaCount) console.log(`  Replicas:    ${replicaCount}`);
console.log('  ───────────────────────────────────────────────────────\n');
console.log(`  Command:\n    ${command}\n`);

const confirm = await prompt('  Proceed with deployment? [y/n]', 'y');

if (!confirm.toLowerCase().startsWith('y')) {
  console.log('\n  Deployment cancelled.\n');
  rl.close();
  process.exit(0);
}

// ── Deploy ─────────────────────────────────────────────────────────────

console.log(`\n  Deploying "${appName}" to namespace "${namespace}"...\n`);

try {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
  console.log(
    `\n  Done! "${appName}" deployed successfully to namespace "${namespace}".\n`,
  );
  console.log(
    `  You can check the deployment status with:\n    helm status ${appName} -n ${namespace}\n`,
  );
  console.log(
    `  To view logs:\n    kubectl logs deploy/${appName} -n ${namespace}\n`,
  );
  console.log(
    `  To patch the deployment:\n    kubectl exec deploy/${appName} -n ${namespace} -- touch /app/shared/.healthy\n`,
  );
} catch {
  console.error(`\n  Error: Helm deployment failed\n`);
  process.exit(1);
}

rl.close();
