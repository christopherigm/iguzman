export type ApplicationStatus =
  | "draft"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";
export type WorkType = "remote" | "onsite" | "hybrid";
export type SalaryCurrency = "USD" | "CAD" | "EUR" | "MXN" | "GBP";
export type CompanyStatus = "pending" | "processing" | "complete" | "failed";
export type TailorStatus = "" | "processing" | "complete" | "failed";
export type NaftaLetterStatus = "" | "processing" | "complete" | "failed";

export interface CompanyIntelItem {
  title: string;
  summary: string;
  url: string;
  source: string;
}

export interface CompanyIntel {
  company_news: CompanyIntelItem[];
  hiring_news: CompanyIntelItem[];
  layoff_news: CompanyIntelItem[];
  reputation: CompanyIntelItem[];
  funding_news: CompanyIntelItem[];
  leadership_news: CompanyIntelItem[];
  acquisition_news: CompanyIntelItem[];
  engineering_culture: CompanyIntelItem[];
}

export type SignalLevel = "positive" | "mixed" | "concerning";

export interface CompanySignal {
  level: SignalLevel;
  explanation: string;
}

export interface CompanyAnalysis {
  summary: string;
  job_security: CompanySignal;
  financial_health: CompanySignal;
  leadership_stability: CompanySignal;
  work_culture: CompanySignal;
  growth_trajectory: CompanySignal;
}

export interface Company {
  id: number;
  name: string;
  normalized_name: string;
  status: CompanyStatus;
  intel_score: SignalLevel | "";
  is_refreshing: boolean;
  description: string;
  intel: CompanyIntel | null;
  analysis: CompanyAnalysis | null;
  image_url: string | null;
  last_refreshed: string | null;
}

export interface TailoredBullet {
  id: number;
  tailored_text: string;
  category: string;
  work_experience_id?: number | null;
}

export interface TailoredSkill {
  id: number;
  name: string;
  proficiency: number;
}

export interface TailoredWorkExperience {
  id: number;
  tailored_description: string;
}

export interface TailoredProject {
  id: number;
  tailored_description: string;
}

export interface JobApplication {
  id: number;
  company_name: string;
  job_title: string;
  job_description: string;
  status: ApplicationStatus;
  notes: string;
  job_url: string;
  company: Company | null;
  tailor_status: TailorStatus;
  professional_summary: string;
  tailored_bullets: TailoredBullet[] | null;
  tailored_work_experiences: TailoredWorkExperience[] | null;
  tailored_projects: TailoredProject[] | null;
  tailored_skills: TailoredSkill[] | null;
  cover_letter: string;
  nafta_letter: string;
  nafta_letter_status: NaftaLetterStatus;
  overall_match: number | null;
  overall_match_explanation: string;
  technical_match: number | null;
  technical_match_explanation: string;
  nafta_tn_likelihood: number | null;
  nafta_tn_likelihood_explanation: string;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: SalaryCurrency | "";
  work_type: WorkType[] | null;
  location: string;
  us_citizen_or_pr_required: boolean | null;
  language_requirement_unmet: boolean | null;
  created: string;
  modified: string;
}

export interface PaginatedApplications {
  count: number;
  next: string | null;
  previous: string | null;
  results: JobApplication[];
}

export class ApplicationError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("Applications API request failed");
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApplicationError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getApplications(): Promise<PaginatedApplications> {
  return request("/api/applications");
}

export interface CreateApplicationPayload {
  company_name: string;
  job_title: string;
  job_description: string;
  status?: ApplicationStatus;
  notes?: string;
  job_url: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: SalaryCurrency | "";
  work_type?: WorkType[] | null;
  location?: string;
  us_citizen_or_pr_required?: boolean | null;
}

export function createApplication(
  payload: CreateApplicationPayload,
): Promise<JobApplication> {
  return request("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface UpdateApplicationPayload {
  company_name?: string;
  job_title?: string;
  job_description?: string;
  status?: ApplicationStatus;
  notes?: string;
  location?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: SalaryCurrency | "";
  work_type?: WorkType[] | null;
  us_citizen_or_pr_required?: boolean | null;
}

export function updateApplication(
  id: number,
  payload: UpdateApplicationPayload,
): Promise<JobApplication> {
  return request(`/api/applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteApplication(id: number): Promise<void> {
  return request(`/api/applications/${id}`, { method: "DELETE" });
}

export function getApplication(id: number): Promise<JobApplication> {
  return request(`/api/applications/${id}`);
}

export interface TailorStartResult {
  status: TailorStatus;
}

/**
 * Kicks off async resume tailoring. Returns immediately with the current
 * tailor status - the heavy LLM work runs in the background and is polled
 * via `getApplication` until `tailor_status` reaches `complete`/`failed`.
 */
export function tailorApplication(
  id: number,
  locale?: string,
): Promise<TailorStartResult> {
  return request(`/api/applications/${id}/tailor`, {
    method: "POST",
    headers: locale ? { "Accept-Language": locale } : undefined,
  });
}

export interface CoverLetterResult {
  cover_letter: string;
}

export function generateCoverLetter(
  id: number,
  bullets: TailoredBullet[],
  locale?: string,
): Promise<CoverLetterResult> {
  return request(`/api/applications/${id}/cover-letter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(locale ? { "Accept-Language": locale } : {}),
    },
    body: JSON.stringify({ bullets }),
  });
}

export interface NaftaLetterStartResult {
  status: NaftaLetterStatus;
}

export interface NaftaLetterResult {
  nafta_letter: string;
}

export interface NaftaLetterPayload {
  tn_profession?: string;
  is_continuation?: boolean;
  company_description?: string;
  hours_per_week?: number;
  duration?: string;
  passport_number?: string;
  date_of_birth?: string;
  citizenship?: string;
}

/**
 * Kicks off async NAFTA letter generation. Returns immediately with the current
 * nafta_letter_status - the heavy LLM work runs in the background and is polled
 * via `getApplication` until `nafta_letter_status` reaches `complete`/`failed`.
 */
export function generateNaftaLetter(
  id: number,
  payload: NaftaLetterPayload = {},
  locale?: string,
): Promise<NaftaLetterStartResult> {
  return request(`/api/applications/${id}/nafta-letter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(locale ? { "Accept-Language": locale } : {}),
    },
    body: JSON.stringify(payload),
  });
}

export interface MetricsResult {
  overall_match: number;
  overall_match_explanation: string;
  technical_match: number;
  technical_match_explanation: string;
  nafta_tn_likelihood: number;
  nafta_tn_likelihood_explanation: string;
}

export function refreshMetrics(
  id: number,
  locale?: string,
): Promise<MetricsResult> {
  return request(`/api/applications/${id}/metrics`, {
    method: "POST",
    headers: locale ? { "Accept-Language": locale } : undefined,
  });
}

export interface TnCategorySuggestion {
  category: string;
  likelihood: number;
  explanation: string;
}

export interface TnSuggestResult {
  suggestions: TnCategorySuggestion[];
}

export function suggestTnCategory(locale?: string): Promise<TnSuggestResult> {
  return request("/api/applications/tn-suggest", {
    method: "POST",
    headers: locale ? { "Accept-Language": locale } : undefined,
  });
}
