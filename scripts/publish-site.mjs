/**
 * publish-site.mjs
 *
 * Publishes a locally-seeded, tested customer site's CONTENT into production.
 *
 *   pnpm publish-site <host> [--reset] [-y]
 *   pnpm publish-site bdrone.com.mx
 *
 * It serializes the site's System + success stories + highlights + product /
 * service catalog out of the LOCAL database (via `manage.py export_site`), then
 * POSTs that payload to the production `/api/publish-site/` endpoint, which
 * upserts it. Image files are NOT transported - the customer uploads real images
 * in the production CMS; existing images are never clobbered on re-publish.
 * Pass `--reset` for an exact replace of the System's prior content.
 *
 * Because it writes to production, it confirms before POSTing (skip with -y).
 *
 * Credentials/URL resolve like sync-website-hosts.mjs:
 *   1. env  WEBSITE_API_URL / WEBSITE_ADMIN_USER / WEBSITE_ADMIN_PASSWORD
 *   2. apps/website-api/.env → DJANGO_ADMIN_USER / DJANGO_ADMIN_PASSWORD
 *   3. Interactive prompt (unless -y)
 *
 * NOTE: the /api/publish-site/ endpoint ships in the website-api image, so
 * production must be redeployed with it before this script can reach prod.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APPS_DIR, readEnvFile, createPrompt } from "./utils.mjs";

// ── Args ──────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const autoYes = rawArgs.includes("-y");
const reset = rawArgs.includes("--reset");
const host = rawArgs.find((a) => !a.startsWith("-"))?.trim().toLowerCase();

if (!host) {
  console.error("\n  Usage: pnpm publish-site <host> [--reset] [-y]\n");
  process.exit(1);
}

const API_DIR = join(APPS_DIR, "website-api");

// ── 1. Build the payload from the LOCAL database ──────────────────────────────

function loadPayload() {
  const python = join(API_DIR, "venv", "bin", "python");
  if (existsSync(python)) {
    console.log(`\n  Exporting '${host}' from the local database ...`);
    try {
      return execFileSync(python, ["manage.py", "export_site", host], {
        cwd: API_DIR,
        encoding: "utf-8",
      });
    } catch (err) {
      console.error(
        `\n  Error: export_site failed - ${err.stderr || err.message}\n`,
      );
      process.exit(1);
    }
  }

  // Fallback: a previously written export file.
  const file = join(API_DIR, "seed_assets", "exports", `${host}.json`);
  if (existsSync(file)) {
    console.log(`\n  venv not found; using ${file}`);
    return readFileSync(file, "utf-8");
  }

  console.error(
    `\n  Error: no venv at apps/website-api/venv and no export at ` +
      `seed_assets/exports/${host}.json.\n  Run: cd apps/website-api && ` +
      `python manage.py export_site ${host} --output seed_assets/exports/${host}.json\n`,
  );
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(loadPayload());
} catch (err) {
  console.error(`\n  Error: exported payload is not valid JSON - ${err.message}\n`);
  process.exit(1);
}
if (reset) payload.reset = true;

// ── 2. Resolve production API URL + admin credentials ─────────────────────────

const apiEnv = readEnvFile(join(API_DIR, ".env"));
const { rl, prompt } = createPrompt({ defaultYes: autoYes });

const defaultApiUrl =
  process.env.WEBSITE_API_URL || "https://website-api.iguzman.com.mx";
const apiUrl = autoYes ? defaultApiUrl : await prompt("  Production API URL", defaultApiUrl);

const defaultUser = process.env.WEBSITE_ADMIN_USER || apiEnv.DJANGO_ADMIN_USER || "";
const defaultPass = process.env.WEBSITE_ADMIN_PASSWORD || apiEnv.DJANGO_ADMIN_PASSWORD || "";
const adminUser = autoYes ? defaultUser : await prompt("  Admin username", defaultUser);
const adminPass = autoYes ? defaultPass : await prompt("  Admin password", defaultPass);

if (!apiUrl || !adminUser || !adminPass) {
  console.error("\n  Error: API URL and admin credentials are required\n");
  rl.close();
  process.exit(1);
}

// ── 3. Confirm (writes to production!) ────────────────────────────────────────

const counts = {
  stories: (payload.success_stories || []).length,
  highlights: (payload.highlights || []).length,
  productCategories: (payload.product_categories || []).length,
  serviceCategories: (payload.service_categories || []).length,
};
console.log(
  `\n  Publishing '${host}' to ${apiUrl}` +
    `\n    ${counts.stories} stories, ${counts.highlights} highlights, ` +
    `${counts.productCategories} product cat., ${counts.serviceCategories} service cat.` +
    (reset ? "\n    --reset: replaces this System's existing content" : ""),
);
if (!autoYes) {
  const answer = await prompt("\n  Type 'yes' to publish", "");
  if (answer.toLowerCase() !== "yes") {
    console.log("\n  Aborted.\n");
    rl.close();
    process.exit(0);
  }
}
rl.close();

// ── 4. POST to the production endpoint ────────────────────────────────────────

try {
  const credentials = Buffer.from(`${adminUser}:${adminPass}`).toString("base64");
  const res = await fetch(`${apiUrl}/api/publish-site/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(
      `\n  Error: API returned ${res.status} ${res.statusText}` +
        (body.detail ? ` - ${body.detail}` : "") +
        "\n",
    );
    process.exit(1);
  }

  console.log(`\n  ✓ Published '${host}'`);
  console.log(`    ${JSON.stringify(body)}\n`);
  console.log(
    "  Next: run `pnpm sync-website-hosts` so the domain routes to the website " +
      "app (ingress + CORS).\n",
  );
} catch (err) {
  console.error(`\n  Error: failed to reach API - ${err.message}\n`);
  process.exit(1);
}
