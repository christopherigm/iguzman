import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveApp, createPrompt } from './utils.mjs';

// ── Icon definitions ───────────────────────────────────────────────────

const PWA_ICONS = [
  { name: 'icon-192x192.png', size: 192, maskable: false },
  { name: 'icon-512x512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192x192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512x512.png', size: 512, maskable: true },
];

// Maskable icons keep the logo at 80% of the canvas (10% safe-zone padding)
const MASKABLE_SCALE = 0.8;

// ── Helpers ────────────────────────────────────────────────────────────

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    console.error('\n  Error: ffmpeg is not installed or not in PATH\n');
    process.exit(1);
  }
}

function generateIcon(logoPath, outPath, size, maskable) {
  if (maskable) {
    // Scale the logo to 80% of the target size, then pad to the full size
    // This ensures the logo sits within the safe zone for maskable icons
    const innerSize = Math.round(size * MASKABLE_SCALE);
    const pad = Math.round((size - innerSize) / 2);

    execSync(
      `ffmpeg -y -i "${logoPath}" ` +
        `-vf "scale=${innerSize}:${innerSize}:force_original_aspect_ratio=decrease,` +
        `pad=${innerSize}:${innerSize}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
        `pad=${size}:${size}:${pad}:${pad}:color=0x00000000" ` +
        `"${outPath}"`,
      { stdio: 'ignore' },
    );
  } else {
    execSync(
      `ffmpeg -y -i "${logoPath}" ` +
        `-vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,` +
        `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" ` +
        `"${outPath}"`,
      { stdio: 'ignore' },
    );
  }
}

function generateFavicon(logoPath, outPath) {
  // Embed 16×16, 32×32 and 48×48 frames into a single .ico file
  execSync(
    `ffmpeg -y -i "${logoPath}" -i "${logoPath}" -i "${logoPath}" ` +
      `-filter_complex ` +
      `"[0:v]scale=16:16:force_original_aspect_ratio=decrease,pad=16:16:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s16];` +
      `[1:v]scale=32:32:force_original_aspect_ratio=decrease,pad=32:32:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s32];` +
      `[2:v]scale=48:48:force_original_aspect_ratio=decrease,pad=48:48:(ow-iw)/2:(oh-ih)/2:color=0x00000000[s48]" ` +
      `-map "[s16]" -map "[s32]" -map "[s48]" ` +
      `"${outPath}"`,
    { stdio: 'ignore' },
  );
}

// ── Main ───────────────────────────────────────────────────────────────

checkFfmpeg();

const rawArgs = process.argv.slice(2);
let appName = rawArgs[0];

const { rl, prompt } = createPrompt();

if (!appName) {
  appName = await prompt('  App name', '');
  if (!appName) {
    console.error('\n  Error: App name is required\n');
    rl.close();
    process.exit(1);
  }
}

rl.close();

// Validate app directory
const appDir = resolveApp(appName, 'pnpm generate-icons <app-name>');

// Find logo (prefer .png, fall back to .jpg / .jpeg)
const publicDir = join(appDir, 'public');
const logoCandidates = ['logo.png', 'logo.jpg', 'logo.jpeg'];
const logoFile = logoCandidates.find((f) => existsSync(join(publicDir, f)));

if (!logoFile) {
  console.error(
    `\n  Error: No logo found at apps/${appName}/public/\n` +
      `         Expected one of: ${logoCandidates.join(', ')}\n`,
  );
  process.exit(1);
}

const logoPath = join(publicDir, logoFile);
const iconsDir = join(publicDir, 'icons');
const faviconPath = join(publicDir, 'favicon.ico');

console.log(`\n  Generating icons for "${appName}"`);
console.log(`  Source: apps/${appName}/public/${logoFile}\n`);
console.log('  ═══════════════════════════════════════════════════════════\n');

// Ensure icons output directory exists
mkdirSync(iconsDir, { recursive: true });

// Step 1: PWA icons
console.log(`  [1/2] Generating PWA icons → apps/${appName}/public/icons/\n`);

for (const icon of PWA_ICONS) {
  const outPath = join(iconsDir, icon.name);
  process.stdout.write(
    `        ${icon.maskable ? '(maskable) ' : '           '}${icon.size}×${icon.size}  →  ${icon.name} … `,
  );
  try {
    generateIcon(logoPath, outPath, icon.size, icon.maskable);
    process.stdout.write('✓\n');
  } catch (err) {
    process.stdout.write('✗\n');
    console.error(`\n  Error generating ${icon.name}: ${err.message}\n`);
    process.exit(1);
  }
}

// Step 2: favicon.ico
console.log(
  `\n  [2/2] Generating favicon → apps/${appName}/public/favicon.ico … `,
);
try {
  generateFavicon(logoPath, faviconPath);
  process.stdout.write('✓\n');
} catch (err) {
  process.stdout.write('✗\n');
  console.error(`\n  Error generating favicon.ico: ${err.message}\n`);
  process.exit(1);
}

console.log('\n  ═══════════════════════════════════════════════════════════');
console.log('\n  ✓ All icons generated successfully!');
console.log(`    App:    ${appName}`);
console.log(
  `    Icons:  apps/${appName}/public/icons/ (${PWA_ICONS.length} files)`,
);
console.log(`    Favicon: apps/${appName}/public/favicon.ico\n`);
