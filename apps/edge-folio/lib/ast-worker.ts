import type { AstWorkerInbound, AstWorkerOutbound } from "./ast-worker-types";
import type { SkeletonJson, SkeletonInfra } from "./skeleton-json";

// ── Parser state ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TsParser = any;
let jsParser: TsParser = null;
let pyParser: TsParser = null;

// ── Constants ─────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".cache",
  "coverage",
  ".turbo",
  "target",
  "vendor",
  ".idea",
  ".vscode",
  "out",
  ".output",
  ".tox",
  "venv",
  ".venv",
  "env",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".vue",
  ".svelte",
  ".scala",
]);

const MANIFEST_NAMES = new Set([
  "package.json",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  "mix.exs",
  "pubspec.yaml",
  "Package.swift",
]);

const FRAMEWORK_MAP: Record<string, string> = {
  react: "React",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  angular: "@angular/core",
  svelte: "Svelte",
  solid: "Solid",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  hapi: "Hapi",
  django: "Django",
  fastapi: "FastAPI",
  flask: "Flask",
  tornado: "Tornado",
  spring: "Spring",
  "spring-boot": "Spring Boot",
  nestjs: "NestJS",
  "@nestjs/core": "NestJS",
  laravel: "Laravel",
  rails: "Rails",
  phoenix: "Phoenix",
  gin: "Gin",
  fiber: "Fiber",
  echo: "Echo",
  graphql: "GraphQL",
  prisma: "Prisma",
  sequelize: "Sequelize",
  mongoose: "Mongoose",
  sqlalchemy: "SQLAlchemy",
  celery: "Celery",
  redis: "Redis",
  kafka: "Kafka",
  tensorflow: "TensorFlow",
  pytorch: "PyTorch",
  numpy: "NumPy",
  pandas: "Pandas",
  scikit: "scikit-learn",
};

const CLOUD_HINTS: Record<string, string> = {
  aws: "AWS",
  amazonaws: "AWS",
  "google-cloud": "GCP",
  "@google-cloud": "GCP",
  azure: "Azure",
  "@azure": "Azure",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  heroku: "Heroku",
  digitalocean: "DigitalOcean",
};

// ── Regex fallbacks (used when grammar WASM is unavailable) ───────────────────

const JS_IMPORT_RE =
  /(?:import\s+(?:[^'"]*?\bfrom\s+)?|require\s*\(\s*)['"]([^'"./][^'"]*)['"]/g;
const PY_IMPORT_RE =
  /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm;
const GO_IMPORT_RE = /"([^"]+)"/g;

// ── Send helper ───────────────────────────────────────────────────────────────

function send(msg: AstWorkerOutbound): void {
  self.postMessage(msg);
}

// ── Parser initialisation ─────────────────────────────────────────────────────

async function initParsers(): Promise<void> {
  try {
    // Dynamic import keeps tree-sitter out of the main bundle
    const { default: Parser } = await import("web-tree-sitter");
    await Parser.init({ locateFile: () => "/wasm/tree-sitter.wasm" });

    const tryGrammar = async (path: string): Promise<TsParser | null> => {
      try {
        const lang = await Parser.Language.load(path);
        const p = new Parser();
        p.setLanguage(lang);
        return p;
      } catch {
        return null;
      }
    };

    jsParser = await tryGrammar("/wasm/tree-sitter-javascript.wasm");
    pyParser = await tryGrammar("/wasm/tree-sitter-python.wasm");
    // TypeScript shares the JavaScript grammar for import extraction
    if (!jsParser) {
      jsParser = await tryGrammar("/wasm/tree-sitter-typescript.wasm");
    }
  } catch {
    // tree-sitter.wasm missing → regex-only mode
  }
}

// ── Import extraction ─────────────────────────────────────────────────────────

function extractImportsRegex(source: string, ext: string): string[] {
  const results: string[] = [];
  if (ext === ".py") {
    for (const m of source.matchAll(PY_IMPORT_RE)) {
      const mod = (m[1] ?? m[2] ?? "").split(".")[0]?.trim();
      if (mod) results.push(mod);
    }
  } else if (ext === ".go") {
    const inBlock = source.match(/import\s*\(([^)]+)\)/s)?.[1] ?? "";
    const single = source.match(/^import\s+"([^"]+)"/m)?.[1] ?? "";
    for (const m of (inBlock + "\n" + single).matchAll(GO_IMPORT_RE)) {
      const parts = m[1]!.split("/");
      if (parts.length >= 2) results.push(parts.slice(0, 2).join("/"));
    }
  } else {
    for (const m of source.matchAll(JS_IMPORT_RE)) {
      const mod = m[1]!;
      if (!mod.startsWith(".")) results.push(mod.split("/")[0]!);
    }
  }
  return results;
}

function extractImportsAst(
  source: string,
  parser: TsParser,
  isPython: boolean,
): string[] {
  const results: string[] = [];
  try {
    const tree = parser.parse(source);
    if (isPython) {
      // Query: import_statement and import_from_statement
      for (const node of tree.rootNode.children) {
        if (node.type === "import_statement") {
          const nameNode = node.childForFieldName("name");
          if (nameNode) {
            const top = nameNode.text.split(".")[0];
            if (top) results.push(top);
          }
        } else if (node.type === "import_from_statement") {
          const modNode = node.childForFieldName("module_name");
          if (modNode) {
            const top = modNode.text.split(".")[0];
            if (top) results.push(top);
          }
        }
      }
    } else {
      // JS/TS: import_declaration and call_expression (require)
      walkNode(tree.rootNode, (node: TsParser) => {
        if (node.type === "import_declaration") {
          const src = node.childForFieldName("source");
          if (src) {
            const raw = src.text.replace(/^['"]|['"]$/g, "");
            if (!raw.startsWith(".")) results.push(raw.split("/")[0]!);
          }
        }
      });
    }
  } catch {
    // parse error - fall back to regex
    return extractImportsRegex(source, isPython ? ".py" : ".js");
  }
  return results;
}

function walkNode(node: TsParser, fn: (n: TsParser) => void): void {
  fn(node);
  for (let i = 0; i < node.childCount; i++) {
    walkNode(node.child(i), fn);
  }
}

function extractImports(source: string, ext: string): string[] {
  const isJs = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
  ].includes(ext);
  const isPy = ext === ".py";

  if (isJs && jsParser) return extractImportsAst(source, jsParser, false);
  if (isPy && pyParser) return extractImportsAst(source, pyParser, true);
  return extractImportsRegex(source, ext);
}

// ── Manifest parsing ──────────────────────────────────────────────────────────

function parsePackageJson(text: string): { runtime: string[]; dev: string[] } {
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    const runtime = Object.keys(
      (pkg.dependencies as Record<string, unknown>) ?? {},
    );
    const dev = Object.keys(
      (pkg.devDependencies as Record<string, unknown>) ?? {},
    );
    return { runtime, dev };
  } catch {
    return { runtime: [], dev: [] };
  }
}

function parseRequirementsTxt(text: string): string[] {
  return text
    .split("\n")
    .map((l) =>
      l
        .trim()
        .split(/[=<>!~[;]/)[0]!
        .trim()
        .toLowerCase(),
    )
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"));
}

function parseGoMod(text: string): string[] {
  const deps: string[] = [];
  const block = text.match(/require\s*\(([^)]+)\)/s)?.[1] ?? "";
  for (const line of (block + "\n" + text).split("\n")) {
    const m = line.trim().match(/^([\w./\-]+(?:\/[\w.\-]+)+)\s+/);
    if (m) deps.push(m[1]!);
  }
  return [...new Set(deps)];
}

function parseCargoToml(text: string): string[] {
  const deps: string[] = [];
  let inDeps = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (
      /^\[dependencies\]/.test(trimmed) ||
      /^\[dev-dependencies\]/.test(trimmed)
    ) {
      inDeps = true;
    } else if (/^\[/.test(trimmed)) {
      inDeps = false;
    } else if (inDeps) {
      const m = trimmed.match(/^([\w\-]+)\s*=/);
      if (m) deps.push(m[1]!);
    }
  }
  return deps;
}

// ── Framework detection ───────────────────────────────────────────────────────

function detectFrameworks(allDeps: string[]): string[] {
  const found = new Set<string>();
  for (const dep of allDeps) {
    const key = dep.toLowerCase().replace(/^@/, "");
    for (const [pattern, framework] of Object.entries(FRAMEWORK_MAP)) {
      if (
        key === pattern ||
        key.startsWith(pattern + "/") ||
        key.startsWith(pattern + "-")
      ) {
        found.add(framework);
      }
    }
  }
  return [...found];
}

function detectCloudHints(allDeps: string[]): string[] {
  const found = new Set<string>();
  for (const dep of allDeps) {
    const key = dep.toLowerCase();
    for (const [pattern, cloud] of Object.entries(CLOUD_HINTS)) {
      if (key.startsWith(pattern)) found.add(cloud);
    }
  }
  return [...found];
}

// ── CI detection from file paths ──────────────────────────────────────────────

const CI_PATTERNS: Array<[RegExp, string]> = [
  [/\.github\/workflows\/.+\.ya?ml$/, "GitHub Actions"],
  [/\.gitlab-ci\.ya?ml$/, "GitLab CI"],
  [/Jenkinsfile$/, "Jenkins"],
  [/\.circleci\/config\.ya?ml$/, "CircleCI"],
  [/bitbucket-pipelines\.ya?ml$/, "Bitbucket Pipelines"],
  [/\.drone\.ya?ml$/, "Drone CI"],
  [/Makefile$/, "Make"],
];

// ── Language detection from extensions ───────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".h": "C/C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".rb": "Ruby",
  ".php": "PHP",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".scala": "Scala",
};

// ── Directory walker ──────────────────────────────────────────────────────────

interface WalkResult {
  runtimeDeps: string[];
  devDeps: string[];
  importedModules: string[];
  languages: Set<string>;
  infra: SkeletonInfra;
  kicadFiles: string[];
  ciSystems: Set<string>;
  totalFiles: number;
  codeFiles: number;
}

async function walk(
  handle: FileSystemDirectoryHandle,
  relPath: string,
  depth: number,
  result: WalkResult,
  aborted: { value: boolean },
): Promise<void> {
  if (aborted.value || depth > 8) return;

  for await (const [name, entry] of handle.entries()) {
    if (aborted.value) return;
    const rel = relPath ? `${relPath}/${name}` : name;

    if (entry.kind === "directory") {
      if (SKIP_DIRS.has(name)) continue;
      await walk(
        entry as FileSystemDirectoryHandle,
        rel,
        depth + 1,
        result,
        aborted,
      );
      continue;
    }

    result.totalFiles++;

    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf(".");
    const ext = dot >= 0 ? lower.slice(dot) : "";

    // CI detection
    for (const [pattern, ci] of CI_PATTERNS) {
      if (pattern.test(rel)) result.ciSystems.add(ci);
    }

    // Docker / K8s detection
    if (lower === "dockerfile" || lower.startsWith("dockerfile."))
      result.infra.hasDocker = true;
    if (lower === "docker-compose.yml" || lower === "docker-compose.yaml")
      result.infra.hasDocker = true;
    if (lower.endsWith(".kicad_pro")) result.kicadFiles.push(name);

    let text: string | null = null;

    const tryRead = async (): Promise<string | null> => {
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size > 512_000) return null; // skip files > 512 KB
        return await file.text();
      } catch {
        return null;
      }
    };

    // Manifests
    if (MANIFEST_NAMES.has(lower)) {
      text = await tryRead();
      if (!text) continue;
      if (lower === "package.json") {
        const { runtime, dev } = parsePackageJson(text);
        result.runtimeDeps.push(...runtime);
        result.devDeps.push(...dev);
      } else if (lower === "requirements.txt") {
        result.runtimeDeps.push(...parseRequirementsTxt(text));
      } else if (lower === "go.mod") {
        result.runtimeDeps.push(...parseGoMod(text));
      } else if (lower === "cargo.toml") {
        result.runtimeDeps.push(...parseCargoToml(text));
      } else if (lower === "pyproject.toml") {
        // Minimal: look for project.dependencies block
        for (const line of text.split("\n")) {
          const m = line.trim().match(/^['"]?([\w\-]+(?:[>=<!][^'"]*)?)/);
          if (m && !line.includes("[") && !line.includes("#")) {
            const pkg = m[1]!.split(/[>=<!]/)[0]!.trim();
            if (pkg) result.runtimeDeps.push(pkg);
          }
        }
      }
      continue;
    }

    // K8s manifests
    if (
      (ext === ".yml" || ext === ".yaml") &&
      !lower.includes("docker-compose")
    ) {
      text = await tryRead();
      if (text && /^kind:\s+\w+/m.test(text) && /^apiVersion:/m.test(text)) {
        result.infra.hasKubernetes = true;
      }
      continue;
    }

    // Code files - extract imports
    if (CODE_EXTENSIONS.has(ext)) {
      result.codeFiles++;
      const lang = EXT_LANG[ext];
      if (lang) result.languages.add(lang);

      text = await tryRead();
      if (!text) continue;

      const imports = extractImports(text, ext);
      result.importedModules.push(...imports);
    }
  }
}

// ── Main extraction ───────────────────────────────────────────────────────────

let aborted = { value: false };

async function runExtraction(handle: FileSystemDirectoryHandle): Promise<void> {
  aborted = { value: false };

  send({ type: "PROGRESS", phase: "init" });
  await initParsers();

  if (aborted.value) return;

  send({ type: "PROGRESS", phase: "scanning" });

  const result: WalkResult = {
    runtimeDeps: [],
    devDeps: [],
    importedModules: [],
    languages: new Set(),
    infra: {
      hasDocker: false,
      hasKubernetes: false,
      ciSystems: [],
      cloudHints: [],
    },
    kicadFiles: [],
    ciSystems: new Set(),
    totalFiles: 0,
    codeFiles: 0,
  };

  try {
    await walk(handle, "", 0, result, aborted);
  } catch (err) {
    send({
      type: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (aborted.value) return;

  send({ type: "PROGRESS", phase: "building" });

  // Deduplicate
  const uniqRuntime = [
    ...new Set(result.runtimeDeps.map((d) => d.toLowerCase())),
  ];
  const uniqDev = [...new Set(result.devDeps.map((d) => d.toLowerCase()))];
  const allDeps = [...uniqRuntime, ...uniqDev];

  // Filter common noisy imports (built-ins and relative paths already excluded by regex)
  const BUILTINS = new Set([
    "os",
    "sys",
    "io",
    "re",
    "json",
    "math",
    "time",
    "datetime",
    "collections",
    "itertools",
    "functools",
    "pathlib",
    "typing",
    "abc",
    "copy",
    "enum",
    "uuid",
    "fs",
    "path",
    "http",
    "https",
    "url",
    "util",
    "events",
    "stream",
    "child_process",
    "crypto",
    "buffer",
    "process",
    "assert",
  ]);
  const uniqImports = [
    ...new Set(
      result.importedModules
        .map((m) => m.toLowerCase())
        .filter((m) => m && !BUILTINS.has(m) && m.length > 1),
    ),
  ].slice(0, 60);

  result.infra.ciSystems = [...result.ciSystems];
  result.infra.cloudHints = detectCloudHints(allDeps);

  const skeleton: SkeletonJson = {
    scannedAt: new Date().toISOString(),
    projectName: handle.name,
    languages: [...result.languages],
    frameworks: detectFrameworks(allDeps),
    runtimeDeps: uniqRuntime,
    devDeps: uniqDev,
    importedModules: uniqImports,
    infra: result.infra,
    kicadFiles: result.kicadFiles,
    fileStats: { totalFiles: result.totalFiles, codeFiles: result.codeFiles },
  };

  send({ type: "DONE", skeleton });
}

// ── Message router ────────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<AstWorkerInbound>) => {
  const msg = event.data;
  if (!msg?.type) return;

  switch (msg.type) {
    case "EXTRACT":
      void runExtraction(msg.handle);
      break;
    case "ABORT":
      aborted.value = true;
      break;
  }
};
