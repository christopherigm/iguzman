import type {
  ApplicationStatus,
  TailoredBullet,
  SignalLevel,
  CompanyAnalysis,
  CompanyIntel,
} from "@/lib/applications";
import type { WorkExperience, Education, Language, Project } from "@/lib/career";
import type { Skill } from "@/lib/matrix";

export const STATUSES: ApplicationStatus[] = [
  "draft",
  "applied",
  "interview",
  "offer",
  "rejected",
];

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: "#6b7280",
  applied: "#06b6d4",
  interview: "#f59e0b",
  offer: "#22c55e",
  rejected: "#ef4444",
};

export const SIGNAL_COLORS: Record<SignalLevel, string> = {
  positive: "#22c55e",
  mixed: "#f59e0b",
  concerning: "#ef4444",
};

/** A Company Signal (the five keys of `CompanyAnalysis`, minus its summary). */
export type SignalKey = keyof Omit<CompanyAnalysis, "summary">;
/** A company-intel bucket (source), used as the swiper key. */
export type IntelKey = keyof CompanyIntel;

/**
 * The five Company Signals in display order, paired with their translation key.
 * The first entry is the initially-selected signal in the signals panel.
 */
export const SIGNAL_KEYS: Array<{ key: SignalKey; tKey: string }> = [
  { key: "job_security", tKey: "signals.job_security" },
  { key: "financial_health", tKey: "signals.financial_health" },
  { key: "leadership_stability", tKey: "signals.leadership_stability" },
  { key: "work_culture", tKey: "signals.work_culture" },
  { key: "growth_trajectory", tKey: "signals.growth_trajectory" },
];

/** Section-title translation key for each intel bucket (source swiper). */
export const INTEL_TITLE_KEYS: Record<IntelKey, string> = {
  company_news: "companyNewsTitle",
  hiring_news: "companyHiringTitle",
  layoff_news: "companyLayoffsTitle",
  reputation: "companyReputationTitle",
  funding_news: "companyFundingTitle",
  leadership_news: "companyLeadershipTitle",
  acquisition_news: "companyAcquisitionsTitle",
  engineering_culture: "companyEngineeringCultureTitle",
};

/**
 * Maps each Company Signal to the intel buckets (source swipers) that inform it.
 * A bucket may feed more than one signal (e.g. hiring activity reads into both
 * job security and growth trajectory). The selected signal's non-empty buckets
 * render as swipers on the right of the signals panel, in listed order.
 */
export const SIGNAL_SOURCE_MAP: Record<SignalKey, IntelKey[]> = {
  job_security: ["layoff_news", "hiring_news"],
  financial_health: ["funding_news", "acquisition_news"],
  leadership_stability: ["leadership_news"],
  work_culture: ["reputation", "engineering_culture"],
  growth_trajectory: ["hiring_news", "company_news", "acquisition_news"],
};

const CATEGORY_ORDER = [
  "impact",
  "technical",
  "leadership",
  "collaboration",
  "other",
];

export function groupByCategory(
  bullets: TailoredBullet[],
): Array<{ cat: string; bullets: TailoredBullet[] }> {
  const map = new Map<string, TailoredBullet[]>();
  for (const b of bullets) {
    const cat = b.category || "other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(b);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
    cat: c,
    bullets: map.get(c)!,
  }));
}

export function formatSalary(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  currency: string | null | undefined,
  notSpecifiedLabel: string,
): string {
  const hasMin = min != null && min !== "";
  const hasMax = max != null && max !== "";
  if (!hasMin && !hasMax) return notSpecifiedLabel;
  const curr = currency ? ` ${currency}` : "";
  const fmt = (v: number | string) => Number(v).toLocaleString();
  if (hasMin && hasMax) return `${fmt(min!)} - ${fmt(max!)}${curr}`;
  if (hasMin) return `${fmt(min!)}+${curr}`;
  return `≤ ${fmt(max!)}${curr}`;
}

export interface ExportData {
  workExps: WorkExperience[];
  educations: Education[];
  languages: Language[];
  projects: Project[];
  skills: Skill[];
}
