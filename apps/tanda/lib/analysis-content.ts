// ─── Analysis content model ──────────────────────────────────────────────────
//
// The single source of truth for the *structure* of the Product Analysis page:
// which stakeholders, tiers, variables, formulas, stories, tasks, tech, and
// specs exist and in what order. Only structural data lives here (i18n keys,
// icons, colors, formula notation) - every user-visible string is resolved from
// the translation files at render time.
//
// Both the on-screen page (`app/[locale]/analysis/page.tsx`) and the PDF export
// builder (`lib/analysis-pdf.tsx`) iterate over these constants, so the two
// stay in lock-step automatically.

export type StakeholderCategory = "user" | "platform";

export interface StakeholderDef {
  key: string;
  icon: string;
  accent: string;
  category: StakeholderCategory;
}

export const STAKEHOLDERS: StakeholderDef[] = [
  {
    key: "s1",
    icon: "🏠",
    accent: "var(--success, #16a34a)",
    category: "user",
  },
  {
    key: "s2",
    icon: "🚗",
    accent: "var(--warning, #d97706)",
    category: "user",
  },
  { key: "s3", icon: "✈️", accent: "var(--accent, #06b6d4)", category: "user" },
  { key: "s4", icon: "🛡️", accent: "#7c3aed", category: "platform" },
  { key: "s5", icon: "✅", accent: "#2563eb", category: "platform" },
  { key: "s6", icon: "⚙️", accent: "#0891b2", category: "platform" },
];

export interface TierDef {
  tier: "1" | "2" | "3" | "4";
  key: "t1" | "t2" | "t3" | "t4";
  color: string;
  icon: string;
}

export const TIER_DEFS: TierDef[] = [
  { tier: "1", key: "t1", color: "var(--success, #16a34a)", icon: "🏠" },
  { tier: "2", key: "t2", color: "var(--warning, #d97706)", icon: "🚗" },
  { tier: "3", key: "t3", color: "var(--accent, #06b6d4)", icon: "✈️" },
  { tier: "4", key: "t4", color: "#7c3aed", icon: "📱" },
];

// Universal math variables. The translation key differs from the rendered
// symbol for Greek letters (e.g. the `delta` key renders as `δ`).
export const MATH_VARS = ["G", "N", "d", "delta", "r", "T", "M", "m"] as const;

export const MATH_VAR_SYMBOLS: Record<(typeof MATH_VARS)[number], string> = {
  G: "G",
  N: "N",
  d: "d",
  delta: "δ",
  r: "r",
  T: "T",
  M: "M",
  m: "m",
};

export interface FormulaDef {
  key: "a" | "b" | "c" | "d";
  formula: string;
}

export const FORMULAS: FormulaDef[] = [
  { key: "a", formula: "G_m = G × (1 + δ)^(m/12)" },
  { key: "b", formula: "P = [(1/M) × Σ G × (1 + δ)^(m/12) − G × d] / M" },
  { key: "c", formula: "ΣP_k + (G × d) ≥ G_m × c" },
  {
    key: "d",
    formula: "B_m = B_{m-1} + (N × P) + (B_{m-1} × r/12) − G_m − I_m",
  },
];

export const USER_STORY_KEYS = [
  "us01",
  "us02",
  "us03",
  "us04",
  "us05",
  "us06",
  "us07",
  "us08",
  "us09",
  "us10",
  "us11",
  "us12",
];

export interface PhaseDef {
  phase: "1" | "2" | "3";
  labelKey: "be" | "fe" | "do";
  taskIds: string[];
}

export const TASK_PHASES: PhaseDef[] = [
  {
    phase: "1",
    labelKey: "be",
    taskIds: ["be01", "be02", "be03", "be04", "be05", "be06"],
  },
  { phase: "2", labelKey: "fe", taskIds: ["fe01", "fe02", "fe03", "fe04"] },
  {
    phase: "3",
    labelKey: "do",
    taskIds: ["do01", "do02", "do03", "do04", "do05"],
  },
];

// Overview rows, ordered as they read on screen (problem first).
export const OVERVIEW_ROWS: { labelKey: string; valueKey: string }[] = [
  { labelKey: "problemLabel", valueKey: "problem" },
  { labelKey: "objectiveLabel", valueKey: "objective" },
  { labelKey: "stackLabel", valueKey: "stack" },
  { labelKey: "courseLabel", valueKey: "courseValue" },
  { labelKey: "studentLabel", valueKey: "studentValue" },
];

export const TECH_STACK = [
  "Next.js 16",
  "React 19",
  "next-intl",
  "Serwist (PWA)",
  "SimpleWebAuthn",
  "Django / DRF",
  "PostgreSQL",
  "Redis / Celery",
  "Kubernetes",
  "Cloudflare",
];

export const INFRA_SPEC_KEYS = [
  "orchestration",
  "edge",
  "tls",
  "host",
  "container",
  "service",
  "replicas",
  "resources",
  "probes",
];

/**
 * Turns a content key like `be01` / `us12` into a display id like `BE-01` /
 * `US-12`. Shared by the user-story and task tables on both the page and PDF.
 */
export function taskDisplayId(id: string): string {
  return id.replace(
    /^([a-z]+)(\d+)$/i,
    (_, prefix: string, num: string) => `${prefix.toUpperCase()}-${num}`,
  );
}
