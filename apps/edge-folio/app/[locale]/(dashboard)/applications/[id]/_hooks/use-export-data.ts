"use client";

import { useEffect, useRef, useState } from "react";
import {
  getWorkExperiences,
  getEducations,
  getLanguages,
  getProjects,
} from "@/lib/career";
import { getSkills } from "@/lib/matrix";
import type { ExportData } from "../detail-constants";

/**
 * Loads the user's career sections up-front (once on mount) so the user can
 * choose which items feed the LLM tailoring and the resume export. Also owns
 * the per-section inclusion sets and the global "Customize Export" toggles.
 */
export function useExportData() {
  const fetchRef = useRef(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportDataLoading, setExportDataLoading] = useState(false);

  // Global export toggles
  const [includeContact, setIncludeContact] = useState(true);
  const [includeLinks, setIncludeLinks] = useState(true);
  // Section-level switch on the "Technical Skills" tailored card: omit the
  // whole skills section from the export.
  const [includeSkills, setIncludeSkills] = useState(true);
  const [includePhoto, setIncludePhoto] = useState(false);

  // Per-section inclusion sets
  const [includedWorkExpIds, setIncludedWorkExpIds] = useState<Set<number>>(
    new Set(),
  );
  const [includedEducationIds, setIncludedEducationIds] = useState<Set<number>>(
    new Set(),
  );
  const [includedLanguageIds, setIncludedLanguageIds] = useState<Set<number>>(
    new Set(),
  );
  const [includedProjectIds, setIncludedProjectIds] = useState<Set<number>>(
    new Set(),
  );
  // Which Matrix skills feed the LLM tailoring. Defaults to every skill; there
  // is no longer a UI to narrow this — the user refines the resulting tailored
  // skills afterward on the "Technical Skills" card.
  const [includedSkillIds, setIncludedSkillIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    setExportDataLoading(true);
    Promise.allSettled([
      getWorkExperiences(),
      getEducations(),
      getLanguages(),
      getProjects(),
      getSkills(),
    ]).then(
      ([workExpsRes, educationsRes, languagesRes, projectsRes, skillsRes]) => {
        const workExps =
          workExpsRes.status === "fulfilled" ? workExpsRes.value.results : [];
        const educations =
          educationsRes.status === "fulfilled"
            ? educationsRes.value.results
            : [];
        const languages =
          languagesRes.status === "fulfilled" ? languagesRes.value.results : [];
        const projects =
          projectsRes.status === "fulfilled" ? projectsRes.value.results : [];
        const skills =
          skillsRes.status === "fulfilled" ? skillsRes.value.results : [];
        setExportData({ workExps, educations, languages, projects, skills });
        setIncludedWorkExpIds(new Set(workExps.map((e) => e.id)));
        setIncludedEducationIds(new Set(educations.map((e) => e.id)));
        setIncludedLanguageIds(new Set(languages.map((l) => l.id)));
        setIncludedProjectIds(new Set(projects.map((p) => p.id)));
        setIncludedSkillIds(new Set(skills.map((s) => s.id)));
        setExportDataLoading(false);
      },
    );
  }, []);

  return {
    exportData,
    exportDataLoading,
    includeContact,
    setIncludeContact,
    includeLinks,
    setIncludeLinks,
    includeSkills,
    setIncludeSkills,
    includePhoto,
    setIncludePhoto,
    includedWorkExpIds,
    setIncludedWorkExpIds,
    includedEducationIds,
    setIncludedEducationIds,
    includedLanguageIds,
    setIncludedLanguageIds,
    includedProjectIds,
    setIncludedProjectIds,
    includedSkillIds,
    setIncludedSkillIds,
  };
}

export type ExportDataController = ReturnType<typeof useExportData>;
