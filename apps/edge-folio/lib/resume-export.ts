import type {
  JobApplication,
  TailoredBullet,
  TailoredSkill,
  TailoredWorkExperience,
  TailoredProject,
} from "./applications";
import type { UserProfile } from "./auth";
import type { WorkExperience, Education, Language, Project } from "./career";
import type { Skill } from "./matrix";

/**
 * Props for the resume PDF document (`ResumeDocument` in
 * `applications/[id]/_components/resume-pdf.tsx`). Defined here in the data layer
 * because it's the shared contract between the export util that builds these
 * props and the presentational PDF component that consumes them.
 */
export interface ResumePDFProps {
  // Header
  fullName: string;
  jobTitle: string;
  email: string;
  phone?: string;
  location?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  // Profile photo (base64 data URI or absolute URL)
  photoUrl?: string;
  // Summary
  summary?: string;
  // Skills (flat list, sorted by proficiency desc)
  skills?: Pick<Skill, "name" | "proficiency">[];
  // Experience
  workExperiences?: WorkExperience[];
  targetRole: string;
  targetCompany: string;
  tailoredBullets: TailoredBullet[];
  // Projects
  projects?: Project[];
  // Education
  educations?: Education[];
  // Languages
  languages?: Language[];
}

/**
 * Serializable snapshot of the "Customize Export" toggles on the application
 * detail page. The detail page writes this to `localStorage` so the Live Resume
 * preview (opened in a separate tab) can reproduce the exact same resume the
 * "Export PDF" button would generate. Sets are stored as arrays for JSON.
 */
export interface ResumeExportConfig {
  includeContact: boolean;
  includeLinks: boolean;
  includeSkills: boolean;
  includePhoto: boolean;
  includedWorkExpIds: number[];
  includedEducationIds: number[];
  includedLanguageIds: number[];
  includedProjectIds: number[];
  /**
   * Tailored-bullet categories (`impact`, `technical`, …) to keep in the export.
   * Omitted/undefined means "include every category" for backward compatibility
   * with configs persisted before this field existed.
   */
  includedBulletCategories?: string[];
  useTailoredWeIds: number[];
  useTailoredProjectIds: number[];
  /**
   * AI-tailored skill ids to keep in the export. Omitted/undefined means
   * "include every tailored skill" for backward compatibility with configs
   * persisted before this field existed.
   */
  includedTailoredSkillIds?: number[];
}

/** localStorage key for a given application's export config. */
export function resumeExportConfigKey(appId: number): string {
  return `edgefolio:resume-export-config:${appId}`;
}

/**
 * Default config used when no stored config exists (e.g. the preview tab is
 * opened directly): include everything and prefer the AI-tailored versions,
 * matching the detail page's initial state.
 */
export function defaultResumeExportConfig(args: {
  workExps: WorkExperience[];
  educations: Education[];
  languages: Language[];
  projects: Project[];
  tailoredBullets?: TailoredBullet[] | null;
  tailoredWorkExperiences?: TailoredWorkExperience[] | null;
  tailoredProjects?: TailoredProject[] | null;
  tailoredSkills?: TailoredSkill[] | null;
}): ResumeExportConfig {
  const categories = Array.from(
    new Set((args.tailoredBullets ?? []).map((b) => b.category || "other")),
  );
  return {
    includeContact: true,
    includeLinks: true,
    includeSkills: true,
    includePhoto: false,
    includedWorkExpIds: args.workExps.map((e) => e.id),
    includedEducationIds: args.educations.map((e) => e.id),
    includedLanguageIds: args.languages.map((l) => l.id),
    includedProjectIds: args.projects.map((p) => p.id),
    includedBulletCategories: categories,
    useTailoredWeIds: (args.tailoredWorkExperiences ?? []).map((e) => e.id),
    useTailoredProjectIds: (args.tailoredProjects ?? []).map((p) => p.id),
    includedTailoredSkillIds: (args.tailoredSkills ?? []).map((s) => s.id),
  };
}

export interface BuildResumeDocumentArgs {
  profile: UserProfile | null;
  application: Pick<
    JobApplication,
    "job_title" | "company_name" | "tailored_skills"
  >;
  professionalSummary: string;
  tailoredBullets: TailoredBullet[];
  tailoredWorkExperiences: TailoredWorkExperience[] | null;
  tailoredProjects: TailoredProject[] | null;
  workExps: WorkExperience[];
  educations: Education[];
  languages: Language[];
  projects: Project[];
  config: ResumeExportConfig;
  /**
   * The full set of the user's Matrix skills. The "Technical Skills" export
   * section is built from this list filtered by `config.includedTailoredSkillIds`,
   * so the user can keep skills the LLM omitted. Falls back to
   * `application.tailored_skills` when not provided (older callers / stored data).
   */
  allSkills?: TailoredSkill[];
  /** base64 data URI for the profile photo (only used when includePhoto). */
  profilePictureBase64?: string;
}

/**
 * Build the props for `<ResumeDocument>` from the raw career/tailoring data and
 * the export config. This is the single source of truth shared by the detail
 * page's "Export PDF" action and the Live Resume preview, so both render an
 * identical resume.
 */
export function buildResumeDocumentProps(
  args: BuildResumeDocumentArgs,
): ResumePDFProps {
  const {
    profile,
    application,
    professionalSummary,
    tailoredBullets,
    tailoredWorkExperiences,
    tailoredProjects,
    workExps,
    educations,
    languages,
    projects,
    config,
    allSkills,
    profilePictureBase64,
  } = args;

  const includedWorkExpIds = new Set(config.includedWorkExpIds);
  const includedEducationIds = new Set(config.includedEducationIds);
  const includedLanguageIds = new Set(config.includedLanguageIds);
  const includedProjectIds = new Set(config.includedProjectIds);
  const useTailoredWeIds = new Set(config.useTailoredWeIds);
  const useTailoredProjectIds = new Set(config.useTailoredProjectIds);

  const tailoredWeMap = new Map(
    (tailoredWorkExperiences ?? []).map((t) => [t.id, t.tailored_description]),
  );
  const tailoredProjectMap = new Map(
    (tailoredProjects ?? []).map((t) => [t.id, t.tailored_description]),
  );

  // The card lets the user pick from *all* their Matrix skills (pre-selected
  // with the LLM's picks), so the export source is the full list when provided.
  // A missing `includedTailoredSkillIds` (old stored config) means "keep all",
  // and for that legacy path we keep the original tailored-only source.
  const includedSkillIdSet = config.includedTailoredSkillIds
    ? new Set(config.includedTailoredSkillIds)
    : null;
  const skillSource = includedSkillIdSet
    ? (allSkills ?? application.tailored_skills ?? [])
    : (application.tailored_skills ?? []);
  const skills: TailoredSkill[] = config.includeSkills
    ? skillSource.filter(
        (s) => !includedSkillIdSet || includedSkillIdSet.has(s.id),
      )
    : [];

  // Keep only bullets whose category is still switched on. A missing
  // `includedBulletCategories` (old stored config) means "keep all".
  const bulletCats = config.includedBulletCategories;
  const includedCatSet = bulletCats ? new Set(bulletCats) : null;
  const filteredBullets = includedCatSet
    ? tailoredBullets.filter((b) => includedCatSet.has(b.category || "other"))
    : tailoredBullets;

  const filteredWorkExps = workExps
    .filter((e) => includedWorkExpIds.has(e.id))
    .map((e) => ({
      ...e,
      description: useTailoredWeIds.has(e.id)
        ? (tailoredWeMap.get(e.id) ?? e.description)
        : e.description,
    }));

  const filteredEducations = educations.filter((e) =>
    includedEducationIds.has(e.id),
  );

  const filteredLanguages = languages.filter((l) =>
    includedLanguageIds.has(l.id),
  );

  const filteredProjects = projects
    .filter((p) => includedProjectIds.has(p.id))
    .map((p) => ({
      ...p,
      description: useTailoredProjectIds.has(p.id)
        ? (tailoredProjectMap.get(p.id) ?? p.description)
        : p.description,
    }));

  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
      profile.email
    : "Candidate";

  return {
    fullName,
    email: config.includeContact ? (profile?.email ?? "") : "",
    jobTitle: profile?.job_title ?? "",
    phone: config.includeContact ? (profile?.phone ?? "") : "",
    location: config.includeContact ? (profile?.location ?? "") : "",
    githubUrl: config.includeLinks ? (profile?.github_url ?? "") : "",
    linkedinUrl: config.includeLinks ? (profile?.linkedin_url ?? "") : "",
    photoUrl: config.includePhoto ? profilePictureBase64 : undefined,
    summary: professionalSummary || (profile?.summary ?? "") || undefined,
    skills,
    workExperiences: filteredWorkExps,
    targetRole: application.job_title,
    targetCompany: application.company_name,
    tailoredBullets: filteredBullets,
    projects: filteredProjects,
    educations: filteredEducations,
    languages: filteredLanguages,
  };
}
