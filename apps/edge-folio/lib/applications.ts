export type ApplicationStatus = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected';

export interface TailoredBullet {
  id: number;
  tailored_text: string;
  category: string;
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
  tailored_bullets: TailoredBullet[] | null;
  cover_letter: string;
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
