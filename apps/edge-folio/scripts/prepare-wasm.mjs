/**
 * Copies tree-sitter.wasm from node_modules and downloads language grammar
 * WASM files into public/wasm/ so the AST worker can fetch them at runtime.
 *
 * Run: pnpm prepare-wasm
 */

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dest = path.join(root, "public", "wasm");

mkdirSync(dest, { recursive: true });

// ── Copy core WASM from node_modules ──────────────────────────────────────────

const coreSrc = path.join(
  root,
  "node_modules",
  "web-tree-sitter",
  "tree-sitter.wasm",
);
if (!existsSync(coreSrc)) {
  console.error("tree-sitter.wasm not found - run pnpm install first.");
  process.exit(1);
}
copyFileSync(coreSrc, path.join(dest, "tree-sitter.wasm"));
console.log("✓ tree-sitter.wasm copied");

// ── Download language grammar WASM files ──────────────────────────────────────

const GRAMMARS = [
  {
    name: "tree-sitter-javascript.wasm",
    url: "https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.1/tree-sitter-javascript.wasm",
  },
  {
    name: "tree-sitter-typescript.wasm",
    url: "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-typescript.wasm",
  },
  {
    name: "tree-sitter-python.wasm",
    url: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
  },
];

for (const { name, url } of GRAMMARS) {
  const fileDest = path.join(dest, name);
  if (existsSync(fileDest)) {
    console.log(`✓ ${name} already present`);
    continue;
  }

  process.stdout.write(`  Downloading ${name}…`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(res.body, createWriteStream(fileDest));
    console.log(" done");
  } catch (err) {
    console.log(
      ` FAILED (${err.message}) - extraction will fall back to regex`,
    );
  }
}

console.log("\nWASM setup complete. Files in public/wasm/:");
import { readdirSync } from "fs";
for (const f of readdirSync(dest)) {
  console.log(`  ${f}`);
}
