/**
 * Auth for edge-folio. The shared surface (login, signup, passkeys, password
 * reset) lives in `@repo/auth/client`; only the career-specific calls are here.
 *
 * Note there is no client-side user store any more. Identity comes from the
 * server via `getSession()` / `useSession()`, decoded from the access-token
 * cookie - so the first render already knows who you are.
 */
import type { TechStack } from "./career";
import {
  ApiError,
  getProfile as getSharedProfile,
  updateProfile as updateSharedProfile,
  type UserProfile as BaseUserProfile,
} from "@repo/auth/client";

export {
  ApiError,
  LoginError,
  login,
  logout,
  signUp,
  verifyEmail,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  uploadProfilePicture,
  getPasskeyCredentials,
  deletePasskeyCredential,
  registerPasskey,
  loginWithPasskey,
  type PasskeyCredential,
} from "@repo/auth/client";

/** The shared profile plus the career fields edge-folio hangs off its user. */
export interface UserProfile extends BaseUserProfile {
  job_title: string;
  years_of_experience: number | null;
  preferred_stack: TechStack[];
  phone: string;
  location: string;
  github_url: string;
  linkedin_url: string;
  summary: string;
  tn_profession: string;
  citizenship: string;
  is_staff: boolean;
}

/**
 * The full profile, including the fields too volatile or too large to carry in a
 * JWT (avatar, stack, job-search prefs). The navbar does not need this - it
 * renders from the session. The shared implementation dedupes concurrent calls,
 * which the profile page and the job-search section rely on - both ask on mount.
 */
export function getProfile(): Promise<UserProfile> {
  return getSharedProfile<UserProfile>();
}

export function updateProfile(payload: {
  first_name?: string;
  last_name?: string;
}): Promise<UserProfile> {
  return updateSharedProfile<UserProfile>(payload);
}

export async function saveOnboarding(payload: {
  job_title?: string;
  years_of_experience?: number | null;
  preferred_stack?: string[];
}): Promise<UserProfile> {
  const res = await fetch("/api/auth/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<UserProfile>;
}

export interface ResumeImportResult {
  bullets_imported: number;
  skills_imported: number;
  work_experience_imported: number;
  education_imported: number;
  projects_imported: number;
  extracted_skills: string[];
}

export async function uploadResume(file: File): Promise<ResumeImportResult> {
  const form = new FormData();
  form.append("resume", file);
  const res = await fetch("/api/auth/resume", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<ResumeImportResult>;
}

export interface JobSearchPrefs {
  job_search_include_title: boolean;
  job_search_extra_text: string;
  job_search_bilingual: boolean;
  job_search_include_tn_profession: boolean;
  job_search_include_education: boolean;
  job_search_include_years: boolean;
  job_search_include_stack: boolean;
  job_search_include_location: boolean;
  job_search_generated_query: string;
}

export async function getJobSearchPrefs(): Promise<JobSearchPrefs> {
  const res = await fetch("/api/auth/job-search-prefs");
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<JobSearchPrefs>;
}

export async function saveJobSearchPrefs(
  payload: Partial<JobSearchPrefs>,
): Promise<JobSearchPrefs> {
  const res = await fetch("/api/auth/job-search-prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<JobSearchPrefs>;
}

export async function updateContactInfo(payload: {
  phone?: string;
  location?: string;
  github_url?: string;
  linkedin_url?: string;
  summary?: string;
  tn_profession?: string;
  citizenship?: string;
}): Promise<{
  phone: string;
  location: string;
  github_url: string;
  linkedin_url: string;
  summary: string;
  tn_profession: string;
  citizenship: string;
}> {
  const res = await fetch("/api/auth/contact", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<{
    phone: string;
    location: string;
    github_url: string;
    linkedin_url: string;
    summary: string;
    tn_profession: string;
    citizenship: string;
  }>;
}
