import type { JobApplication } from '@/lib/applications';

export type JobProvider = 'adzuna' | 'jsearch';
export type JobCountry = 'us' | 'ca' | 'mx';
export type JobWorkType = 'remote' | 'onsite' | 'hybrid';

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
  country: JobCountry | '';
  category: string;
  tags: string[] | null;
  is_private: boolean;
  created: string;
  score: number;
  saved_application_id: number | null;
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
  created: string;
  modified: string;
}

export class JobsError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Jobs API request failed');
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

export interface JobFeedFilters {
  country?: JobCountry | '';
  work_type?: JobWorkType | '';
  q?: string;
  per?: number;
  page?: number;
}

export function getJobFeed(filters: JobFeedFilters = {}): Promise<JobFeed> {
  const params = new URLSearchParams();
  if (filters.country) params.set('country', filters.country);
  if (filters.work_type) params.set('work_type', filters.work_type);
  if (filters.q) params.set('q', filters.q);
  if (filters.per) params.set('per', String(filters.per));
  if (filters.page) params.set('page', String(filters.page));
  const qs = params.toString();
  return request(`/api/jobs/feed${qs ? `?${qs}` : ''}`);
}

export function saveJob(id: number): Promise<JobApplication> {
  return request(`/api/jobs/${id}/save`, { method: 'POST' });
}

export function getJobCredentials(): Promise<JobApiCredential[]> {
  return request('/api/jobs/credentials');
}

export interface CreateCredentialPayload {
  provider: JobProvider;
  key: string;
  label?: string;
  is_active?: boolean;
}

export function createJobCredential(payload: CreateCredentialPayload): Promise<JobApiCredential> {
  return request('/api/jobs/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteJobCredential(id: number): Promise<void> {
  return request(`/api/jobs/credentials/${id}`, { method: 'DELETE' });
}
