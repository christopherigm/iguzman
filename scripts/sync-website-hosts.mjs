/**
 * sync-website-hosts.mjs
 *
 * Fetches all enabled System hosts from the website-api and rewrites the
 * ingress section of apps/website/helm/values.yaml so nginx routes every
 * registered domain to the website app.
 *
 * Credentials are resolved in this order:
 *   1. CLI env vars  WEBSITE_API_URL / WEBSITE_ADMIN_USER / WEBSITE_ADMIN_PASSWORD
 *   2. apps/website/.env   → NEXT_PUBLIC_API_URL
 *   3. apps/website-api/.env → DJANGO_ADMIN_USER / DJANGO_ADMIN_PASSWORD
 *   4. Interactive prompt (if not running with -y)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPS_DIR, readEnvFile, createPrompt } from './utils.mjs';

// ── Paths ───────────────────────────────────────────────────────────────────

const VALUES_YAML = join(APPS_DIR, 'website', 'helm', 'values.yaml');

// ── YAML helpers ────────────────────────────────────────────────────────────

/**
 * Builds the ingress: YAML block for the given list of hostnames.
 * Each host gets the standard / Prefix path. All hosts share one TLS secret
 * so cert-manager issues a single multi-SAN certificate.
 */
function buildIngressBlock(hosts) {
  const hostEntries = hosts
    .map(
      (h) =>
        `    - host: ${h}\n      paths:\n        - path: /\n          pathType: Prefix`,
    )
    .join('\n');

  const tlsHosts = hosts.map((h) => `        - ${h}`).join('\n');

  return (
    `ingress:\n` +
    `  enabled: true\n` +
    `  className: 'nginx' # MicroK8s uses the nginx ingress class\n` +
    `  annotations:\n` +
    `    cert-manager.io/cluster-issuer: 'letsencrypt-prod'\n` +
    `  hosts:\n` +
    `${hostEntries}\n` +
    `  tls:\n` +
    `    - secretName: website-tls\n` +
    `      hosts:\n` +
    `${tlsHosts}\n`
  );
}

/**
 * Replaces the ingress: block in the values.yaml content.
 * The file uses `# ─── SectionName ───` comment lines as block separators,
 * so we split on those, replace the ingress block, and rejoin.
 */
function updateValuesYaml(content, hosts) {
  // Split into parts at each top-level comment separator (keep the delimiter)
  const parts = content.split(/(?=^# ─── )/m);

  const updated = parts.map((part) => {
    // The ingress block is the one that contains "ingress:" at column 0
    if (/^ingress:/m.test(part)) {
      // Preserve the leading comment line if present
      const commentLine = part.match(/^(# ─── Ingress[^\n]*\n)/)?.[1] ?? '';
      return commentLine + buildIngressBlock(hosts) + '\n';
    }
    return part;
  });

  return updated.join('');
}

// ── Main ────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const yesIndex = rawArgs.indexOf('-y');
const autoYes = yesIndex !== -1;

const apiEnv = readEnvFile(join(APPS_DIR, 'website-api', '.env'));

const { rl, prompt } = createPrompt({ defaultYes: autoYes });

// Resolve API URL
const defaultApiUrl = 'https://api.website.iguzman.com.mx';

const apiUrl = autoYes
  ? defaultApiUrl
  : await prompt('  API URL (website-api)', defaultApiUrl);

if (!apiUrl) {
  console.error('\n  Error: API URL is required\n');
  rl.close();
  process.exit(1);
}

// Resolve admin credentials
const defaultUser =
  process.env.WEBSITE_ADMIN_USER || apiEnv.DJANGO_ADMIN_USER || '';
const defaultPass =
  process.env.WEBSITE_ADMIN_PASSWORD || apiEnv.DJANGO_ADMIN_PASSWORD || '';

const adminUser = autoYes
  ? defaultUser
  : await prompt('  Admin username', defaultUser);
const adminPass = autoYes
  ? defaultPass
  : await prompt('  Admin password', defaultPass);

if (!adminUser || !adminPass) {
  console.error('\n  Error: Admin credentials are required\n');
  rl.close();
  process.exit(1);
}

rl.close();

// ── Fetch hosts ─────────────────────────────────────────────────────────────

console.log(`\n  Fetching system hosts from ${apiUrl}/api/systems/ ...\n`);

let systems;
try {
  const credentials = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
  const res = await fetch(`${apiUrl}/api/systems/`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    console.error(`\n  Error: API returned ${res.status} ${res.statusText}\n`);
    process.exit(1);
  }

  systems = await res.json();
} catch (err) {
  console.error(`\n  Error: Failed to reach API — ${err.message}\n`);
  process.exit(1);
}

const hosts = systems.map((s) => s.host);

if (hosts.length === 0) {
  console.error('\n  Error: No enabled systems found in the API\n');
  process.exit(1);
}

console.log(`  Found ${hosts.length} host(s):`);
hosts.forEach((h) => console.log(`    • ${h}`));

// ── Update values.yaml ───────────────────────────────────────────────────────

const original = readFileSync(VALUES_YAML, 'utf-8');
const updated = updateValuesYaml(original, hosts);

if (original === updated) {
  console.log('\n  values.yaml ingress is already up to date.\n');
} else {
  writeFileSync(VALUES_YAML, updated, 'utf-8');
  console.log(`\n  Updated ingress hosts in apps/website/helm/values.yaml\n`);
}
