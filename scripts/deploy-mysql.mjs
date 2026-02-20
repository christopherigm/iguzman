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

const RELEASE_NAME = 'mysql';
const CHART_PATH = './packages/charts/mysql';

console.log('\n  MySQL – Helm Deployment\n');
console.log('  ═══════════════════════════════════════════════════════════\n');

const { rl, prompt } = createPrompt();

// ── Interactive Prompts ────────────────────────────────────────────────

const namespace = await prompt('  Namespace', '');

if (!namespace) {
  console.error('\n  Error: Namespace is required\n');
  rl.close();
  process.exit(1);
}

const rootPassword = await prompt('  auth.rootPassword', '');

if (!rootPassword) {
  console.error('\n  Error: auth.rootPassword is required\n');
  rl.close();
  process.exit(1);
}

const database = await prompt('  auth.database', '');

if (!database) {
  console.error('\n  Error: auth.database is required\n');
  rl.close();
  process.exit(1);
}

const user = await prompt('  auth.user', '');

if (!user) {
  console.error('\n  Error: auth.user is required\n');
  rl.close();
  process.exit(1);
}

const password = await prompt('  auth.password', '');

if (!password) {
  console.error('\n  Error: auth.password is required\n');
  rl.close();
  process.exit(1);
}

const pvcSize = await prompt('  persistence.size', '1Gi');

// ── Build Helm Command ─────────────────────────────────────────────────

const setFlags = [
  ...(rootPassword ? [`--set auth.rootPassword=${rootPassword}`] : []),
  `--set auth.database=${database}`,
  `--set auth.user=${user}`,
  `--set auth.password=${password}`,
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
console.log(`  Action:            ${action}`);
console.log(`  Release:           ${RELEASE_NAME}`);
console.log(`  Namespace:         ${namespace}`);
console.log(`  Chart:             ${CHART_PATH}`);
if (rootPassword) {
  console.log(`  auth.rootPassword: ${'*'.repeat(rootPassword.length)}`);
}
console.log(`  auth.database:     ${database}`);
console.log(`  auth.user:         ${user}`);
console.log(`  auth.password:     ${'*'.repeat(password.length)}`);
console.log(`  persistence.size:  ${pvcSize}`);
console.log('  ───────────────────────────────────────────────────────\n');
console.log(`  Command:\n    ${command}\n`);

const confirm = await prompt('  Proceed with deployment? [y/n]', 'y');

if (!confirm.toLowerCase().startsWith('y')) {
  console.log('\n  Deployment cancelled.\n');
  rl.close();
  process.exit(0);
}

// ── Deploy ─────────────────────────────────────────────────────────────

console.log(`\n  Deploying MySQL to namespace "${namespace}"...\n`);

try {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
  console.log(
    `\n  ✓ MySQL deployed successfully to namespace "${namespace}".\n`,
  );
} catch {
  console.error('\n  ✗ Helm deployment failed\n');
  rl.close();
  process.exit(1);
}

rl.close();
