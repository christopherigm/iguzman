"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  getProfile,
  saveOnboarding,
  uploadResume,
  type ResumeImportResult,
} from "@/lib/auth";

// ── Skills diff panel ──────────────────────────────────────────────────────────

function SkillsDiffPanel({
  newSkills,
  selected,
  onToggle,
  onAdd,
  saving,
}: {
  newSkills: string[];
  selected: Set<string>;
  onToggle: (skill: string) => void;
  onAdd: () => void;
  saving: boolean;
}) {
  const t = useTranslations("ProfilePage");

  if (newSkills.length === 0) {
    return (
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("skillsDiffNone")}
      </Typography>
    );
  }

  return (
    <Box
      className="profile__diff-panel"
      display="flex"
      flexDirection="column"
      gap={12}
    >
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography variant="body" fontWeight={700}>
          {t("skillsDiffTitle", { count: newSkills.length })}
        </Typography>
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {t("skillsDiffSubtitle")}
        </Typography>
      </Box>
      <Box display="flex" flexWrap="wrap" gap={6}>
        {newSkills.map((skill) => (
          <Button
            key={skill}
            unstyled
            type="button"
            className={[
              "profile__suggestion",
              selected.has(skill) ? "profile__suggestion--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onToggle(skill)}
          >
            {skill}
          </Button>
        ))}
      </Box>
      <Button
        text={
          saving
            ? t("skillsDiffAdding")
            : t("skillsDiffAdd", { count: selected.size })
        }
        type="button"
        size="lg"
        kind="success"
        disabled={saving || selected.size === 0}
        onClick={onAdd}
      />
    </Box>
  );
}

/**
 * ResumePanel - PDF resume upload that imports career data and surfaces newly
 * extracted skills for the user to merge into their tech stack. Rendered as bare
 * content; the caller supplies the surrounding card.
 */
export function ResumePanel() {
  const t = useTranslations("ProfilePage");

  // Current saved stack, used to diff against resume-extracted skills.
  const [techStack, setTechStack] = useState<string[]>([]);

  type UploadState = "idle" | "uploading" | "done" | "error";
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [resumeResult, setResumeResult] = useState<ResumeImportResult | null>(
    null,
  );
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newSkills, setNewSkills] = useState<string[]>([]);
  const [selectedNewSkills, setSelectedNewSkills] = useState<Set<string>>(
    new Set(),
  );
  const [savingDiff, setSavingDiff] = useState(false);
  const [stackError, setStackError] = useState<string | null>(null);
  const [stackSuccess, setStackSuccess] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => setTechStack(p.preferred_stack.map((ts) => ts.name)))
      .catch(() => {
        /* diff falls back to showing all extracted skills */
      });
  }, []);

  const handleResumeFile = useCallback(
    async (file: File) => {
      setResumeError(null);
      setUploadState("uploading");
      setResumeResult(null);
      setNewSkills([]);
      setSelectedNewSkills(new Set());
      try {
        const result = await uploadResume(file);
        setResumeResult(result);
        setUploadState("done");
        const currentLower = techStack.map((s) => s.toLowerCase());
        const fresh = result.extracted_skills.filter(
          (s) => !currentLower.includes(s.toLowerCase()),
        );
        setNewSkills(fresh);
        setSelectedNewSkills(new Set(fresh));
      } catch {
        setUploadState("error");
        setResumeError(t("resumeError"));
      }
    },
    [techStack, t],
  );

  const handleAddDiffSkills = useCallback(async () => {
    setSavingDiff(true);
    setStackError(null);
    setStackSuccess(false);
    const updatedStack = [...techStack, ...Array.from(selectedNewSkills)];
    try {
      await saveOnboarding({ preferred_stack: updatedStack });
      setTechStack(updatedStack);
      setNewSkills([]);
      setSelectedNewSkills(new Set());
      setStackSuccess(true);
    } catch {
      setStackError(t("techError"));
    } finally {
      setSavingDiff(false);
    }
  }, [selectedNewSkills, techStack, t]);

  function toggleDiffSkill(skill: string) {
    setSelectedNewSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  return (
    <>
      {stackSuccess && (
        <Toast
          message={t("stackSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {stackError && (
        <Toast message={stackError} variant="error" position="top-center" />
      )}
      {resumeError && (
        <Toast message={resumeError} variant="error" position="top-center" />
      )}

      {(uploadState === "idle" || uploadState === "error") && (
        <>
          <Box
            className={[
              "profile__upload-zone",
              isDragging ? "profile__upload-zone--dragging" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            aria-label={t("resumeDropZone")}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleResumeFile(file);
            }}
          >
            <Typography variant="body" styles={{ pointerEvents: "none" }}>
              {t("resumeDropZone")}
            </Typography>
            <Typography
              variant="label"
              color="var(--muted-foreground, #6b7280)"
              styles={{ pointerEvents: "none" }}
            >
              {t("resumeDropHint")}
            </Typography>
          </Box>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            aria-hidden="true"
            className="profile__file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleResumeFile(file);
            }}
          />
        </>
      )}

      {uploadState === "uploading" && (
        <Box className="profile__upload-zone profile__upload-zone--loading">
          <ProgressBar label={t("resumeAnalyzing")} />
        </Box>
      )}

      {uploadState === "done" && resumeResult && (
        <Box display="flex" flexDirection="column" gap={16}>
          {(resumeResult.work_experience_imported > 0 ||
            resumeResult.education_imported > 0 ||
            resumeResult.projects_imported > 0) && (
            <Box className="profile__import-banner">
              <Typography
                variant="body"
                fontWeight={600}
                color="var(--success, #22c55e)"
              >
                ✓{" "}
                {t("careerImported", {
                  jobs: resumeResult.work_experience_imported,
                  degrees: resumeResult.education_imported,
                  projects: resumeResult.projects_imported,
                })}
              </Typography>
              <Typography variant="label" color="var(--foreground)">
                {t("careerReviewHint")}{" "}
                <Link
                  href="/work-experience"
                  prefetch
                  className="profile__review-link"
                >
                  {t("careerReviewWork")}
                </Link>{" "}
                {t("careerReviewAnd")}{" "}
                <Link
                  href="/education"
                  prefetch
                  className="profile__review-link"
                >
                  {t("careerReviewEducation")}
                </Link>
                .
              </Typography>
            </Box>
          )}

          <SkillsDiffPanel
            newSkills={newSkills}
            selected={selectedNewSkills}
            onToggle={toggleDiffSkill}
            onAdd={() => void handleAddDiffSkills()}
            saving={savingDiff}
          />

          <Button
            unstyled
            type="button"
            className="profile__upload-another"
            onClick={() => {
              setUploadState("idle");
              setResumeResult(null);
              setNewSkills([]);
              setSelectedNewSkills(new Set());
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            {t("resumeUploadAnother")}
          </Button>
        </Box>
      )}
    </>
  );
}
