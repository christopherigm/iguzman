"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Spinner } from "@repo/ui/core-elements/spinner";
import type { JobApplication } from "@/lib/applications";
import type { UserProfile } from "@/lib/auth";
import {
  getWorkExperiences,
  getEducations,
  getLanguages,
  getProjects,
  type WorkExperience,
  type Education,
  type Language,
  type Project,
} from "@/lib/career";
import {
  buildResumeDocumentProps,
  defaultResumeExportConfig,
  resumeExportConfigKey,
  type ResumeExportConfig,
} from "@/lib/resume-export";
import "./resume-preview.css";

const ResumePdfViewer = dynamic(() => import("./resume-pdf-viewer"), {
  ssr: false,
  loading: () => (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ height: "100%" }}
    >
      <Spinner size={24} />
    </Box>
  ),
});

interface CareerData {
  workExps: WorkExperience[];
  educations: Education[];
  languages: Language[];
  projects: Project[];
}

interface Props {
  application: JobApplication;
  profile: UserProfile | null;
  profilePictureBase64?: string;
}

function parseStoredConfig(raw: string | null): ResumeExportConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResumeExportConfig;
  } catch {
    return null;
  }
}

export function ResumePreview({
  application,
  profile,
  profilePictureBase64,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const locale = useLocale();

  const tailoredBullets = useMemo(
    () => application.tailored_bullets ?? [],
    [application.tailored_bullets],
  );
  const isTailored = tailoredBullets.length > 0;

  const [careerData, setCareerData] = useState<CareerData | null>(null);
  const [loading, setLoading] = useState(isTailored);
  // Stored "Customize Export" config (mirrors the detail page). Seeded from
  // localStorage and kept in sync via the storage event below.
  const [storedConfig, setStoredConfig] = useState<ResumeExportConfig | null>(
    () =>
      typeof window === "undefined"
        ? null
        : parseStoredConfig(
            localStorage.getItem(resumeExportConfigKey(application.id)),
          ),
  );

  // Load career collections (same data source the export uses).
  useEffect(() => {
    if (!isTailored) return;
    let active = true;
    Promise.allSettled([
      getWorkExperiences(),
      getEducations(),
      getLanguages(),
      getProjects(),
    ]).then(([workExpsRes, educationsRes, languagesRes, projectsRes]) => {
      if (!active) return;
      setCareerData({
        workExps:
          workExpsRes.status === "fulfilled" ? workExpsRes.value.results : [],
        educations:
          educationsRes.status === "fulfilled"
            ? educationsRes.value.results
            : [],
        languages:
          languagesRes.status === "fulfilled" ? languagesRes.value.results : [],
        projects:
          projectsRes.status === "fulfilled" ? projectsRes.value.results : [],
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isTailored]);

  // Read the stored config and keep it in sync when the detail page (other tab)
  // changes the export selections.
  useEffect(() => {
    const key = resumeExportConfigKey(application.id);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      setStoredConfig(parseStoredConfig(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [application.id]);

  const resumeProps = useMemo(() => {
    if (!careerData) return null;
    const config =
      storedConfig ??
      defaultResumeExportConfig({
        ...careerData,
        tailoredWorkExperiences: application.tailored_work_experiences,
        tailoredProjects: application.tailored_projects,
      });
    return buildResumeDocumentProps({
      profile,
      application,
      professionalSummary: application.professional_summary || "",
      tailoredBullets,
      tailoredWorkExperiences: application.tailored_work_experiences ?? null,
      tailoredProjects: application.tailored_projects ?? null,
      workExps: careerData.workExps,
      educations: careerData.educations,
      languages: careerData.languages,
      projects: careerData.projects,
      config,
      profilePictureBase64,
    });
  }, [
    careerData,
    storedConfig,
    application,
    profile,
    profilePictureBase64,
    tailoredBullets,
  ]);

  return (
    <Container
      paddingX={10}
      styles={{
        paddingTop: "var(--ui-navbar-height)",
        paddingBottom: "40px",
      }}
    >
      <Box marginTop={20} />
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
        marginBottom={16}
      >
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography as="h1" variant="h3" fontWeight={600}>
            {t("liveResume")}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {`${application.job_title} · ${application.company_name}`}
          </Typography>
        </Box>
        <Link
          href={`/${locale}/applications/${application.id}`}
          prefetch
          className="resume-preview__back"
        >
          ← {t("backToApplication")}
        </Link>
      </Box>

      {!isTailored ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          styles={{ minHeight: "40vh" }}
        >
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("livePreviewNotTailored")}
          </Typography>
        </Box>
      ) : (
        <Box
          styles={{
            height: "calc(100vh - var(--ui-navbar-height) - 140px)",
            minHeight: "480px",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid var(--border, #e5e7eb)",
          }}
        >
          {loading || !resumeProps ? (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              styles={{ height: "100%" }}
            >
              <Spinner size={24} label={t("livePreviewLoading")} />
            </Box>
          ) : (
            <ResumePdfViewer resumeProps={resumeProps} />
          )}
        </Box>
      )}
    </Container>
  );
}
