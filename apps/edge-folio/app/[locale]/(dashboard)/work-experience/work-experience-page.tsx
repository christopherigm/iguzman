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
import { Slider } from "@repo/ui/core-elements/slider";
import { Toast } from "@repo/ui/core-elements/toast";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import {
  StreamingEnhancePanel,
  type StreamingEnhanceHandle,
} from "@repo/ui/core-elements/streaming-enhance-panel";
import {
  getWorkExperiences,
  createWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getTechStacks,
  getPopularTechStacks,
  createTechStack,
  CareerError,
  type WorkExperience,
  type WorkExperiencePayload,
  type EmploymentType,
  type Project,
  type ProjectPayload,
  type TechStack,
} from "@/lib/career";
import "./work-experience-page.css";
import IconButton from "@repo/ui/core-elements/icon-button";

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "full_time",
  "part_time",
  "contract",
  "freelance",
  "internship",
];

const TECH_SUGGESTIONS = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C#",
  "Ruby",
  "PHP",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "Node.js",
  "Django",
  "FastAPI",
  "Spring Boot",
  ".NET",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "GCP",
  "Azure",
  "GraphQL",
  "REST",
  "gRPC",
  "Terraform",
  "Linux",
];

const EMPLOYMENT_TYPE_COLORS: Record<EmploymentType, string> = {
  full_time: "#06b6d4",
  part_time: "#8b5cf6",
  contract: "#f97316",
  freelance: "#22c55e",
  internship: "#f59e0b",
};

const PARAGRAPH_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  xs: { min: 10, max: 20 },
  sm: { min: 25, max: 40 },
  md: { min: 50, max: 75 },
  "md-lg": { min: 80, max: 120 },
  lg: { min: 130, max: 180 },
  xl: { min: 200, max: 270 },
};

const PARAGRAPH_LENGTH_STEPS = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "md-lg", label: "M-L" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const PARAGRAPH_COUNT_STEPS = [1, 2, 3, 4, 5].map((n) => ({
  value: n,
  label: String(n),
}));

// ── Form ──────────────────────────────────────────────────────────────────────

interface FormProps {
  initial?: WorkExperience;
  onSave: (entry: WorkExperience) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  onValidityChange: (valid: boolean) => void;
}

function WorkExperienceForm({
  initial,
  onSave,
  formRef,
  onValidityChange,
}: FormProps) {
  const t = useTranslations("WorkExperiencePage");
  const locale = useLocale();
  const [company, setCompany] = useState(initial?.company ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    initial?.employment_type ?? "full_time",
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [isCurrent, setIsCurrent] = useState(initial?.is_current ?? false);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── AI Enhance ──────────────────────────────────────────────────────────────
  // Streaming lives in <StreamingEnhancePanel> so per-token updates don't
  // re-render this form. These flags only track coarse transitions it reports.
  const enhanceRef = useRef<StreamingEnhanceHandle>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);
  const [enhanceParagraphs, setEnhanceParagraphs] = useState(1);
  const [enhanceParagraphLength, setEnhanceParagraphLength] = useState("sm");

  const isValid =
    !saving &&
    company.trim().length > 0 &&
    title.trim().length > 0 &&
    startDate.length > 0 &&
    (isCurrent || endDate.length > 0);

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const handleConfirmEnhanceOptions = () => {
    setShowEnhanceOptions(false);
    const currentText = description.trim();
    if (!currentText) return;
    const { min, max } = PARAGRAPH_WORD_COUNTS[enhanceParagraphLength] ?? {
      min: 50,
      max: 75,
    };
    const isEs = locale === "es";
    const messages = isEs
      ? [
          {
            role: "system" as const,
            content: `Eres un coach profesional de carrera. Reescribe y amplía la siguiente descripción de experiencia laboral en prosa impactante para un portafolio. Escribe exactamente ${enhanceParagraphs} párrafo${enhanceParagraphs !== 1 ? "s" : ""}. Cada párrafo debe tener entre ${min} y ${max} palabras. Enfócate en logros cuantificables, verbos de acción y resultados medibles. Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.`,
          },
          { role: "user" as const, content: currentText },
        ]
      : [
          {
            role: "system" as const,
            content: `You are a professional career coach and resume expert. Rewrite and expand the following work experience description into polished, impactful prose for a professional portfolio. Write exactly ${enhanceParagraphs} ${enhanceParagraphs === 1 ? "paragraph" : "paragraphs"}. Each paragraph must be between ${min} and ${max} words. Focus on quantifiable achievements, action verbs, and measurable outcomes. Return only the improved text - no explanations, labels, or formatting marks.`,
          },
          { role: "user" as const, content: currentText },
        ];
    enhanceRef.current?.start(messages);
  };

  // ── Voice input ──────────────────────────────────────────────────────────────
  const handleTranscript = useCallback((transcript: string) => {
    setDescription((current) =>
      current ? `${current} ${transcript}` : transcript,
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const payload: WorkExperiencePayload = {
      company: company.trim(),
      title: title.trim(),
      employment_type: employmentType,
      location: location.trim(),
      start_date: startDate,
      end_date: isCurrent ? null : endDate || null,
      is_current: isCurrent,
      description: description.trim(),
    };
    try {
      const result = initial
        ? await updateWorkExperience(initial.id, payload)
        : await createWorkExperience(payload);
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

  const currentLengthWordRange = PARAGRAPH_WORD_COUNTS[
    enhanceParagraphLength
  ] ?? { min: 50, max: 75 };

  return (
    <>
      {showEnhanceOptions && (
        <ConfirmationModal
          title={t("enhanceOptionsTitle")}
          text={t("enhanceOptionsText")}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={() => setShowEnhanceOptions(false)}
        >
          <Box display="flex" flexDirection="column" gap={20} paddingY={4}>
            <Slider
              steps={PARAGRAPH_COUNT_STEPS}
              value={enhanceParagraphs}
              onChange={(v) => setEnhanceParagraphs(Number(v))}
              label={t("enhanceParagraphsLabel")}
            />
            <Slider
              steps={PARAGRAPH_LENGTH_STEPS}
              value={enhanceParagraphLength}
              onChange={(v) => setEnhanceParagraphLength(String(v))}
              label={`${t("enhanceLengthLabel")} (${currentLengthWordRange.min}-${currentLengthWordRange.max} words/para)`}
            />
          </Box>
        </ConfirmationModal>
      )}
      <form ref={formRef} onSubmit={handleSubmit} className="work-exp__form">
        <TextInput
          label={t("companyLabel")}
          value={company}
          onChange={setCompany}
          required
          maxLength={200}
        />
        <TextInput
          label={t("titleLabel")}
          value={title}
          onChange={setTitle}
          required
          maxLength={200}
        />

        <Select
          label={t("employmentTypeLabel")}
          value={employmentType}
          onChange={(v) => setEmploymentType(v as EmploymentType)}
          options={EMPLOYMENT_TYPES.map((et) => ({
            value: et,
            label: t(`employmentTypes.${et}`),
          }))}
          width="100%"
        />

        <TextInput
          label={t("locationLabel")}
          value={location}
          onChange={setLocation}
          maxLength={200}
          placeholder={t("locationPlaceholder")}
        />

        <Box
          display="grid"
          gap={12}
          styles={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <TextInput
            type="date"
            label={t("startDateLabel")}
            value={startDate}
            onChange={setStartDate}
            required
          />
          <TextInput
            type="date"
            label={t("endDateLabel")}
            value={isCurrent ? "" : endDate}
            onChange={setEndDate}
            disabled={isCurrent}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={isCurrent}
            onChange={(checked) => {
              setIsCurrent(checked);
              if (checked) setEndDate("");
            }}
            aria-label={t("isCurrentLabel")}
          />
          <Typography variant="body">{t("isCurrentLabel")}</Typography>
        </Box>

        {/* Description label row with voice + enhance buttons */}
        <Box className="work-exp__field-label-row">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("descriptionLabel")}
          </Typography>
          <Box display="flex" alignItems="center" gap={6}>
            <SpeechButton
              language={locale === "es" ? "es" : "en"}
              onTranscript={handleTranscript}
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
              onClick={() => setShowEnhanceOptions(true)}
              aria-label={t("enhanceLabel")}
              title={t("enhanceLabel")}
              className={[
                "work-exp__enhance-btn",
                enhancing || !description.trim()
                  ? "work-exp__enhance-btn--busy"
                  : "",
                previewActive ? "work-exp__enhance-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </Box>
        </Box>
        <TextInput
          multirow
          rows={4}
          value={description}
          onChange={setDescription}
          maxLength={2000}
          placeholder={t("descriptionPlaceholder")}
          width="100%"
          aria-label={t("descriptionLabel")}
        />

        {/* Enhance preview panel */}
        <StreamingEnhancePanel
          ref={enhanceRef}
          onAccept={setDescription}
          onGeneratingChange={setEnhancing}
          onPreviewActiveChange={setPreviewActive}
          labels={{
            stop: t("enhanceStop"),
            discard: t("enhanceDiscard"),
            accept: t("enhanceAccept"),
          }}
        />

        {error && (
          <Typography variant="body" color="var(--error, #ef4444)">
            {error}
          </Typography>
        )}
      </form>
    </>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  entry: WorkExperience;
  onEdit: (e: WorkExperience) => void;
  onDelete: (id: number) => void;
}

function WorkExperienceCard({ entry, onEdit, onDelete }: CardProps) {
  const t = useTranslations("WorkExperiencePage");

  const dateRange = (() => {
    const start = new Date(entry.start_date + "T12:00:00").toLocaleDateString(
      undefined,
      {
        year: "numeric",
        month: "short",
      },
    );
    if (entry.is_current) return `${start} - ${t("present")}`;
    if (entry.end_date) {
      const end = new Date(entry.end_date + "T12:00:00").toLocaleDateString(
        undefined,
        {
          year: "numeric",
          month: "short",
        },
      );
      return `${start} - ${end}`;
    }
    return start;
  })();

  return (
    <Card className="work-exp__card" gap={10} padding={16}>
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography as="h3" variant="body" fontWeight={700}>
            {entry.title}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {entry.company}
            {entry.location ? ` · ${entry.location}` : ""}
          </Typography>
        </Box>
        <Badge
          variant="subtle"
          color={EMPLOYMENT_TYPE_COLORS[entry.employment_type]}
          style={{
            textTransform: "capitalize",
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          {t(`employmentTypes.${entry.employment_type}`)}
        </Badge>
      </Box>

      <Typography variant="label" color="var(--muted-foreground, #6b7280)">
        {dateRange}
      </Typography>

      {entry.description && (
        <Typography
          as="p"
          variant="body"
          color="var(--foreground)"
          className="work-exp__description"
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

// ── Project Form ──────────────────────────────────────────────────────────────

interface ProjectFormProps {
  initial?: Project;
  onSave: (entry: Project) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
  onValidityChange: (valid: boolean) => void;
}

function ProjectForm({
  initial,
  onSave,
  formRef,
  onValidityChange,
}: ProjectFormProps) {
  const t = useTranslations("WorkExperiencePage");
  const locale = useLocale();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Tech Stack ───────────────────────────────────────────────────────────────
  const [techStack, setTechStack] = useState<TechStack[]>(
    initial?.tech_stack ?? [],
  );
  const [availableTechStacks, setAvailableTechStacks] = useState<TechStack[]>(
    [],
  );
  const [mergedSuggestionNames, setMergedSuggestionNames] =
    useState<string[]>(TECH_SUGGESTIONS);
  const [techSearch, setTechSearch] = useState("");
  const [techCreating, setTechCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      getTechStacks().catch(() => ({ results: [] as TechStack[] })),
      getPopularTechStacks().catch(() => ({ results: [] as TechStack[] })),
    ]).then(([all, popular]) => {
      setAvailableTechStacks(all.results);
      const lower = new Set(TECH_SUGGESTIONS.map((s) => s.toLowerCase()));
      const apiOnly = popular.results
        .filter((ts) => !lower.has(ts.name.toLowerCase()))
        .map((ts) => ts.name);
      setMergedSuggestionNames([...TECH_SUGGESTIONS, ...apiOnly]);
    });
  }, []);

  const selectedIds = new Set(techStack.map((ts) => ts.id));
  const filteredSuggestions = techSearch.trim()
    ? availableTechStacks.filter(
        (ts) =>
          !selectedIds.has(ts.id) &&
          ts.name.toLowerCase().includes(techSearch.trim().toLowerCase()),
      )
    : [];
  const exactMatch = availableTechStacks.some(
    (ts) => ts.name.toLowerCase() === techSearch.trim().toLowerCase(),
  );
  const canAddNew = techSearch.trim().length > 0 && !exactMatch;

  function addTechStack(ts: TechStack) {
    setTechStack((prev) => [...prev, ts]);
    setTechSearch("");
  }

  function removeTechStack(id: number) {
    setTechStack((prev) => prev.filter((ts) => ts.id !== id));
  }

  async function handleCreateTechStack() {
    const trimmed = techSearch.trim();
    if (!trimmed || techCreating) return;
    setTechCreating(true);
    try {
      const created = await createTechStack(trimmed);
      setAvailableTechStacks((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      addTechStack(created);
    } catch {
      // silently fail; user can retry
    } finally {
      setTechCreating(false);
    }
  }

  async function handleAddSuggestion(name: string) {
    if (techCreating) return;
    const existing = availableTechStacks.find(
      (ts) => ts.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      addTechStack(existing);
      return;
    }
    setTechCreating(true);
    try {
      const created = await createTechStack(name);
      setAvailableTechStacks((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      addTechStack(created);
    } catch {
      // silently fail
    } finally {
      setTechCreating(false);
    }
  }

  // ── AI Enhance ──────────────────────────────────────────────────────────────
  // Streaming lives in <StreamingEnhancePanel> so per-token updates don't
  // re-render this form. These flags only track coarse transitions it reports.
  const enhanceRef = useRef<StreamingEnhanceHandle>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);
  const [enhanceParagraphs, setEnhanceParagraphs] = useState(1);
  const [enhanceParagraphLength, setEnhanceParagraphLength] = useState("sm");

  const isValid = !saving && name.trim().length > 0;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  const handleConfirmEnhanceOptions = () => {
    setShowEnhanceOptions(false);
    const currentText = description.trim();
    if (!currentText) return;
    const { min, max } = PARAGRAPH_WORD_COUNTS[enhanceParagraphLength] ?? {
      min: 50,
      max: 75,
    };
    const isEs = locale === "es";
    const messages = isEs
      ? [
          {
            role: "system" as const,
            content: `Eres un coach profesional de carrera. Reescribe y amplía la siguiente descripción de proyecto en prosa impactante para un portafolio profesional. Escribe exactamente ${enhanceParagraphs} párrafo${enhanceParagraphs !== 1 ? "s" : ""}. Cada párrafo debe tener entre ${min} y ${max} palabras. Enfócate en el problema resuelto, tecnologías usadas, y el impacto logrado. Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.`,
          },
          { role: "user" as const, content: currentText },
        ]
      : [
          {
            role: "system" as const,
            content: `You are a professional career coach and resume expert. Rewrite and expand the following project description into polished, impactful prose for a professional portfolio. Write exactly ${enhanceParagraphs} ${enhanceParagraphs === 1 ? "paragraph" : "paragraphs"}. Each paragraph must be between ${min} and ${max} words. Focus on the problem solved, technologies used, and measurable impact. Return only the improved text - no explanations, labels, or formatting marks.`,
          },
          { role: "user" as const, content: currentText },
        ];
    enhanceRef.current?.start(messages);
  };

  // ── Voice input ──────────────────────────────────────────────────────────────
  const handleTranscript = useCallback((transcript: string) => {
    setDescription((current) =>
      current ? `${current} ${transcript}` : transcript,
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const payload: ProjectPayload = {
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      tech_stack: techStack.map((ts) => ts.id),
    };
    try {
      const result = initial
        ? await updateProject(initial.id, payload)
        : await createProject(payload);
      onSave(result);
    } catch (err) {
      if (err instanceof CareerError && err.data.detail) {
        setError(String(err.data.detail));
      } else {
        setError(t("projectSaveError"));
      }
    } finally {
      setSaving(false);
    }
  }

  const currentLengthWordRange = PARAGRAPH_WORD_COUNTS[
    enhanceParagraphLength
  ] ?? { min: 50, max: 75 };

  return (
    <>
      {showEnhanceOptions && (
        <ConfirmationModal
          title={t("projectEnhanceOptionsTitle")}
          text={t("projectEnhanceOptionsText")}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={() => setShowEnhanceOptions(false)}
        >
          <Box display="flex" flexDirection="column" gap={20} paddingY={4}>
            <Slider
              steps={PARAGRAPH_COUNT_STEPS}
              value={enhanceParagraphs}
              onChange={(v) => setEnhanceParagraphs(Number(v))}
              label={t("projectEnhanceParagraphsLabel")}
            />
            <Slider
              steps={PARAGRAPH_LENGTH_STEPS}
              value={enhanceParagraphLength}
              onChange={(v) => setEnhanceParagraphLength(String(v))}
              label={`${t("projectEnhanceLengthLabel")} (${currentLengthWordRange.min}-${currentLengthWordRange.max} words/para)`}
            />
          </Box>
        </ConfirmationModal>
      )}
      <form ref={formRef} onSubmit={handleSubmit} className="work-exp__form">
        <TextInput
          label={t("projectNameLabel")}
          value={name}
          onChange={setName}
          required
          maxLength={200}
        />
        <TextInput
          label={t("projectUrlLabel")}
          value={url}
          onChange={setUrl}
          maxLength={300}
          placeholder={t("projectUrlPlaceholder")}
        />

        {/* Tech Stack picker */}
        <Box display="flex" flexDirection="column" gap={8}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("projectTechStackLabel")}
          </Typography>
          <TextInput
            value={techSearch}
            onChange={setTechSearch}
            placeholder={t("projectTechStackPlaceholder")}
            maxLength={100}
            aria-label={t("projectTechStackLabel")}
          />
          {!techSearch.trim() && (
            <Box display="flex" flexDirection="column" gap={6}>
              <Typography
                variant="label"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("projectTechStackHint")}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={6}>
                {mergedSuggestionNames
                  .filter(
                    (name) =>
                      !techStack.some(
                        (ts) => ts.name.toLowerCase() === name.toLowerCase(),
                      ),
                  )
                  .map((name) => (
                    <Button
                      key={name}
                      unstyled
                      type="button"
                      className="work-exp__tech-suggestion"
                      disabled={techCreating}
                      onClick={() => void handleAddSuggestion(name)}
                    >
                      {name}
                    </Button>
                  ))}
              </Box>
            </Box>
          )}

          {techStack.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={6} marginTop={8}>
              {techStack.map((ts) => (
                <Box
                  key={ts.id}
                  display="inline-flex"
                  alignItems="center"
                  gap={4}
                  paddingY={3}
                  paddingX={10}
                  borderRadius={999}
                  border="1px solid var(--primary, #06b6d4)"
                  backgroundColor="color-mix(in srgb, var(--primary, #06b6d4) 12%, transparent)"
                >
                  <Typography variant="label" color="var(--primary, #06b6d4)">
                    {ts.name}
                  </Typography>
                  <Button
                    unstyled
                    type="button"
                    className="work-exp__tech-tag-remove"
                    onClick={() => removeTechStack(ts.id)}
                    aria-label={t("projectTechStackRemove", { name: ts.name })}
                  >
                    ×
                  </Button>
                </Box>
              ))}
            </Box>
          )}

          {(filteredSuggestions.length > 0 || canAddNew) && (
            <Box display="flex" flexWrap="wrap" gap={6}>
              {filteredSuggestions.map((ts) => (
                <Button
                  key={ts.id}
                  unstyled
                  type="button"
                  className="work-exp__tech-suggestion"
                  onClick={() => addTechStack(ts)}
                >
                  {ts.name}
                </Button>
              ))}
              {canAddNew && (
                <Button
                  unstyled
                  type="button"
                  className="work-exp__tech-add"
                  disabled={techCreating}
                  onClick={handleCreateTechStack}
                >
                  + {t("projectTechStackAdd", { name: techSearch.trim() })}
                </Button>
              )}
            </Box>
          )}
        </Box>

        {/* Description label row with voice + enhance buttons */}
        <Box className="work-exp__field-label-row">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("projectDescriptionLabel")}
          </Typography>
          <Box display="flex" alignItems="center" gap={6}>
            <SpeechButton
              language={locale === "es" ? "es" : "en"}
              onTranscript={handleTranscript}
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
              onClick={() => setShowEnhanceOptions(true)}
              aria-label={t("projectEnhanceLabel")}
              title={t("projectEnhanceLabel")}
              className={[
                "work-exp__enhance-btn",
                enhancing || !description.trim()
                  ? "work-exp__enhance-btn--busy"
                  : "",
                previewActive ? "work-exp__enhance-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </Box>
        </Box>
        <TextInput
          multirow
          rows={4}
          value={description}
          onChange={setDescription}
          maxLength={2000}
          placeholder={t("projectDescriptionPlaceholder")}
          width="100%"
          aria-label={t("projectDescriptionLabel")}
        />

        {/* Enhance preview panel */}
        <StreamingEnhancePanel
          ref={enhanceRef}
          onAccept={setDescription}
          onGeneratingChange={setEnhancing}
          onPreviewActiveChange={setPreviewActive}
          labels={{
            stop: t("projectEnhanceStop"),
            discard: t("projectEnhanceDiscard"),
            accept: t("projectEnhanceAccept"),
          }}
        />

        {error && (
          <Typography variant="body" color="var(--error, #ef4444)">
            {error}
          </Typography>
        )}
      </form>
    </>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────

interface ProjectCardProps {
  entry: Project;
  onEdit: (e: Project) => void;
  onDelete: (id: number) => void;
}

function ProjectCard({ entry, onEdit, onDelete }: ProjectCardProps) {
  const t = useTranslations("WorkExperiencePage");

  return (
    <Card className="work-exp__card" gap={8} padding={16}>
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Typography as="h3" variant="body" fontWeight={700}>
          {entry.name}
        </Typography>
        {entry.url && (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="work-exp__project-link"
          >
            <Typography variant="label" color="var(--primary, #06b6d4)">
              {entry.url}
            </Typography>
          </a>
        )}
      </Box>
      {entry.tech_stack && entry.tech_stack.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={6}>
          {entry.tech_stack.map((ts) => (
            <Badge
              key={ts.id}
              variant="subtle"
              color="var(--muted-foreground, #6b7280)"
            >
              {ts.name}
            </Badge>
          ))}
        </Box>
      )}
      {entry.description && (
        <Typography
          as="p"
          variant="body"
          color="var(--foreground)"
          className="work-exp__description"
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

export function WorkExperiencePage() {
  const t = useTranslations("WorkExperiencePage");

  // ── Work experience state ────────────────────────────────────────────────────
  const [entries, setEntries] = useState<WorkExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formCanSubmit, setFormCanSubmit] = useState(false);

  // ── Projects state ───────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<
    number | null
  >(null);
  const projectFormRef = useRef<HTMLFormElement>(null);
  const [projectFormCanSubmit, setProjectFormCanSubmit] = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, kind: "success" | "error") {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }

  const load = useCallback(async () => {
    try {
      const [weRes, projRes] = await Promise.all([
        getWorkExperiences(),
        getProjects(),
      ]);
      setEntries(weRes.results);
      setProjects(projRes.results);
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

  // ── Work experience handlers ─────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(entry: WorkExperience) {
    setEditing(entry);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function handleSaved(entry: WorkExperience) {
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
      await deleteWorkExperience(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      showToast(t("deletedSuccess"), "success");
    } catch {
      showToast(t("deleteError"), "error");
    }
  }

  // ── Project handlers ─────────────────────────────────────────────────────────

  function openAddProject() {
    setEditingProject(null);
    setProjectFormOpen(true);
  }

  function openEditProject(entry: Project) {
    setEditingProject(entry);
    setProjectFormOpen(true);
  }

  function closeProjectForm() {
    setProjectFormOpen(false);
    setEditingProject(null);
  }

  function handleProjectSaved(entry: Project) {
    setProjects((prev) =>
      editingProject === null
        ? [entry, ...prev]
        : prev.map((p) => (p.id === entry.id ? entry : p)),
    );
    closeProjectForm();
    showToast(
      editingProject === null
        ? t("projectSavedSuccess")
        : t("projectUpdatedSuccess"),
      "success",
    );
  }

  async function handleProjectDelete(id: number) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      showToast(t("projectDeletedSuccess"), "success");
    } catch {
      showToast(t("projectDeleteError"), "error");
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
      {/* Work experience delete confirmation */}
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

      {/* Work experience form modal */}
      {formOpen && (
        <ConfirmationModal
          title={editing ? t("editTitle") : t("addTitle")}
          text=""
          okCallback={() => formRef.current?.requestSubmit()}
          cancelCallback={closeForm}
          okDisabled={!formCanSubmit}
          panelMaxWidth="600px"
        >
          <WorkExperienceForm
            initial={editing ?? undefined}
            onSave={handleSaved}
            formRef={formRef}
            onValidityChange={setFormCanSubmit}
          />
        </ConfirmationModal>
      )}

      {/* Project delete confirmation */}
      {pendingDeleteProjectId !== null && (
        <ConfirmationModal
          title={t("projectConfirmDeleteTitle")}
          text={t("projectConfirmDeleteText")}
          okCallback={() => {
            const id = pendingDeleteProjectId;
            setPendingDeleteProjectId(null);
            void handleProjectDelete(id);
          }}
          cancelCallback={() => setPendingDeleteProjectId(null)}
        />
      )}

      {/* Project form modal */}
      {projectFormOpen && (
        <ConfirmationModal
          title={editingProject ? t("editProjectTitle") : t("addProjectTitle")}
          text=""
          okCallback={() => projectFormRef.current?.requestSubmit()}
          cancelCallback={closeProjectForm}
          okDisabled={!projectFormCanSubmit}
          panelMaxWidth="540px"
        >
          <ProjectForm
            initial={editingProject ?? undefined}
            onSave={handleProjectSaved}
            formRef={projectFormRef}
            onValidityChange={setProjectFormCanSubmit}
          />
        </ConfirmationModal>
      )}

      {/* ── Work Experience section ── */}
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
        <Box className="work-exp__empty" marginBottom={48}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("empty")}
          </Typography>
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
      ) : (
        <Grid container spacing={2} marginBottom={48}>
          {entries.map((entry) => (
            <Grid key={entry.id} size={{ xs: 12, md: 6 }}>
              <WorkExperienceCard
                entry={entry}
                onEdit={openEdit}
                onDelete={setPendingDeleteId}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── Projects section ── */}
      <Box
        width="100%"
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h2" variant="h2" fontWeight={600} marginBottom={4}>
            {t("projectsTitle")}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("projectsSubtitle")}
          </Typography>
        </Box>
        <Button
          text={t("addProject")}
          type="button"
          size="md"
          kind="success"
          onClick={openAddProject}
          icon="/icons/new.svg"
          iconPosition="end"
        />
      </Box>

      {projects.length === 0 ? (
        <Box className="work-exp__empty">
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("projectEmpty")}
          </Typography>
          <Button
            text={t("addProject")}
            type="button"
            size="md"
            kind="success"
            onClick={openAddProject}
            icon="/icons/new.svg"
            iconPosition="end"
          />
        </Box>
      ) : (
        <Grid container spacing={2} marginBottom={40}>
          {projects.map((project) => (
            <Grid key={project.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <ProjectCard
                entry={project}
                onEdit={openEditProject}
                onDelete={setPendingDeleteProjectId}
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
