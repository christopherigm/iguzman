import type { SkeletonJson } from './skeleton-json';

export type Category = 'impact' | 'technical' | 'leadership' | 'collaboration' | 'other';
export type Source = 'manual' | 'extracted';

export interface Skill {
  id: number;
  name: string;
  proficiency: number;
  created: string;
  modified: string;
}

export interface BulletPoint {
  id: number;
  text: string;
  category: Category;
  source: Source;
  is_approved: boolean;
  order: number;
  skills: Skill[];
  created: string;
  modified: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export class MatrixError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Matrix API request failed');
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new MatrixError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Skills ────────────────────────────────────────────────────────────────────

export function getSkills(): Promise<PaginatedResponse<Skill>> {
  return request('/api/matrix/skills');
}

export function createSkill(payload: { name: string; proficiency: number }): Promise<Skill> {
  return request('/api/matrix/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateSkill(id: number, payload: Partial<{ name: string; proficiency: number }>): Promise<Skill> {
  return request(`/api/matrix/skills/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteSkill(id: number): Promise<void> {
  return request(`/api/matrix/skills/${id}`, { method: 'DELETE' });
}

// ── Bullet points ─────────────────────────────────────────────────────────────

export function getBullets(): Promise<PaginatedResponse<BulletPoint>> {
  return request('/api/matrix/bullets');
}

export interface CreateBulletPayload {
  text: string;
  category: Category;
  source?: Source;
  is_approved?: boolean;
  order?: number;
  skill_ids?: number[];
}

export function createBullet(payload: CreateBulletPayload): Promise<BulletPoint> {
  return request('/api/matrix/bullets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface UpdateBulletPayload {
  text?: string;
  category?: Category;
  source?: Source;
  is_approved?: boolean;
  order?: number;
  skill_ids?: number[];
}

export function updateBullet(id: number, payload: UpdateBulletPayload): Promise<BulletPoint> {
  return request(`/api/matrix/bullets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteBullet(id: number): Promise<void> {
  return request(`/api/matrix/bullets/${id}`, { method: 'DELETE' });
}

// ── Skeleton synthesis ────────────────────────────────────────────────────────

export interface DraftBullet {
  text: string;
  category: Category;
  skills: string[];
}

export interface SynthesisResult {
  drafts: DraftBullet[];
}

export function synthesizeSkeleton(skeleton: SkeletonJson): Promise<SynthesisResult> {
  return request('/api/matrix/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skeleton),
  });
}
