"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Badge } from "@repo/ui/core-elements/badge";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  StreamingEnhancePanel,
  type StreamingEnhanceHandle,
} from "@repo/ui/core-elements/streaming-enhance-panel";
import {
  getEducations,
  createEducation,
  updateEducation,
  deleteEducation,
  CareerError,
  type Education,
  type EducationPayload,
  type DegreeType,
} from "@/lib/career";
import "./education-page.css";
import IconButton from "@repo/ui/core-elements/icon-button";

const DEGREE_TYPES: DegreeType[] = [
  "bachelor",
  "master",
  "phd",
  "associate",
  "certificate",
  "bootcamp",
  "other",
];

const DEGREE_COLORS: Record<DegreeType, string> = {
  bachelor: "#06b6d4",
  master: "#8b5cf6",
  phd: "#f97316",
  associate: "#22c55e",
  certificate: "#f59e0b",
  bootcamp: "#ec4899",
  other: "#6b7280",
};

const CURRENT_YEAR = new Date().getFullYear();

// ── Form ──────────────────────────────────────────────────────────────────────

interface FormProps {
  initial?: Education;
  onSave: (entry: Education) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  onValidityChange: (valid: boolean) => void;
}

function EducationForm({
  initial,
  onSave,
  formRef,
  onValidityChange,
}: FormProps) {
  const t = useTranslations("EducationPage");
  const locale = useLocale();
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [degree, setDegree] = useState<DegreeType>(
    initial?.degree ?? "bachelor",
  );
  const [fieldOfStudy, setFieldOfStudy] = useState(
    initial?.field_of_study ?? "",
  );
  const [startYear, setStartYear] = useState(
    initial?.start_year ? String(initial.start_year) : "",
  );
  const [endYear, setEndYear] = useState(
    initial?.end_year ? String(initial.end_year) : "",
  );
  const [isCurrent, setIsCurrent] = useState(initial?.is_current ?? false);
  const [gpa, setGpa] = useState(
    initial?.gpa != null ? String(initial.gpa) : "",
  );
  const [honors, setHonors] = useState(initial?.honors ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Streaming lives in <StreamingEnhancePanel> so per-token updates don't
  // re-render this form. These flags only track coarse transitions it reports.
  const enhanceRef = useRef<StreamingEnhanceHandle>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  function handleEnhance() {
    const current = description.trim();
    if (!current) return;
    const isEs = locale === "es";
    const messages = isEs
      ? [
          {
            role: "system" as const,
            content:
              "Eres un coach profesional de carrera. Reescribe la siguiente descripción académica en prosa clara e impactante para un portafolio profesional. Mantén 2-4 oraciones. Enfócate en logros académicos, habilidades y actividades relevantes. Devuelve únicamente el texto mejorado - sin explicaciones ni marcas de formato.",
          },
          { role: "user" as const, content: current },
        ]
      : [
          {
            role: "system" as const,
            content:
              "You are a professional career coach. Rewrite the following education description into polished, impactful prose for a professional portfolio. Keep it to 2-4 sentences. Focus on academic achievements, relevant coursework, and transferable skills. Return only the improved text - no explanations or formatting marks.",
          },
          { role: "user" as const, content: current },
        ];
    enhanceRef.current?.start(messages);
  }

  const isValid =
    !saving &&
    institution.trim().length > 0 &&
    startYear.length > 0 &&
    (isCurrent || endYear.length > 0);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const parsedGpa = gpa.trim() ? parseFloat(gpa) : null;
    const payload: EducationPayload = {
      institution: institution.trim(),
      degree,
      field_of_study: fieldOfStudy.trim(),
      start_year: parseInt(startYear, 10),
      end_year: isCurrent ? null : endYear ? parseInt(endYear, 10) : null,
      is_current: isCurrent,
      gpa: parsedGpa != null && !isNaN(parsedGpa) ? parsedGpa : null,
      honors: honors.trim(),
      description: description.trim(),
    };
    try {
      const result = initial
        ? await updateEducation(initial.id, payload)
        : await createEducation(payload);
      onSave(result);
    } catch (err) {
      if (err instanceof CareerError && err.data.detail) {
        setError(String(err.data.detail));
      } else {
        setError(t("saveError"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="education__form">
      <TextInput
        label={t("institutionLabel")}
        value={institution}
        onChange={setInstitution}
        required
        maxLength={200}
      />

      <Select
        id="edu-degree"
        label={t("degreeLabel")}
        value={degree}
        onChange={(v) => setDegree(v as DegreeType)}
        options={DEGREE_TYPES.map((d) => ({
          value: d,
          label: t(`degrees.${d}`),
        }))}
      />

      <TextInput
        label={t("fieldOfStudyLabel")}
        value={fieldOfStudy}
        onChange={setFieldOfStudy}
        maxLength={200}
        placeholder={t("fieldOfStudyPlaceholder")}
      />

      <Box display="grid" gap={12} styles={{ gridTemplateColumns: "1fr 1fr" }}>
        <TextInput
          type="number"
          label={t("startYearLabel")}
          value={startYear}
          onChange={setStartYear}
          min={1950}
          max={CURRENT_YEAR}
          required
        />
        <TextInput
          type="number"
          label={t("endYearLabel")}
          value={isCurrent ? "" : endYear}
          onChange={setEndYear}
          min={1950}
          max={CURRENT_YEAR + 10}
          disabled={isCurrent}
        />
      </Box>

      <Box display="flex" alignItems="center" gap={8}>
        <Switch
          checked={isCurrent}
          onChange={(checked) => {
            setIsCurrent(checked);
            if (checked) setEndYear("");
          }}
          aria-label={t("isCurrentLabel")}
        />
        <Typography variant="body">{t("isCurrentLabel")}</Typography>
      </Box>

      <Box display="flex" gap={12} flexWrap="wrap">
        <Box flex={1} styles={{ minWidth: 120 }}>
          <TextInput
            label={t("gpaLabel")}
            value={gpa}
            onChange={setGpa}
            type="number"
            placeholder="3.8"
          />
        </Box>
        <Box flex={2} styles={{ minWidth: 160 }}>
          <TextInput
            label={t("honorsLabel")}
            value={honors}
            onChange={setHonors}
            maxLength={100}
            placeholder={t("honorsPlaceholder")}
          />
        </Box>
      </Box>

      <Box display="flex" flexDirection="column" gap={6}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          flexWrap="wrap"
        >
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("descriptionLabel")}
          </Typography>
          <Box display="flex" alignItems="center" gap={6}>
            <SpeechButton
              mode="batch"
              language="en"
              onTranscript={(text) =>
                setDescription((prev) => (prev ? `${prev} ${text}` : text))
              }
              micIcon="/icons/mic.svg"
            />
            <Button
              unstyled
              type="button"
              icon="/icons/enhance.svg"
              iconSize="16px"
              iconColor={
                previewActive
                  ? "var(--primary, #06b6d4)"
                  : "var(--foreground, #171717)"
              }
              disabled={enhancing || !description.trim()}
              onClick={handleEnhance}
              aria-label={t("enhance")}
              title={t("enhance")}
              className={[
                "education__enhance-btn",
                enhancing || !description.trim()
                  ? "education__enhance-btn--busy"
                  : "",
                previewActive ? "education__enhance-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </Box>
        </Box>
        <TextInput
          value={description}
          onChange={setDescription}
          multirow
          rows={4}
          maxLength={2000}
          placeholder={t("descriptionPlaceholder")}
        />
        <StreamingEnhancePanel
          ref={enhanceRef}
          onAccept={setDescription}
          onGeneratingChange={setEnhancing}
          onPreviewActiveChange={setPreviewActive}
          labels={{
            stop: t("enhanceDiscard"),
            discard: t("enhanceDiscard"),
            accept: t("enhanceAccept"),
          }}
        />
      </Box>

      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
    </form>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  entry: Education;
  onEdit: (e: Education) => void;
  onDelete: (id: number) => void;
}

function EducationCard({ entry, onEdit, onDelete }: CardProps) {
  const t = useTranslations("EducationPage");

  const yearRange = (() => {
    if (entry.is_current) return `${entry.start_year} - ${t("present")}`;
    if (entry.end_year) return `${entry.start_year} - ${entry.end_year}`;
    return String(entry.start_year);
  })();

  return (
    <Card className="education__card" gap={10} padding={16}>
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography as="h3" variant="body" fontWeight={700}>
            {entry.field_of_study
              ? `${t(`degrees.${entry.degree}`)} in ${entry.field_of_study}`
              : t(`degrees.${entry.degree}`)}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {entry.institution}
          </Typography>
        </Box>
        <Badge
          variant="subtle"
          color={DEGREE_COLORS[entry.degree]}
          style={{ letterSpacing: "0.02em", flexShrink: 0 }}
        >
          {t(`degrees.${entry.degree}`)}
        </Badge>
      </Box>

      <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {yearRange}
        </Typography>
        {entry.gpa != null && (
          <Typography variant="label" color="var(--muted-foreground, #6b7280)">
            GPA: {entry.gpa}
          </Typography>
        )}
        {entry.honors && (
          <Typography variant="label" color="var(--muted-foreground, #6b7280)">
            {entry.honors}
          </Typography>
        )}
      </Box>

      {entry.description && (
        <Typography
          as="p"
          variant="body"
          color="var(--foreground)"
          className="education__description"
          styles={{ lineHeight: 1.6 }}
        >
          {entry.description}
        </Typography>
      )}

      <Box display="flex" gap={8} justifyContent="flex-end" marginTop={4}>
        <IconButton
          icon="/icons/delete.svg"
          kind="error"
          onClick={() => onDelete(entry.id)}
          aria-label={t("delete")}
        />
        <IconButton
          icon="/icons/edit.svg"
          kind="warning"
          onClick={() => onEdit(entry)}
          aria-label={t("edit")}
        />
      </Box>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function EducationPage() {
  const t = useTranslations("EducationPage");
  const [entries, setEntries] = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Education | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [formCanSubmit, setFormCanSubmit] = useState(false);

  function showToast(text: string, kind: "success" | "error") {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  const load = useCallback(async () => {
    try {
      const res = await getEducations();
      setEntries(res.results);
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // `loading` starts true, so the initial mount fetch needs no synchronous
  // reset. Manual retries do, so they go through this handler.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(entry: Education) {
    setEditing(entry);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function handleSaved(entry: Education) {
    setEntries((prev) =>
      editing === null
        ? [entry, ...prev]
        : prev.map((e) => (e.id === entry.id ? entry : e)),
    );
    closeForm();
    showToast(
      editing === null ? t("savedSuccess") : t("updatedSuccess"),
      "success",
    );
  }

  async function handleDelete(id: number) {
    try {
      await deleteEducation(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      showToast(t("deletedSuccess"), "success");
    } catch {
      showToast(t("deleteError"), "error");
    }
  }

  if (loading) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <ProgressBar label={t("loading")} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
        <Button text={t("retry")} type="button" size="md" onClick={retry} />
      </Container>
    );
  }

  return (
    <Container
      paddingX={10}
      styles={{ paddingTop: "var(--ui-navbar-height)", paddingBottom: "60px" }}
    >
      {pendingDeleteId !== null && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            void handleDelete(id);
          }}
          cancelCallback={() => setPendingDeleteId(null)}
        />
      )}

      {formOpen && (
        <ConfirmationModal
          title={editing ? t("editTitle") : t("addTitle")}
          text=""
          okCallback={() => formRef.current?.requestSubmit()}
          cancelCallback={closeForm}
          okDisabled={!formCanSubmit}
          panelMaxWidth="600px"
        >
          <EducationForm
            initial={editing ?? undefined}
            onSave={handleSaved}
            formRef={formRef}
            onValidityChange={setFormCanSubmit}
          />
        </ConfirmationModal>
      )}

      <Box
        width="100%"
        marginTop={24}
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t("title")}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("subtitle")}
          </Typography>
        </Box>
        <Button
          text={t("addEntry")}
          type="button"
          size="md"
          kind="success"
          onClick={openAdd}
          icon="/icons/new.svg"
          iconPosition="end"
        />
      </Box>

      {entries.length === 0 ? (
        <Box className="education__empty">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("empty")}
          </Typography>
          <Button
            text={t("addEntry")}
            type="button"
            size="md"
            kind="primary"
            onClick={openAdd}
          />
        </Box>
      ) : (
        <Grid container spacing={2} marginBottom={40}>
          {entries.map((entry) => (
            <Grid key={entry.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <EducationCard
                entry={entry}
                onEdit={openEdit}
                onDelete={setPendingDeleteId}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.kind}
          position="top-center"
        />
      )}
    </Container>
  );
}
