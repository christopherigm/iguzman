"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@repo/i18n/navigation";
import {
  tailorApplication,
  updateTailoredContent,
  generateCoverLetter,
  getApplication,
  type JobApplication,
  type TailoredBullet,
  type TailoredWorkExperience,
  type TailoredProject,
} from "@/lib/applications";
import type { UserProfile } from "@/lib/auth";
import { buildResumeMarkdown, downloadMarkdown } from "@/lib/resume-markdown";
import {
  buildResumeDocumentProps,
  resumeExportConfigKey,
  type ResumeExportConfig,
} from "@/lib/resume-export";
import { groupByCategory } from "../detail-constants";
import type { EnhanceMessage } from "../_components/tailored-editable-card";
import type { EnhanceOptions } from "@/components/enhance/enhance-options-modal";
import { buildEnhance } from "@/lib/enhance-prompts";
import type { ExportDataController } from "./use-export-data";
import type { ShowToast } from "./use-toast";

interface Params {
  app: JobApplication;
  setApp: (app: JobApplication) => void;
  profile: UserProfile | null;
  profilePictureBase64?: string;
  exportCtl: ExportDataController;
  showToast: ShowToast;
}

/**
 * The full "tailor → edit → export" workflow. These concerns are tightly
 * coupled (a re-tailor resets the cover letter and edit buffers; the resume
 * export reads the effective, user-edited tailored content and the cover
 * letter), so they live together behind one hook that the container wires to
 * the Review/Tailor and Cover-letter sections.
 */
export function useTailoringWorkflow({
  app,
  setApp,
  profile,
  profilePictureBase64,
  exportCtl,
  showToast,
}: Params) {
  const t = useTranslations("ApplicationDetailPage");
  const locale = useLocale();

  // ── Tailoring results ──
  const [tailoring, setTailoring] = useState(false);
  const [tailoredBullets, setTailoredBullets] = useState<
    TailoredBullet[] | null
  >(app.tailored_bullets ?? null);
  const [tailoredWorkExperiences, setTailoredWorkExperiences] = useState<
    TailoredWorkExperience[] | null
  >(app.tailored_work_experiences ?? null);
  const [tailoredProjects, setTailoredProjects] = useState<
    TailoredProject[] | null
  >(app.tailored_projects ?? null);
  const [professionalSummary, setProfessionalSummary] = useState(
    app.professional_summary || "",
  );
  // Last persisted summary — baseline for the editable summary card's dirty check.
  const [savedSummary, setSavedSummary] = useState(
    app.professional_summary || "",
  );
  const [tailorError, setTailorError] = useState<string | null>(null);
  // Free-text guidance appended to the tailoring prompt (optional).
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const tailorPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cover letter ──
  const [generatingCL, setGeneratingCL] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(
    app.cover_letter || null,
  );
  const [clError, setClError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Free-text guidance appended to the cover-letter prompt (optional).
  const [clAdditionalPrompt, setClAdditionalPrompt] = useState("");

  // ── Tailored-results editing ──
  // Tailored-bullet categories (impact/technical/…) toggled OUT of the export.
  const [excludedBulletCats, setExcludedBulletCats] = useState<Set<string>>(
    new Set(),
  );
  // Sparse edit overrides keyed by category / work-experience id / project id.
  const [bulletEdits, setBulletEdits] = useState<Record<string, string>>({});
  const [weEdits, setWeEdits] = useState<Record<number, string>>({});
  const [projectEdits, setProjectEdits] = useState<Record<number, string>>({});
  // Which card is currently persisting ("bullets" | "summary" | `we:<id>` | `project:<id>`).
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [useTailoredWeIds, setUseTailoredWeIds] = useState<Set<number>>(
    new Set((app.tailored_work_experiences ?? []).map((e) => e.id)),
  );
  const [useTailoredProjectIds, setUseTailoredProjectIds] = useState<
    Set<number>
  >(new Set((app.tailored_projects ?? []).map((p) => p.id)));
  // Which AI-tailored skills to keep in the export. Pre-selected with every
  // skill the LLM returned; the user confirms/unselects individual chips.
  const [includedTailoredSkillIds, setIncludedTailoredSkillIds] = useState<
    Set<number>
  >(new Set((app.tailored_skills ?? []).map((s) => s.id)));
  // Last persisted skill selection — baseline for the skills card's dirty check.
  const [savedTailoredSkillIds, setSavedTailoredSkillIds] = useState<
    Set<number>
  >(new Set((app.tailored_skills ?? []).map((s) => s.id)));

  // ── Export ──
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function applyTailoredResult(data: JobApplication) {
    // A fresh result supersedes any in-progress edits / exclusions.
    setBulletEdits({});
    setWeEdits({});
    setProjectEdits({});
    setExcludedBulletCats(new Set());
    setTailoredBullets(data.tailored_bullets ?? null);
    setTailoredWorkExperiences(data.tailored_work_experiences ?? null);
    setTailoredProjects(data.tailored_projects ?? null);
    setProfessionalSummary(data.professional_summary || "");
    setSavedSummary(data.professional_summary || "");
    setApp(data);
    setUseTailoredWeIds(
      new Set((data.tailored_work_experiences ?? []).map((e) => e.id)),
    );
    setUseTailoredProjectIds(
      new Set((data.tailored_projects ?? []).map((p) => p.id)),
    );
    setIncludedTailoredSkillIds(
      new Set((data.tailored_skills ?? []).map((s) => s.id)),
    );
    setSavedTailoredSkillIds(
      new Set((data.tailored_skills ?? []).map((s) => s.id)),
    );
  }

  function stopTailorPolling() {
    if (tailorPollingRef.current) {
      clearTimeout(tailorPollingRef.current);
      tailorPollingRef.current = null;
    }
  }

  // Poll the tailoring status until it reaches a terminal state. The LLM
  // pipeline can take several minutes, so the request only kicks off the job
  // (returns immediately) and the result is fetched here when complete.
  function startTailorPolling(appId: number) {
    if (tailorPollingRef.current) return;
    setTailoring(true);
    let errorCount = 0;

    const schedule = () => {
      tailorPollingRef.current = setTimeout(async () => {
        try {
          const data = await getApplication(appId);
          if (data.tailor_status === "complete") {
            applyTailoredResult(data);
            setTailoring(false);
            tailorPollingRef.current = null;
            return;
          }
          if (data.tailor_status === "failed") {
            setTailorError(t("errorTailor"));
            setTailoring(false);
            tailorPollingRef.current = null;
            return;
          }
          errorCount = 0;
        } catch {
          errorCount++;
          if (errorCount >= 3) {
            setTailorError(t("errorTailor"));
            setTailoring(false);
            stopTailorPolling();
            return;
          }
        }
        if (tailorPollingRef.current !== null) schedule();
      }, 5000);
    };

    schedule();
  }

  // Resume polling if the tailoring job was already running when the page loaded.
  useEffect(() => {
    if (app.tailor_status === "processing") {
      startTailorPolling(app.id);
    }
    return () => stopTailorPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTailor() {
    setTailoring(true);
    setTailorError(null);
    setCoverLetter(null);
    try {
      const result = await tailorApplication(app.id, locale, {
        work_experience_ids: [...exportCtl.includedWorkExpIds],
        project_ids: [...exportCtl.includedProjectIds],
        skill_ids: [...exportCtl.includedSkillIds],
        additional_prompt: additionalPrompt.trim() || undefined,
      });
      if (result.status === "complete") {
        // Eager (no broker) path: work already finished - fetch the result.
        const data = await getApplication(app.id);
        applyTailoredResult(data);
        setTailoring(false);
      } else if (result.status === "failed") {
        setTailorError(t("errorTailor"));
        setTailoring(false);
      } else {
        startTailorPolling(app.id);
      }
    } catch {
      setTailorError(t("errorTailor"));
      setTailoring(false);
    }
  }

  async function handleGenerateCL() {
    if (!tailoredBullets) return;
    setGeneratingCL(true);
    setClError(null);
    try {
      const result = await generateCoverLetter(
        app.id,
        tailoredBullets,
        locale,
        clAdditionalPrompt,
      );
      setCoverLetter(result.cover_letter);
      setCopied(false);
    } catch {
      setClError(t("errorCoverLetter"));
    } finally {
      setGeneratingCL(false);
    }
  }

  async function handleCopy() {
    if (!coverLetter) return;
    await navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Effective tailored content (raw tailored data + the user's edit buffers) ──
  function effectiveTailoredBullets(): TailoredBullet[] {
    if (!tailoredBullets) return [];
    const grouped = groupByCategory(tailoredBullets);
    const out: TailoredBullet[] = [];
    let idc = 1;
    for (const { cat, bullets } of grouped) {
      const buf = bulletEdits[cat];
      const texts =
        buf !== undefined
          ? buf
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : bullets.map((b) => b.tailored_text);
      texts.forEach((text, i) => {
        out.push({
          id: idc++,
          tailored_text: text,
          category: cat,
          work_experience_id: bullets[i]?.work_experience_id ?? null,
        });
      });
    }
    return out;
  }

  function effectiveTailoredWorkExperiences(): TailoredWorkExperience[] | null {
    if (!tailoredWorkExperiences) return null;
    return tailoredWorkExperiences.map((twe) => ({
      ...twe,
      tailored_description: weEdits[twe.id] ?? twe.tailored_description,
    }));
  }

  function effectiveTailoredProjects(): TailoredProject[] | null {
    if (!tailoredProjects) return null;
    return tailoredProjects.map((tp) => ({
      ...tp,
      tailored_description: projectEdits[tp.id] ?? tp.tailored_description,
    }));
  }

  // ── Dirty checks (has a card's buffer diverged from the saved value?) ──
  const weDirty = (twe: TailoredWorkExperience) =>
    (weEdits[twe.id] ?? twe.tailored_description) !== twe.tailored_description;
  const projectDirty = (tp: TailoredProject) =>
    (projectEdits[tp.id] ?? tp.tailored_description) !==
    tp.tailored_description;
  const skillsDirty =
    includedTailoredSkillIds.size !== savedTailoredSkillIds.size ||
    [...includedTailoredSkillIds].some((id) => !savedTailoredSkillIds.has(id));

  // ── Persist edits per card. Each save writes its whole section (all bullet
  //    categories, or all WE / project descriptions) since they share one field. ──
  async function handleSaveBullets() {
    setSavingCard("bullets");
    try {
      const updated = await updateTailoredContent(app.id, {
        tailored_bullets: effectiveTailoredBullets(),
      });
      setBulletEdits({});
      setTailoredBullets(updated.tailored_bullets ?? null);
      showToast(t("savedToast"), "success");
    } catch {
      showToast(t("errorSave"), "error");
    } finally {
      setSavingCard(null);
    }
  }

  async function handleSaveWorkExperiences(cardKey: string) {
    setSavingCard(cardKey);
    try {
      const updated = await updateTailoredContent(app.id, {
        tailored_work_experiences: effectiveTailoredWorkExperiences() ?? [],
      });
      setWeEdits({});
      setTailoredWorkExperiences(updated.tailored_work_experiences ?? null);
      showToast(t("savedToast"), "success");
    } catch {
      showToast(t("errorSave"), "error");
    } finally {
      setSavingCard(null);
    }
  }

  async function handleSaveSummary() {
    setSavingCard("summary");
    try {
      const updated = await updateTailoredContent(app.id, {
        professional_summary: professionalSummary,
      });
      const saved = updated.professional_summary || "";
      setProfessionalSummary(saved);
      setSavedSummary(saved);
      showToast(t("savedToast"), "success");
    } catch {
      showToast(t("errorSave"), "error");
    } finally {
      setSavingCard(null);
    }
  }

  async function handleSaveSkills() {
    setSavingCard("skills");
    try {
      const updated = await updateTailoredContent(app.id, {
        tailored_skill_ids: [...includedTailoredSkillIds],
      });
      const savedIds = new Set(
        (updated.tailored_skills ?? []).map((s) => s.id),
      );
      setIncludedTailoredSkillIds(savedIds);
      setSavedTailoredSkillIds(savedIds);
      showToast(t("savedToast"), "success");
    } catch {
      showToast(t("errorSave"), "error");
    } finally {
      setSavingCard(null);
    }
  }

  async function handleSaveProjects(cardKey: string) {
    setSavingCard(cardKey);
    try {
      const updated = await updateTailoredContent(app.id, {
        tailored_projects: effectiveTailoredProjects() ?? [],
      });
      setProjectEdits({});
      setTailoredProjects(updated.tailored_projects ?? null);
      showToast(t("savedToast"), "success");
    } catch {
      showToast(t("errorSave"), "error");
    } finally {
      setSavingCard(null);
    }
  }

  // ── Enhance prompts (streaming AI rewrite) ──
  // All wording lives in the shared builder (lib/enhance-prompts.ts); these
  // thin wrappers just bind the target role and the tailoring kind.
  const ctx = `${app.job_title} at ${app.company_name}`;

  function buildBulletEnhance(
    text: string,
    opts?: EnhanceOptions,
  ): EnhanceMessage[] {
    return buildEnhance({
      kind: "roleBullets",
      locale,
      text,
      opts,
      roleCtx: ctx,
    });
  }

  function buildSummaryEnhance(
    text: string,
    opts?: EnhanceOptions,
  ): EnhanceMessage[] {
    return buildEnhance({
      kind: "roleSummary",
      locale,
      text,
      opts,
      roleCtx: ctx,
    });
  }

  function buildDescriptionEnhance(
    text: string,
    opts?: EnhanceOptions,
  ): EnhanceMessage[] {
    return buildEnhance({
      kind: "roleDescription",
      locale,
      text,
      opts,
      roleCtx: ctx,
    });
  }

  // ── Export config (shared with the PDF builder + persisted for the Live
  //    Resume preview tab, which live-updates via the `storage` event). ──
  const exportConfig: ResumeExportConfig = {
    includeContact: exportCtl.includeContact,
    includeLinks: exportCtl.includeLinks,
    includeSkills: exportCtl.includeSkills,
    includePhoto: exportCtl.includePhoto,
    includedWorkExpIds: [...exportCtl.includedWorkExpIds],
    includedEducationIds: [...exportCtl.includedEducationIds],
    includedLanguageIds: [...exportCtl.includedLanguageIds],
    includedProjectIds: [...exportCtl.includedProjectIds],
    includedBulletCategories: Array.from(
      new Set((tailoredBullets ?? []).map((b) => b.category || "other")),
    ).filter((c) => !excludedBulletCats.has(c)),
    useTailoredWeIds: [...useTailoredWeIds],
    useTailoredProjectIds: [...useTailoredProjectIds],
    includedTailoredSkillIds: [...includedTailoredSkillIds],
  };
  const exportConfigJson = JSON.stringify(exportConfig);
  const { exportData } = exportCtl;

  useEffect(() => {
    if (typeof window === "undefined" || !exportData) return;
    try {
      localStorage.setItem(resumeExportConfigKey(app.id), exportConfigJson);
    } catch {
      // localStorage unavailable (private mode / quota) - preview falls back
      // to defaults; export still works.
    }
  }, [exportConfigJson, exportData, app.id]);

  function buildResumeProps() {
    if (!tailoredBullets || !exportData) return null;
    return buildResumeDocumentProps({
      profile,
      application: app,
      professionalSummary,
      tailoredBullets: effectiveTailoredBullets(),
      tailoredWorkExperiences: effectiveTailoredWorkExperiences(),
      tailoredProjects: effectiveTailoredProjects(),
      workExps: exportData.workExps,
      educations: exportData.educations,
      languages: exportData.languages,
      projects: exportData.projects,
      allSkills: exportData.skills,
      config: exportConfig,
      profilePictureBase64,
    });
  }

  function openLiveResume() {
    // Ensure the latest config is stored before the new tab reads it.
    try {
      localStorage.setItem(resumeExportConfigKey(app.id), exportConfigJson);
    } catch {
      // ignore - preview falls back to defaults
    }
    // A raw browser navigation, not a `Link`, so nothing prefixes the locale for
    // us - and an unprefixed path would make the proxy resolve one from the
    // `NEXT_LOCALE` cookie, costing a redirect. `getPathname` is the sanctioned
    // way to build a prefixed URL outside a `Link`; never hand-interpolate it.
    window.open(
      getPathname({ href: `/applications/${app.id}/resume`, locale }),
      "_self",
      "noopener,noreferrer",
    );
  }

  async function handleExportPDF() {
    const resumeProps = buildResumeProps();
    if (!resumeProps) return;
    setExportingPDF(true);
    setExportError(null);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ResumeDocument } = await import("../_components/resume-pdf");

      const blob = await pdf(<ResumeDocument {...resumeProps} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app.company_name}-${app.job_title}-resume.pdf`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t("errorExport"));
    } finally {
      setExportingPDF(false);
    }
  }

  function handleExportMarkdown() {
    const resumeProps = buildResumeProps();
    if (!resumeProps) return;

    const md = buildResumeMarkdown({
      fullName: resumeProps.fullName,
      email: resumeProps.email,
      jobTitle: resumeProps.jobTitle,
      phone: exportCtl.includeContact ? profile?.phone : undefined,
      location: exportCtl.includeContact ? profile?.location : undefined,
      githubUrl: exportCtl.includeLinks ? profile?.github_url : undefined,
      linkedinUrl: exportCtl.includeLinks ? profile?.linkedin_url : undefined,
      summary: professionalSummary || undefined,
      targetRole: app.job_title,
      targetCompany: app.company_name,
      tailoredBullets: resumeProps.tailoredBullets,
      coverLetter: coverLetter ?? undefined,
      skills:
        resumeProps.skills && resumeProps.skills.length > 0
          ? resumeProps.skills
          : undefined,
      workExperiences: resumeProps.workExperiences,
      educations: resumeProps.educations,
      languages: resumeProps.languages,
      projects: resumeProps.projects,
    });
    const filename =
      `${app.company_name}-${app.job_title}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-") + ".md";
    downloadMarkdown(md, filename);
  }

  const grouped = tailoredBullets ? groupByCategory(tailoredBullets) : [];

  return {
    // tailoring results
    tailoring,
    tailoredBullets,
    tailoredWorkExperiences,
    tailoredProjects,
    grouped,
    professionalSummary,
    setProfessionalSummary,
    savedSummary,
    tailorError,
    additionalPrompt,
    setAdditionalPrompt,
    handleTailor,
    // edits
    excludedBulletCats,
    setExcludedBulletCats,
    includedTailoredSkillIds,
    setIncludedTailoredSkillIds,
    bulletEdits,
    setBulletEdits,
    weEdits,
    setWeEdits,
    projectEdits,
    setProjectEdits,
    savingCard,
    weDirty,
    projectDirty,
    skillsDirty,
    handleSaveBullets,
    handleSaveWorkExperiences,
    handleSaveSummary,
    handleSaveProjects,
    handleSaveSkills,
    // enhance prompts
    buildBulletEnhance,
    buildSummaryEnhance,
    buildDescriptionEnhance,
    // cover letter
    coverLetter,
    setCoverLetter,
    generatingCL,
    clError,
    copied,
    clAdditionalPrompt,
    setClAdditionalPrompt,
    handleGenerateCL,
    handleCopy,
    // export
    exportingPDF,
    exportError,
    openLiveResume,
    handleExportPDF,
    handleExportMarkdown,
  };
}

export type TailoringWorkflow = ReturnType<typeof useTailoringWorkflow>;
