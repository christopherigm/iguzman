export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "freelance"
  | "internship";
export type DegreeType =
  | "bachelor"
  | "master"
  | "phd"
  | "associate"
  | "certificate"
  | "bootcamp"
  | "other";

export interface WorkExperience {
  id: number;
  company: string;
  title: string;
  employment_type: EmploymentType;
  location: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string;
  created: string;
  modified: string;
}

export interface Education {
  id: number;
  institution: string;
  degree: DegreeType;
  field_of_study: string;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
  gpa: number | null;
  honors: string;
  description: string;
  created: string;
  modified: string;
}

export interface WorkExperiencePayload {
  company: string;
  title: string;
  employment_type: EmploymentType;
  location: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string;
}

export interface EducationPayload {
  institution: string;
  degree: DegreeType;
  field_of_study: string;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
  gpa: number | null;
  honors: string;
  description: string;
}

interface ListResponse<T> {
  count: number;
  results: T[];
}

export class CareerError extends Error {
  constructor(
    public status: number,
    public data: Record<string, unknown>,
  ) {
    super(`Career API error ${status}`);
  }
}

async function careerFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new CareerError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Work Experience ───────────────────────────────────────────────────────────

export function getWorkExperiences(): Promise<ListResponse<WorkExperience>> {
  return careerFetch("/api/career/work-experience");
}

export function createWorkExperience(
  payload: WorkExperiencePayload,
): Promise<WorkExperience> {
  return careerFetch("/api/career/work-experience", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateWorkExperience(
  id: number,
  payload: Partial<WorkExperiencePayload>,
): Promise<WorkExperience> {
  return careerFetch(`/api/career/work-experience/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteWorkExperience(id: number): Promise<void> {
  return careerFetch(`/api/career/work-experience/${id}`, { method: "DELETE" });
}

// ── Education ─────────────────────────────────────────────────────────────────

export function getEducations(): Promise<ListResponse<Education>> {
  return careerFetch("/api/career/education");
}

export function createEducation(payload: EducationPayload): Promise<Education> {
  return careerFetch("/api/career/education", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateEducation(
  id: number,
  payload: Partial<EducationPayload>,
): Promise<Education> {
  return careerFetch(`/api/career/education/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteEducation(id: number): Promise<void> {
  return careerFetch(`/api/career/education/${id}`, { method: "DELETE" });
}

// ── Languages ─────────────────────────────────────────────────────────────────

export type LanguageProficiency =
  | "native"
  | "fluent"
  | "professional"
  | "basic";

export interface Language {
  id: number;
  name: string;
  proficiency: LanguageProficiency;
  order: number;
  created: string;
  modified: string;
}

export interface LanguagePayload {
  name: string;
  proficiency: LanguageProficiency;
  order?: number;
}

// In-flight request dedupe - the profile page and job-search section both load
// languages on mount in the same tick. Share one request and clear once it
// settles so later calls refetch fresh data. See getProfile in lib/auth.ts.
let languagesInFlight: Promise<ListResponse<Language>> | null = null;

export function getLanguages(): Promise<ListResponse<Language>> {
  if (languagesInFlight) return languagesInFlight;
  languagesInFlight = careerFetch<ListResponse<Language>>(
    "/api/career/languages",
  ).finally(() => {
    languagesInFlight = null;
  });
  return languagesInFlight;
}

export function createLanguage(payload: LanguagePayload): Promise<Language> {
  return careerFetch("/api/career/languages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateLanguage(
  id: number,
  payload: Partial<LanguagePayload>,
): Promise<Language> {
  return careerFetch(`/api/career/languages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteLanguage(id: number): Promise<void> {
  return careerFetch(`/api/career/languages/${id}`, { method: "DELETE" });
}

// ── Tech Stack ────────────────────────────────────────────────────────────────

export interface TechStack {
  id: number;
  name: string;
}

export function getTechStacks(): Promise<ListResponse<TechStack>> {
  return careerFetch("/api/career/tech-stack");
}

export function getPopularTechStacks(): Promise<ListResponse<TechStack>> {
  return careerFetch("/api/career/tech-stack/popular");
}

export function createTechStack(name: string): Promise<TechStack> {
  return careerFetch("/api/career/tech-stack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  url: string;
  description: string;
  tech_stack: TechStack[];
  order: number;
  created: string;
  modified: string;
}

export interface ProjectPayload {
  name: string;
  url?: string;
  description?: string;
  tech_stack?: number[];
  order?: number;
}

export function getProjects(): Promise<ListResponse<Project>> {
  return careerFetch("/api/career/projects");
}

export function createProject(payload: ProjectPayload): Promise<Project> {
  return careerFetch("/api/career/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateProject(
  id: number,
  payload: Partial<ProjectPayload>,
): Promise<Project> {
  return careerFetch(`/api/career/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteProject(id: number): Promise<void> {
  return careerFetch(`/api/career/projects/${id}`, { method: "DELETE" });
}
