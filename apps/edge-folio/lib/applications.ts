export type ApplicationStatus = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected';
export type WorkType = 'remote' | 'onsite' | 'hybrid';
export type SalaryCurrency = 'USD' | 'CAD' | 'EUR' | 'MXN' | 'GBP';

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
  company_image_url: string | null;
  company_description: string;
  professional_summary: string;
  tailored_bullets: TailoredBullet[] | null;
  tailored_work_experiences: TailoredWorkExperience[] | null;
  tailored_projects: TailoredProject[] | null;
  tailored_skills: TailoredSkill[] | null;
  cover_letter: string;
  nafta_letter: string;
  overall_match: number | null;
  overall_match_explanation: string;
  technical_match: number | null;
  technical_match_explanation: string;
  nafta_tn_likelihood: number | null;
  nafta_tn_likelihood_explanation: string;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: SalaryCurrency | '';
  work_type: WorkType[] | null;
  location: string;
  us_citizen_or_pr_required: boolean | null;
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
    super('Applications API request failed');
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
  return request('/api/applications');
}

export interface CreateApplicationPayload {
  company_name: string;
  job_title: string;
  job_description: string;
  status?: ApplicationStatus;
  notes?: string;
  job_url: string;
  company_image_url?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: SalaryCurrency | '';
  work_type?: WorkType[] | null;
  location?: string;
  us_citizen_or_pr_required?: boolean | null;
}

export function createApplication(payload: CreateApplicationPayload): Promise<JobApplication> {
  return request('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  salary_currency?: SalaryCurrency | '';
  work_type?: WorkType[] | null;
  us_citizen_or_pr_required?: boolean | null;
}

export function updateApplication(id: number, payload: UpdateApplicationPayload): Promise<JobApplication> {
  return request(`/api/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteApplication(id: number): Promise<void> {
  return request(`/api/applications/${id}`, { method: 'DELETE' });
}

export function getApplication(id: number): Promise<JobApplication> {
  return request(`/api/applications/${id}`);
}

export interface TailoringResult {
  bullets: TailoredBullet[];
  tailored_work_experiences: TailoredWorkExperience[];
  tailored_projects: TailoredProject[];
  professional_summary: string;
  tailored_skills: TailoredSkill[];
}

export function tailorApplication(id: number): Promise<TailoringResult> {
  return request(`/api/applications/${id}/tailor`, { method: 'POST' });
}

export interface CoverLetterResult {
  cover_letter: string;
}

export function generateCoverLetter(id: number, bullets: TailoredBullet[]): Promise<CoverLetterResult> {
  return request(`/api/applications/${id}/cover-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bullets }),
  });
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

export function generateNaftaLetter(id: number, payload: NaftaLetterPayload = {}): Promise<NaftaLetterResult> {
  return request(`/api/applications/${id}/nafta-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export function refreshMetrics(id: number): Promise<MetricsResult> {
  return request(`/api/applications/${id}/metrics`, { method: 'POST' });
}

export interface SearchCompanyResult {
  company_description: string;
  company_image_url: string | null;
}

export function searchCompany(id: number): Promise<SearchCompanyResult> {
  return request(`/api/applications/${id}/search-company`, { method: 'POST' });
}

export interface TnCategorySuggestion {
  category: string;
  likelihood: number;
  explanation: string;
}

export interface TnSuggestResult {
  suggestions: TnCategorySuggestion[];
}

export function suggestTnCategory(): Promise<TnSuggestResult> {
  return request('/api/applications/tn-suggest', { method: 'POST' });
}
