"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import {
  updateApplication,
  ApplicationError,
  type JobApplication,
  type ApplicationStatus,
  type SalaryCurrency,
  type WorkType,
} from "@/lib/applications";
import { STATUSES } from "../detail-constants";

interface Props {
  app: JobApplication;
  onSaved: (updated: JobApplication) => void;
  onCancel: () => void;
}

/**
 * Editable application form. Owns its own draft field state (seeded from `app`
 * each time it mounts) and persists via `updateApplication`, handing the saved
 * application back to the container through `onSaved`.
 */
export function ApplicationEditForm({ app, onSaved, onCancel }: Props) {
  const t = useTranslations("ApplicationDetailPage");

  const [companyName, setCompanyName] = useState(app.company_name);
  const [jobTitle, setJobTitle] = useState(app.job_title);
  const [jobDescription, setJobDescription] = useState(app.job_description);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>(
    app.status,
  );
  const [notes, setNotes] = useState(app.notes);
  const [location, setLocation] = useState(app.location);
  const [salaryMin, setSalaryMin] = useState(app.salary_min ?? "");
  const [salaryMax, setSalaryMax] = useState(app.salary_max ?? "");
  const [salaryCurrency, setSalaryCurrency] = useState<SalaryCurrency | "">(
    app.salary_currency ?? "",
  );
  const [workType, setWorkType] = useState<WorkType[]>(app.work_type ?? []);
  const [usCitizenOrPr, setUsCitizenOrPr] = useState<"null" | "true" | "false">(
    app.us_citizen_or_pr_required == null
      ? "null"
      : app.us_citizen_or_pr_required
        ? "true"
        : "false",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const statusOptions = STATUSES.map((s) => ({
    value: s,
    label: t(`statuses.${s}`),
  }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !jobTitle.trim() || !jobDescription.trim())
      return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateApplication(app.id, {
        company_name: companyName.trim(),
        job_title: jobTitle.trim(),
        job_description: jobDescription.trim(),
        status: selectedStatus,
        notes: notes.trim(),
        location: location.trim(),
        salary_min: salaryMin ? parseFloat(salaryMin) : null,
        salary_max: salaryMax ? parseFloat(salaryMax) : null,
        salary_currency: salaryCurrency || "",
        work_type: workType.length ? workType : null,
        us_citizen_or_pr_required:
          usCitizenOrPr === "null" ? null : usCitizenOrPr === "true",
      });
      onSaved(updated);
    } catch (err) {
      const isAuth = err instanceof ApplicationError && err.status === 401;
      setSaveError(isAuth ? t("errorUnauthorized") : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card gap={8} marginBottom={28}>
      <form onSubmit={handleSave}>
        <Box display="flex" flexDirection="column" gap={14}>
          <Typography as="h2" variant="h3" fontWeight={600}>
            {t("editTitle")}
          </Typography>
          <Box display="flex" gap={12} flexWrap="wrap">
            <Box flex={1} styles={{ minWidth: 200 }}>
              <TextInput
                label={t("companyLabel")}
                value={companyName}
                onChange={setCompanyName}
                required
                maxLength={200}
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 200 }}>
              <TextInput
                label={t("jobTitleLabel")}
                value={jobTitle}
                onChange={setJobTitle}
                required
                maxLength={200}
                width="100%"
              />
            </Box>
          </Box>
          <Select
            label={t("statusLabel")}
            value={selectedStatus}
            onChange={(v) => setSelectedStatus(v as ApplicationStatus)}
            options={statusOptions}
          />
          <TextInput
            label={t("locationLabel")}
            value={location}
            onChange={setLocation}
            maxLength={200}
            width="100%"
          />
          <Box display="flex" gap={8} flexWrap="wrap" alignItems="flex-end">
            <Box flex={1} styles={{ minWidth: 140 }}>
              <TextInput
                label={t("salaryMinLabel")}
                value={salaryMin}
                onChange={setSalaryMin}
                type="number"
                min="0"
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 140 }}>
              <TextInput
                label={t("salaryMaxLabel")}
                value={salaryMax}
                onChange={setSalaryMax}
                type="number"
                min="0"
                width="100%"
              />
            </Box>
            <Box flex={1} styles={{ minWidth: 120 }}>
              <Select
                label={t("salaryCurrencyLabel")}
                value={salaryCurrency}
                onChange={(v) => setSalaryCurrency(v as SalaryCurrency | "")}
                options={[
                  { value: "", label: t("salaryCurrencyPlaceholder") },
                  { value: "USD", label: "USD" },
                  { value: "CAD", label: "CAD" },
                  { value: "EUR", label: "EUR" },
                  { value: "MXN", label: "MXN" },
                  { value: "GBP", label: "GBP" },
                ]}
                width="100%"
              />
            </Box>
          </Box>
          <Box display="flex" flexDirection="column" gap={6}>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t("workTypeLabel")}
            </Typography>
            <Box
              display="flex"
              flexDirection="column"
              gap={8}
              role="group"
              aria-label={t("workTypeLabel")}
            >
              {(["remote", "onsite", "hybrid"] as WorkType[]).map((wt) => (
                <Box
                  key={wt}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={12}
                >
                  <Typography variant="body">{t(`workTypes.${wt}`)}</Typography>
                  <Switch
                    checked={workType.includes(wt)}
                    onChange={(checked) =>
                      setWorkType((prev) =>
                        checked ? [...prev, wt] : prev.filter((x) => x !== wt),
                      )
                    }
                    aria-label={t(`workTypes.${wt}`)}
                  />
                </Box>
              ))}
            </Box>
          </Box>
          <Select
            label={t("usCitizenOrPrLabel")}
            value={usCitizenOrPr}
            onChange={(v) => setUsCitizenOrPr(v as "null" | "true" | "false")}
            options={[
              { value: "null", label: t("usCitizenOrPr.null") },
              { value: "true", label: t("usCitizenOrPr.true") },
              { value: "false", label: t("usCitizenOrPr.false") },
            ]}
            width="100%"
          />
          <Box>
            <Typography
              variant="body"
              color="var(--muted-foreground, #6b7280)"
              marginBottom={6}
            >
              {t("jdLabel")}
            </Typography>
            <TextInput
              multirow
              rows={10}
              value={jobDescription}
              onChange={setJobDescription}
              required
              width="100%"
              aria-label={t("jdLabel")}
            />
          </Box>
          <Box>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              marginBottom={6}
            >
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("notesLabel")}
              </Typography>
              <SpeechButton
                mode="batch"
                language="en"
                micIcon="/icons/mic.svg"
                onTranscript={(text) =>
                  setNotes((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
            </Box>
            <TextInput
              multirow
              rows={3}
              value={notes}
              onChange={setNotes}
              width="100%"
              aria-label={t("notesLabel")}
            />
          </Box>
          {saveError && (
            <Typography variant="body" color="var(--error, #ef4444)">
              {saveError}
            </Typography>
          )}
          <Box display="flex" gap={8} justifyContent="flex-end">
            <Button
              text={t("cancel")}
              type="button"
              size="md"
              onClick={onCancel}
            />
            <Button
              text={saving ? t("saving") : t("save")}
              type="submit"
              size="md"
              kind="primary"
              disabled={
                saving ||
                !companyName.trim() ||
                !jobTitle.trim() ||
                !jobDescription.trim()
              }
            />
          </Box>
        </Box>
      </form>
    </Card>
  );
}
