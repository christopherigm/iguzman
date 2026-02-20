import { execSync } from 'node:child_process';
import { createPrompt, ROOT } from './utils.mjs';

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

const RELEASE_NAME = 'postgres';
const CHART_PATH = './packages/charts/postgres';

console.log('\n  PostgreSQL – Helm Deployment\n');
console.log('  ═══════════════════════════════════════════════════════════\n');

const { rl, prompt } = createPrompt();

// ── Interactive Prompts ────────────────────────────────────────────────

const namespace = await prompt('  Namespace', '');

if (!namespace) {
  console.error('\n  Error: Namespace is required\n');
  rl.close();
  process.exit(1);
}

const password = await prompt('  auth.password', 'postgres');
const user = await prompt('  auth.user', 'postgres');
const database = await prompt('  auth.database', 'postgres');
const pvcSize = await prompt('  persistence.size', '1Gi');

// ── Build Helm Command ─────────────────────────────────────────────────

const setFlags = [
  `--set auth.password=${password}`,
  `--set auth.user=${user}`,
  `--set auth.database=${database}`,
  `--set persistence.size=${pvcSize}`,
];

const command = [
  'helm upgrade --install',
  RELEASE_NAME,
  CHART_PATH,
  `--namespace ${namespace}`,
  '--create-namespace',
  ...setFlags,
].join(' ');

// ── Summary & Confirmation ─────────────────────────────────────────────

const isUpgrade = releaseExists(RELEASE_NAME, namespace);
const action = isUpgrade ? 'Upgrade' : 'Install';

console.log('\n  ── Deployment Summary ──────────────────────────────────');
console.log(`  Action:        ${action}`);
console.log(`  Release:       ${RELEASE_NAME}`);
console.log(`  Namespace:     ${namespace}`);
console.log(`  Chart:         ${CHART_PATH}`);
console.log(`  auth.user:          ${user}`);
console.log(`  auth.database:      ${database}`);
console.log(`  auth.password:      ${'*'.repeat(password.length)}`);
console.log(`  persistence.size:   ${pvcSize}`);
console.log('  ───────────────────────────────────────────────────────\n');
console.log(`  Command:\n    ${command}\n`);

const confirm = await prompt('  Proceed with deployment? [y/n]', 'y');

if (!confirm.toLowerCase().startsWith('y')) {
  console.log('\n  Deployment cancelled.\n');
  rl.close();
  process.exit(0);
}

// ── Deploy ─────────────────────────────────────────────────────────────

console.log(`\n  Deploying PostgreSQL to namespace "${namespace}"...\n`);

try {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
  console.log(
    `\n  ✓ PostgreSQL deployed successfully to namespace "${namespace}".\n`,
  );
} catch {
  console.error('\n  ✗ Helm deployment failed\n');
  rl.close();
  process.exit(1);
}

rl.close();
