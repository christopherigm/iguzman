import type {
  ApplicationStatus,
  TailoredBullet,
  SignalLevel,
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
