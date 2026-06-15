"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Slider } from "@repo/ui/core-elements/slider";
import type { SliderStep } from "@repo/ui/core-elements/slider";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import { useGroqProxy } from "@repo/ui/use-groq";
import {
  getProfile,
  saveOnboarding,
  uploadResume,
  updateContactInfo,
  type ResumeImportResult,
} from "@/lib/auth";
import { TN_PROFESSIONS, CITIZENSHIP_OPTIONS } from "@/lib/nafta-constants";
import { Select } from "@repo/ui/core-elements/select";
import {
  getLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  getPopularTechStacks,
  type Language,
  type LanguageProficiency,
} from "@/lib/career";
import {
  suggestTnCategory,
  ApplicationError,
  type TnCategorySuggestion,
} from "@/lib/applications";
import { Toast } from "@repo/ui/core-elements/toast";
import { JobSearchSection } from "./job-api-keys-section";
import "./profile-page.css";

const YEARS_STEPS: SliderStep[] = [
  { value: 0, label: "< 1" },
  { value: 1, label: "1-2" },
  { value: 3, label: "3-5" },
  { value: 6, label: "6-9" },
  { value: 10, label: "10-14" },
  { value: 15, label: "15+" },
];

const PARAGRAPH_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  xs: { min: 10, max: 20 },
  sm: { min: 25, max: 40 },
  md: { min: 50, max: 75 },
  "md-lg": { min: 80, max: 120 },
  lg: { min: 130, max: 180 },
  xl: { min: 200, max: 270 },
};

const SUMMARY_LENGTH_STEPS = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "md-lg", label: "M-L" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const SUMMARY_PARAGRAPH_COUNT_STEPS = [1, 2, 3].map((n) => ({
  value: n,
  label: String(n),
}));

const FALLBACK_TECH_SUGGESTIONS = [
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

const PROFICIENCY_OPTIONS: LanguageProficiency[] = [
  "native",
  "fluent",
  "professional",
  "basic",
];

function TechTagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const t = useTranslations("ProfilePage");
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function toggleSuggestion(tech: string) {
    if (tags.includes(tech)) removeTag(tech);
    else addTag(tech);
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Typography
        as="label"
        variant="body"
        fontWeight={600}
        color="var(--foreground, #1a1a1a)"
      >
        {t("techStackLabel")}
      </Typography>

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="label" color="var(--muted-foreground, #6b7280)">
          {t("techStackHint")}
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={6}>
          {(suggestions ?? FALLBACK_TECH_SUGGESTIONS).map((tech) => (
            <Button
              key={tech}
              unstyled
              type="button"
              className={[
                "profile__suggestion",
                tags.includes(tech) ? "profile__suggestion--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleSuggestion(tech)}
            >
              {tech}
            </Button>
          ))}
        </Box>
      </Box>

      <TextInput
        ref={inputRef}
        placeholder={t("techStackPlaceholder")}
        value={input}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
        aria-label={t("techStackLabel")}
        width="100%"
      />

      {tags.length > 0 && (
        <Box
          display="flex"
          flexWrap="wrap"
          gap={8}
          className="profile__tags"
          marginTop={10}
        >
          {tags.map((tag) => (
            <Box key={tag} className="profile__tag">
              <Typography variant="body">{tag}</Typography>
              <Button
                unstyled
                type="button"
                className="profile__tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      width="100%"
      padding={10}
      borderRadius={12}
      flexDirection="column"
      gap={20}
      elevation={5}
      backgroundColor="var(--surface-1)"
    >
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body-sm"
            color="var(--muted-foreground, #6b7280)"
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

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
      <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
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
        <Typography variant="body-sm" fontWeight={700}>
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

// ── Main export ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const t = useTranslations("ProfilePage");
  const locale = useLocale();

  const proficiencyOptions = PROFICIENCY_OPTIONS.map((p) => ({
    value: p,
    label: t(`proficiencies.${p}`),
  }));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState("");
  const [yearsValue, setYearsValue] = useState<string | number>(0);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [techStack, setTechStack] = useState<string[]>([]);
  const [savingStack, setSavingStack] = useState(false);
  const [stackSuccess, setStackSuccess] = useState(false);
  const [stackError, setStackError] = useState<string | null>(null);
  const [popularTechSuggestions, setPopularTechSuggestions] = useState<
    string[]
  >(FALLBACK_TECH_SUGGESTIONS);

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

  // Contact info state
  const [contactSummary, setContactSummary] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLocation, setContactLocation] = useState("");
  const [contactGithub, setContactGithub] = useState("");
  const [contactLinkedin, setContactLinkedin] = useState("");
  const [contactTnProfession, setContactTnProfession] = useState("");
  const [contactCitizenship, setContactCitizenship] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Languages
  const [languages, setLanguages] = useState<Language[]>([]);
  const [newLangName, setNewLangName] = useState("");
  const [newLangProficiency, setNewLangProficiency] =
    useState<LanguageProficiency>("professional");
  const [addingLang, setAddingLang] = useState(false);
  const [langError, setLangError] = useState<string | null>(null);
  const [editingLangId, setEditingLangId] = useState<number | null>(null);
  const [editLangName, setEditLangName] = useState("");
  const [editLangProficiency, setEditLangProficiency] =
    useState<LanguageProficiency>("professional");
  const [savingLangId, setSavingLangId] = useState<number | null>(null);
  const [deletingLangId, setDeletingLangId] = useState<number | null>(null);

  // TN suggest state
  const [tnSuggestModal, setTnSuggestModal] = useState(false);
  const [tnSuggestResults, setTnSuggestResults] = useState<
    TnCategorySuggestion[]
  >([]);
  const [tnSuggestLoading, setTnSuggestLoading] = useState(false);
  const [tnSuggestError, setTnSuggestError] = useState<string | null>(null);

  // Summary enhance state
  const [summaryEnhancePreview, setSummaryEnhancePreview] = useState("");
  const [summaryShowEnhanceOptions, setSummaryShowEnhanceOptions] =
    useState(false);
  const [summaryEnhanceParagraphs, setSummaryEnhanceParagraphs] = useState(1);
  const [summaryEnhanceParagraphLength, setSummaryEnhanceParagraphLength] =
    useState("sm");

  const {
    streamingText: summaryStreamingText,
    isGenerating: summaryIsGenerating,
    generate: summaryGenerate,
    abort: summaryAbort,
    reset: summaryResetLlm,
  } = useGroqProxy({ temperature: 0.7 });

  useEffect(() => {
    if (summaryStreamingText) setSummaryEnhancePreview(summaryStreamingText);
  }, [summaryStreamingText]);

  // Voice input for summary
  const summaryRef = useRef(contactSummary);
  summaryRef.current = contactSummary;
  const handleSummaryTranscript = useCallback((transcript: string) => {
    const current = summaryRef.current;
    setContactSummary(current ? `${current} ${transcript}` : transcript);
    setContactSuccess(false);
  }, []);

  useEffect(() => {
    Promise.all([getProfile(), getLanguages(), getPopularTechStacks()])
      .then(([p, langs, popular]) => {
        setJobTitle(p.job_title ?? "");
        setYearsValue(p.years_of_experience ?? 0);
        setTechStack(p.preferred_stack.map((ts) => ts.name));
        setContactSummary(p.summary ?? "");
        setContactPhone(p.phone ?? "");
        setContactLocation(p.location ?? "");
        setContactGithub(p.github_url ?? "");
        setContactLinkedin(p.linkedin_url ?? "");
        setContactTnProfession(p.tn_profession ?? "");
        setContactCitizenship(p.citizenship ?? "");
        setLanguages(langs.results);
        const lower = new Set(
          FALLBACK_TECH_SUGGESTIONS.map((s) => s.toLowerCase()),
        );
        const apiOnly = popular.results
          .map((ts) => ts.name)
          .filter((n) => !lower.has(n.toLowerCase()));
        setPopularTechSuggestions([...FALLBACK_TECH_SUGGESTIONS, ...apiOnly]);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(t("errorLoad"));
        setLoading(false);
      });
  }, [t]);

  const handleSaveInfo = useCallback(async () => {
    setInfoError(null);
    setInfoSuccess(false);
    setSavingInfo(true);
    try {
      await Promise.all([
        saveOnboarding({
          job_title: jobTitle.trim(),
          years_of_experience:
            typeof yearsValue === "number" ? yearsValue : null,
          preferred_stack: techStack,
        }),
        updateContactInfo({
          summary: contactSummary.trim(),
          phone: contactPhone.trim(),
          location: contactLocation.trim(),
          github_url: contactGithub.trim(),
          linkedin_url: contactLinkedin.trim(),
          tn_profession: contactTnProfession,
          citizenship: contactCitizenship,
        }),
      ]);
      setInfoSuccess(true);
    } catch {
      setInfoError(t("infoError"));
    } finally {
      setSavingInfo(false);
    }
  }, [
    jobTitle,
    yearsValue,
    techStack,
    contactSummary,
    contactPhone,
    contactLocation,
    contactGithub,
    contactLinkedin,
    contactTnProfession,
    contactCitizenship,
    t,
  ]);

  const handleSaveStack = useCallback(async () => {
    setStackError(null);
    setStackSuccess(false);
    setSavingStack(true);
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === "number" ? yearsValue : null,
        preferred_stack: techStack,
      });
      setStackSuccess(true);
    } catch {
      setStackError(t("techError"));
    } finally {
      setSavingStack(false);
    }
  }, [jobTitle, yearsValue, techStack, t]);

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
    const updatedStack = [...techStack, ...Array.from(selectedNewSkills)];
    try {
      await saveOnboarding({
        job_title: jobTitle.trim(),
        years_of_experience: typeof yearsValue === "number" ? yearsValue : null,
        preferred_stack: updatedStack,
      });
      setTechStack(updatedStack);
      setNewSkills([]);
      setSelectedNewSkills(new Set());
      setStackSuccess(true);
    } catch {
      setStackError(t("techError"));
    } finally {
      setSavingDiff(false);
    }
  }, [selectedNewSkills, techStack, jobTitle, yearsValue, t]);

  function toggleDiffSkill(skill: string) {
    setSelectedNewSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  const handleSuggestTnCategory = useCallback(async () => {
    setTnSuggestError(null);
    setTnSuggestLoading(true);
    try {
      const result = await suggestTnCategory();
      setTnSuggestResults(result.suggestions);
      setTnSuggestModal(true);
    } catch (err) {
      const is400 = err instanceof ApplicationError && err.status === 400;
      setTnSuggestError(t(is400 ? "tnSuggestNoData" : "tnSuggestError"));
    } finally {
      setTnSuggestLoading(false);
    }
  }, [t]);

  const handleSaveContact = useCallback(async () => {
    setContactError(null);
    setContactSuccess(false);
    setSavingContact(true);
    try {
      await updateContactInfo({
        summary: contactSummary.trim(),
        phone: contactPhone.trim(),
        location: contactLocation.trim(),
        github_url: contactGithub.trim(),
        linkedin_url: contactLinkedin.trim(),
        tn_profession: contactTnProfession,
        citizenship: contactCitizenship,
      });
      setContactSuccess(true);
    } catch {
      setContactError(t("contactError"));
    } finally {
      setSavingContact(false);
    }
  }, [
    contactSummary,
    contactPhone,
    contactLocation,
    contactGithub,
    contactLinkedin,
    contactTnProfession,
    contactCitizenship,
    t,
  ]);

  const handleSummaryConfirmEnhanceOptions = useCallback(async () => {
    setSummaryShowEnhanceOptions(false);
    const currentText = contactSummary.trim();
    if (!currentText) return;
    setSummaryEnhancePreview("");
    summaryResetLlm();
    const { min, max } = PARAGRAPH_WORD_COUNTS[
      summaryEnhanceParagraphLength
    ] ?? { min: 25, max: 40 };
    const yearsLabel =
      YEARS_STEPS.find((s) => s.value === yearsValue)?.label ??
      String(yearsValue);
    const profileCtx = [
      jobTitle.trim() ? `Job title: ${jobTitle.trim()}` : "",
      yearsValue !== null ? `Years of experience: ${yearsLabel}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    const isEs = locale === "es";
    const messages = isEs
      ? [
          {
            role: "system" as const,
            content: `Eres un coach profesional de carrera. Reescribe y mejora el siguiente resumen profesional en prosa convincente para un CV o portafolio. Escribe exactamente ${summaryEnhanceParagraphs} párrafo${summaryEnhanceParagraphs !== 1 ? "s" : ""}. Cada párrafo debe tener entre ${min} y ${max} palabras. Enfócate en logros de carrera, habilidades clave y propuesta de valor profesional. Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.${profileCtx ? ` Contexto del perfil: ${profileCtx}.` : ""}`,
          },
          { role: "user" as const, content: currentText },
        ]
      : [
          {
            role: "system" as const,
            content: `You are a professional career coach and resume expert. Rewrite and enhance the following professional summary into polished, compelling prose for a resume or portfolio. Write exactly ${summaryEnhanceParagraphs} ${summaryEnhanceParagraphs === 1 ? "paragraph" : "paragraphs"}. Each paragraph must be between ${min} and ${max} words. Focus on career achievements, key skills, and professional value proposition. Return only the improved text - no explanations, labels, or formatting marks.${profileCtx ? ` Profile context: ${profileCtx}.` : ""}`,
          },
          { role: "user" as const, content: currentText },
        ];
    await summaryGenerate(messages);
  }, [
    contactSummary,
    summaryEnhanceParagraphLength,
    summaryEnhanceParagraphs,
    summaryGenerate,
    summaryResetLlm,
    locale,
    jobTitle,
    yearsValue,
  ]);

  const handleSummaryAcceptEnhance = useCallback(() => {
    if (summaryEnhancePreview) {
      setContactSummary(summaryEnhancePreview);
      setContactSuccess(false);
    }
    setSummaryEnhancePreview("");
    summaryResetLlm();
  }, [summaryEnhancePreview, summaryResetLlm]);

  const handleSummaryDiscardEnhance = useCallback(() => {
    if (summaryIsGenerating) summaryAbort();
    setSummaryEnhancePreview("");
    summaryResetLlm();
  }, [summaryIsGenerating, summaryAbort, summaryResetLlm]);

  const handleAddLanguage = useCallback(async () => {
    const name = newLangName.trim();
    if (!name) return;
    setLangError(null);
    setAddingLang(true);
    try {
      const lang = await createLanguage({
        name,
        proficiency: newLangProficiency,
        order: languages.length,
      });
      setLanguages((prev) => [...prev, lang]);
      setNewLangName("");
    } catch {
      setLangError(t("langAddError"));
    } finally {
      setAddingLang(false);
    }
  }, [newLangName, newLangProficiency, languages.length, t]);

  const handleSaveLang = useCallback(
    async (id: number) => {
      const name = editLangName.trim();
      if (!name) return;
      setLangError(null);
      setSavingLangId(id);
      try {
        await updateLanguage(id, { name, proficiency: editLangProficiency });
        setLanguages((prev) =>
          prev.map((l) =>
            l.id === id ? { ...l, name, proficiency: editLangProficiency } : l,
          ),
        );
        setEditingLangId(null);
      } catch {
        setLangError(t("langSaveError"));
      } finally {
        setSavingLangId(null);
      }
    },
    [editLangName, editLangProficiency, t],
  );

  const handleDeleteLang = useCallback(
    async (id: number) => {
      setLangError(null);
      setDeletingLangId(id);
      try {
        await deleteLanguage(id);
        setLanguages((prev) => prev.filter((l) => l.id !== id));
        if (editingLangId === id) setEditingLangId(null);
      } catch {
        setLangError(t("langDeleteError"));
      } finally {
        setDeletingLangId(null);
      }
    },
    [editingLangId, t],
  );

  if (loading) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingTop: "var(--ui-navbar-height)",
        }}
        paddingX={10}
      >
        <Box width="100%" maxWidth={640} marginTop={24}>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("loading")}
          </Typography>
        </Box>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingTop: "var(--ui-navbar-height)",
        }}
        paddingX={10}
      >
        <Box width="100%" maxWidth={640} marginTop={24}>
          <Typography variant="body" role="alert" color="var(--error, #ef4444)">
            {loadError}
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "flex-start",
        paddingTop: "var(--ui-navbar-height)",
      }}
      paddingX={10}
    >
      {infoSuccess && (
        <Toast
          message={t("infoSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {infoError && (
        <Toast message={infoError} variant="error" position="top-center" />
      )}
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
      {contactSuccess && (
        <Toast
          message={t("contactSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {contactError && (
        <Toast message={contactError} variant="error" position="top-center" />
      )}
      {langError && (
        <Toast message={langError} variant="error" position="top-center" />
      )}
      {tnSuggestError && (
        <Toast message={tnSuggestError} variant="error" position="top-center" />
      )}
      {resumeError && (
        <Toast message={resumeError} variant="error" position="top-center" />
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
          <Typography
            variant="body-sm"
            color="var(--muted-foreground, #6b7280)"
          >
            {t("subtitle")}
          </Typography>
        </Box>
      </Box>

      <Container size="lg" paddingX={0} marginBottom={40}>
        <Grid container spacing={3}>
          {/* ── Contact Info ── */}
          {tnSuggestModal && (
            <ConfirmationModal
              title={t("tnSuggestModalTitle")}
              text={t("tnSuggestModalSubtitle")}
              okCallback={() => setTnSuggestModal(false)}
              panelMaxWidth="540px"
            >
              <Box display="flex" flexDirection="column" gap={16} marginTop={4}>
                {tnSuggestResults.length === 0 ? (
                  <Typography
                    variant="body-sm"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t("tnSuggestNoMatches")}
                  </Typography>
                ) : (
                  tnSuggestResults.map((r) => {
                    const color =
                      r.likelihood >= 70
                        ? "var(--success, #22c55e)"
                        : r.likelihood >= 45
                          ? "#f59e0b"
                          : "var(--error, #ef4444)";
                    return (
                      <Box
                        key={r.category}
                        display="flex"
                        flexDirection="column"
                        gap={6}
                      >
                        <Box
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <Typography variant="body" fontWeight={600}>
                            {r.category}
                          </Typography>
                          <Typography
                            variant="caption"
                            fontWeight={600}
                            color={color}
                          >
                            {r.likelihood}%
                          </Typography>
                        </Box>
                        <ProgressBar
                          value={r.likelihood}
                          size={6}
                          label={r.category}
                        />
                        <Typography
                          variant="body-sm"
                          color="var(--muted-foreground, #6b7280)"
                          styles={{ lineHeight: 1.5 }}
                        >
                          {r.explanation}
                        </Typography>
                      </Box>
                    );
                  })
                )}
              </Box>
            </ConfirmationModal>
          )}
          {summaryShowEnhanceOptions && (
            <ConfirmationModal
              title={t("summaryEnhanceOptionsTitle")}
              text={t("summaryEnhanceOptionsText")}
              okCallback={() => void handleSummaryConfirmEnhanceOptions()}
              cancelCallback={() => setSummaryShowEnhanceOptions(false)}
            >
              <Box display="flex" flexDirection="column" gap={20} paddingY={4}>
                <Slider
                  steps={SUMMARY_PARAGRAPH_COUNT_STEPS}
                  value={summaryEnhanceParagraphs}
                  onChange={(v) => setSummaryEnhanceParagraphs(Number(v))}
                  label={t("summaryEnhanceParagraphsLabel")}
                />
                <Slider
                  steps={SUMMARY_LENGTH_STEPS}
                  value={summaryEnhanceParagraphLength}
                  onChange={(v) => setSummaryEnhanceParagraphLength(String(v))}
                  label={`${t("summaryEnhanceLengthLabel")} (${(PARAGRAPH_WORD_COUNTS[summaryEnhanceParagraphLength] ?? { min: 25, max: 40 }).min}-${(PARAGRAPH_WORD_COUNTS[summaryEnhanceParagraphLength] ?? { min: 25, max: 40 }).max} words/para)`}
                />
              </Box>
            </ConfirmationModal>
          )}

          {/* ── Professional Info ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Section
              title={t("professionalSection")}
              subtitle={t("professionalSubtitle")}
            >
              <Box
                display="flex"
                flexDirection="column"
                gap={12}
                marginBottom={12}
              >
                <TextInput
                  label={t("jobTitleLabel")}
                  type="text"
                  value={jobTitle}
                  onChange={(v) => {
                    setJobTitle(v);
                    setInfoSuccess(false);
                  }}
                  placeholder={t("jobTitlePlaceholder")}
                  autoComplete="organization-title"
                />
                <Slider
                  label={t("yearsLabel")}
                  steps={YEARS_STEPS}
                  value={yearsValue}
                  onChange={(v) => {
                    setYearsValue(v);
                    setInfoSuccess(false);
                  }}
                />
                <Box display="flex" flexDirection="column" gap={8}>
                  <Box className="profile__field-label-row">
                    <Typography
                      variant="body"
                      color="var(--muted-foreground, #6b7280)"
                    >
                      {t("summaryLabel")}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={6}>
                      <SpeechButton
                        language={locale === "es" ? "es" : "en"}
                        onTranscript={handleSummaryTranscript}
                        micIcon="/icons/mic.svg"
                      />
                      <Button
                        unstyled
                        type="button"
                        icon="/icons/enhance.svg"
                        iconSize="16px"
                        iconColor={
                          summaryEnhancePreview
                            ? "var(--primary, #06b6d4)"
                            : "var(--foreground, #171717)"
                        }
                        disabled={summaryIsGenerating || !contactSummary.trim()}
                        onClick={() => setSummaryShowEnhanceOptions(true)}
                        aria-label={t("summaryEnhanceLabel")}
                        title={t("summaryEnhanceLabel")}
                        className={[
                          "ai-enhance-btn",
                          summaryIsGenerating || !contactSummary.trim()
                            ? "ai-enhance-btn--busy"
                            : "",
                          summaryEnhancePreview ? "ai-enhance-btn--active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    </Box>
                  </Box>
                  <TextInput
                    multirow
                    rows={7}
                    value={contactSummary}
                    onChange={(v) => {
                      setContactSummary(v);
                      setInfoSuccess(false);
                    }}
                    placeholder={t("summaryPlaceholder")}
                    aria-label={t("summaryLabel")}
                  />
                  {summaryEnhancePreview && (
                    <Box
                      className="profile__enhance-preview"
                      flexDirection="column"
                      gap={10}
                    >
                      <Typography variant="body-sm">
                        {summaryEnhancePreview}
                      </Typography>
                      <Box
                        display="flex"
                        gap={8}
                        alignItems="center"
                        marginTop={12}
                      >
                        {summaryIsGenerating ? (
                          <Button
                            text={t("summaryEnhanceStop")}
                            type="button"
                            size="md"
                            onClick={handleSummaryDiscardEnhance}
                          />
                        ) : (
                          <>
                            <Button
                              text={t("summaryEnhanceDiscard")}
                              type="button"
                              size="md"
                              onClick={handleSummaryDiscardEnhance}
                            />
                            <Button
                              text={t("summaryEnhanceAccept")}
                              type="button"
                              size="md"
                              kind="success"
                              onClick={handleSummaryAcceptEnhance}
                            />
                          </>
                        )}
                      </Box>
                    </Box>
                  )}
                </Box>
                <Box display="flex" alignItems="center" gap={8}>
                  <Box styles={{ flex: 1 }}>
                    <Select
                      label={t("tnProfessionLabel")}
                      value={contactTnProfession}
                      onChange={(v) => {
                        setContactTnProfession(v);
                        setInfoSuccess(false);
                      }}
                      options={[
                        { value: "", label: t("tnProfessionPlaceholder") },
                        ...TN_PROFESSIONS,
                      ]}
                      aria-label={t("tnProfessionLabel")}
                      disabled={tnSuggestLoading}
                    />
                  </Box>
                  <Button
                    unstyled
                    type="button"
                    icon="/icons/enhance.svg"
                    iconSize="16px"
                    iconColor={
                      tnSuggestLoading
                        ? "var(--primary, #06b6d4)"
                        : "var(--foreground, #171717)"
                    }
                    disabled={tnSuggestLoading}
                    onClick={() => void handleSuggestTnCategory()}
                    aria-label={t("tnSuggestLabel")}
                    title={t("tnSuggestLabel")}
                    className={[
                      "ai-enhance-btn",
                      tnSuggestLoading ? "ai-enhance-btn--busy" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </Box>
                {tnSuggestLoading && (
                  <ProgressBar label={t("tnSuggestGenerating")} />
                )}
              </Box>
              {savingInfo && <ProgressBar label={t("savingInfo")} />}
              <Box display="flex" justifyContent="flex-end">
                <Button
                  text={savingInfo ? t("savingInfo") : t("saveInfo")}
                  type="button"
                  size="lg"
                  kind="success"
                  disabled={savingInfo || !jobTitle.trim()}
                  onClick={() => void handleSaveInfo()}
                />
              </Box>
            </Section>
          </Grid>

          {/* ── Languages ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Section
              title={t("languagesSection")}
              subtitle={t("languagesSubtitle")}
            >
              <Box display="flex" gap={8} flexDirection="column">
                <TextInput
                  label={t("langNameLabel")}
                  type="text"
                  value={newLangName}
                  onChange={(v) => {
                    setNewLangName(v);
                    setLangError(null);
                  }}
                  placeholder={t("langNamePlaceholder")}
                  aria-label={t("langNameLabel")}
                />
                <Box
                  display="flex"
                  alignItems="center"
                  gap={12}
                  marginBottom={20}
                >
                  <Select
                    label={t("langProficiencyLabel")}
                    value={newLangProficiency}
                    onChange={(v) => {
                      setNewLangProficiency(v as LanguageProficiency);
                    }}
                    options={proficiencyOptions}
                  />
                  <Button
                    text={addingLang ? t("langAdding") : t("langAdd")}
                    type="button"
                    size="lg"
                    kind="success"
                    disabled={addingLang || !newLangName.trim()}
                    onClick={() => void handleAddLanguage()}
                  />
                </Box>
              </Box>

              {languages.length === 0 ? (
                <Typography
                  variant="body-sm"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("langEmpty")}
                </Typography>
              ) : (
                <Box display="flex" flexDirection="column" gap={8}>
                  {languages.map((lang) =>
                    editingLangId === lang.id ? (
                      <Box
                        key={lang.id}
                        display="flex"
                        alignItems="center"
                        gap={8}
                        padding={10}
                        borderRadius={8}
                        flexWrap="wrap"
                        styles={{
                          border: "1px solid var(--border, #e5e7eb)",
                          background: "var(--surface-2)",
                        }}
                      >
                        <Box styles={{ flex: 1, minWidth: "120px" }}>
                          <TextInput
                            type="text"
                            value={editLangName}
                            onChange={(v) => setEditLangName(v)}
                            placeholder={t("langNamePlaceholder")}
                            aria-label={t("langNameLabel")}
                          />
                        </Box>
                        <Select
                          label={t("langProficiencyLabel")}
                          value={editLangProficiency}
                          onChange={(v) =>
                            setEditLangProficiency(v as LanguageProficiency)
                          }
                          options={proficiencyOptions}
                        />
                        <Button
                          text={
                            savingLangId === lang.id
                              ? t("langSaving")
                              : t("langSave")
                          }
                          type="button"
                          size="lg"
                          kind="success"
                          disabled={
                            savingLangId === lang.id || !editLangName.trim()
                          }
                          onClick={() => void handleSaveLang(lang.id)}
                        />
                        <Button
                          text={t("langCancel")}
                          type="button"
                          size="lg"
                          disabled={savingLangId === lang.id}
                          onClick={() => setEditingLangId(null)}
                        />
                      </Box>
                    ) : (
                      <Box
                        key={lang.id}
                        display="flex"
                        alignItems="center"
                        gap={8}
                        padding={10}
                        borderRadius={8}
                        styles={{
                          border: "1px solid var(--border, #e5e7eb)",
                          background: "var(--surface-2)",
                        }}
                      >
                        <Typography variant="body" styles={{ flex: 1 }}>
                          {lang.name}
                        </Typography>
                        <Typography
                          variant="body-sm"
                          color="var(--muted-foreground, #6b7280)"
                        >
                          {t(`proficiencies.${lang.proficiency}`)}
                        </Typography>
                        <Button
                          unstyled
                          type="button"
                          className="profile__upload-another"
                          onClick={() => {
                            setEditingLangId(lang.id);
                            setEditLangName(lang.name);
                            setEditLangProficiency(lang.proficiency);
                            setLangError(null);
                          }}
                        >
                          {t("langEdit")}
                        </Button>
                        <Button
                          unstyled
                          type="button"
                          className="profile__upload-another"
                          disabled={deletingLangId === lang.id}
                          aria-label={`${t("langDelete")} ${lang.name}`}
                          onClick={() => void handleDeleteLang(lang.id)}
                        >
                          {deletingLangId === lang.id ? "…" : t("langDelete")}
                        </Button>
                      </Box>
                    ),
                  )}
                </Box>
              )}
            </Section>
          </Grid>

          {/* ── Contact Info ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Section
              title={t("contactSection")}
              subtitle={t("contactSubtitle")}
            >
              <Box
                display="flex"
                flexDirection="column"
                gap={12}
                marginBottom={12}
              >
                <TextInput
                  label={t("phoneLabel")}
                  type="text"
                  value={contactPhone}
                  onChange={(v) => {
                    setContactPhone(v);
                    setContactSuccess(false);
                  }}
                  placeholder={t("phonePlaceholder")}
                  aria-label={t("phoneLabel")}
                />
                <TextInput
                  label={t("locationLabel")}
                  type="text"
                  value={contactLocation}
                  onChange={(v) => {
                    setContactLocation(v);
                    setContactSuccess(false);
                  }}
                  placeholder={t("locationPlaceholder")}
                  aria-label={t("locationLabel")}
                />
                <TextInput
                  label={t("githubLabel")}
                  type="url"
                  value={contactGithub}
                  onChange={(v) => {
                    setContactGithub(v);
                    setContactSuccess(false);
                  }}
                  placeholder={t("githubPlaceholder")}
                  aria-label={t("githubLabel")}
                />
                <TextInput
                  label={t("linkedinLabel")}
                  type="url"
                  value={contactLinkedin}
                  onChange={(v) => {
                    setContactLinkedin(v);
                    setContactSuccess(false);
                  }}
                  placeholder={t("linkedinPlaceholder")}
                  aria-label={t("linkedinLabel")}
                />
                <Select
                  label={t("citizenshipLabel")}
                  value={contactCitizenship}
                  onChange={(v) => {
                    setContactCitizenship(v);
                    setContactSuccess(false);
                  }}
                  options={[
                    { value: "", label: t("citizenshipPlaceholder") },
                    ...CITIZENSHIP_OPTIONS,
                  ]}
                  aria-label={t("citizenshipLabel")}
                />
              </Box>
              {savingContact && <ProgressBar label={t("savingContact")} />}
              <Box display="flex" justifyContent="flex-end">
                <Button
                  text={savingContact ? t("savingContact") : t("saveContact")}
                  type="button"
                  size="lg"
                  kind="success"
                  disabled={savingContact}
                  onClick={() => void handleSaveContact()}
                />
              </Box>
            </Section>
          </Grid>

          {/* ── Job Search ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <JobSearchSection />
          </Grid>

          {/* ── Tech Stack ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Section title={t("techSection")} subtitle={t("techSubtitle")}>
              <TechTagInput
                tags={techStack}
                onChange={(tags) => {
                  setTechStack(tags);
                  setStackSuccess(false);
                }}
                suggestions={popularTechSuggestions}
              />
              {savingStack && <ProgressBar label={t("savingStack")} />}
              <Box display="flex" justifyContent="flex-end" marginTop={20}>
                <Button
                  text={savingStack ? t("savingStack") : t("saveStack")}
                  type="button"
                  size="lg"
                  kind="success"
                  disabled={savingStack}
                  onClick={() => void handleSaveStack()}
                />
              </Box>
            </Section>
          </Grid>

          {/* ── Resume ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Section title={t("resumeSection")} subtitle={t("resumeSubtitle")}>
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
                    <Typography
                      variant="body-sm"
                      styles={{ pointerEvents: "none" }}
                    >
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
                        variant="body-sm"
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
            </Section>
          </Grid>
        </Grid>
      </Container>
    </Container>
  );
}
