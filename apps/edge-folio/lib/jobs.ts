import type { JobApplication } from "@/lib/applications";

export type JobProvider = "adzuna" | "jsearch";
export type JobCountry = "us" | "ca" | "mx";
export type JobWorkType = "remote" | "onsite" | "hybrid";

export interface JobPosting {
  id: number;
  provider: JobProvider;
  company_name: string;
  job_title: string;
  job_description: string;
  job_url: string;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string;
  work_type: JobWorkType[] | null;
  location: string;
  country: JobCountry | "";
  category: string;
  tags: string[] | null;
  is_private: boolean;
  created: string;
  score: number;
  saved_application_id: number | null;
  // True when the current user owns this private posting and may delete it.
  is_owner: boolean;
  // Per-user LLM match metrics; only populated for private (owner-scoped) postings.
  search: number | null;
  overall_match: number | null;
  overall_match_explanation: string;
  technical_match: number | null;
  technical_match_explanation: string;
  nafta_tn_likelihood: number | null;
  nafta_tn_likelihood_explanation: string;
  us_citizen_or_pr_required: boolean | null;
}

export type JobSearchStatus = "running" | "done" | "failed";

export interface JobSearch {
  id: number;
  query: string;
  status: JobSearchStatus;
  jobs_found: number;
  metrics_completed: number;
  created: string;
}

export interface JobFeed {
  count: number;
  page: number;
  per: number;
  results: JobPosting[];
}

export interface JobApiCredential {
  id: number;
  provider: JobProvider;
  label: string;
  is_active: boolean;
  has_key: boolean;
  // Usage tracking - counted locally since providers report no quota.
  call_limit: number;
  calls_used_today: number;
  calls_remaining: number;
  usage_date: string | null;
  created: string;
  modified: string;
}

export class JobsError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("Jobs API request failed");
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new JobsError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type JobScope = "private" | "shared";

export interface JobFeedFilters {
  country?: JobCountry | "";
  work_type?: JobWorkType | "";
  scope?: JobScope;
  q?: string;
  per?: number;
  page?: number;
}

export function getJobFeed(filters: JobFeedFilters = {}): Promise<JobFeed> {
  const params = new URLSearchParams();
  if (filters.country) params.set("country", filters.country);
  if (filters.work_type) params.set("work_type", filters.work_type);
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.q) params.set("q", filters.q);
  if (filters.per) params.set("per", String(filters.per));
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return request(`/api/jobs/feed${qs ? `?${qs}` : ""}`);
}

export function saveJob(id: number): Promise<JobApplication> {
  return request(`/api/jobs/${id}/save`, { method: "POST" });
}

// Staff-only: enqueue a shared-catalog fetch on the API. Returns once the task
// is queued - new postings appear in the feed after a worker processes it.
export function triggerJobFetch(): Promise<{ detail: string }> {
  return request("/api/jobs/fetch", { method: "POST" });
}

export function getJobCredentials(): Promise<JobApiCredential[]> {
  return request("/api/jobs/credentials");
}

// The user's most recent fetch runs (newest first), used to render progress and
// poll until no search is still "running".
export function getJobSearches(): Promise<JobSearch[]> {
  return request("/api/jobs/searches");
}

export interface CreateCredentialPayload {
  provider: JobProvider;
  key: string;
  label?: string;
  is_active?: boolean;
}

export function createJobCredential(
  payload: CreateCredentialPayload,
): Promise<JobApiCredential> {
  return request("/api/jobs/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteJobCredential(id: number): Promise<void> {
  return request(`/api/jobs/credentials/${id}`, { method: "DELETE" });
}

export function deleteJob(id: number): Promise<void> {
  return request(`/api/jobs/${id}`, { method: "DELETE" });
}
