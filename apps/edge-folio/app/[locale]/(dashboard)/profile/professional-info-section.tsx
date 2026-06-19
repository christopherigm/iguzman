"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Slider } from "@repo/ui/core-elements/slider";
import type { SliderStep } from "@repo/ui/core-elements/slider";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import { Select } from "@repo/ui/core-elements/select";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  StreamingEnhancePanel,
  type StreamingEnhanceHandle,
} from "@repo/ui/core-elements/streaming-enhance-panel";
import { getProfile, saveOnboarding, updateContactInfo } from "@/lib/auth";
import { TN_PROFESSIONS } from "@/lib/nafta-constants";
import {
  suggestTnCategory,
  ApplicationError,
  type TnCategorySuggestion,
} from "@/lib/applications";

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

/**
 * ProfessionalInfoPanel - job title, years of experience, professional summary
 * (with AI enhance + voice input) and TN profession (with AI category suggest).
 * Rendered as bare content; the caller supplies the surrounding card.
 */
export function ProfessionalInfoPanel() {
  const t = useTranslations("ProfilePage");
  const locale = useLocale();

  const [loading, setLoading] = useState(true);
  const [jobTitle, setJobTitle] = useState("");
  const [yearsValue, setYearsValue] = useState<string | number>(0);
  const [contactSummary, setContactSummary] = useState("");
  const [contactTnProfession, setContactTnProfession] = useState("");

  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // TN suggest state
  const [tnSuggestModal, setTnSuggestModal] = useState(false);
  const [tnSuggestResults, setTnSuggestResults] = useState<
    TnCategorySuggestion[]
  >([]);
  const [tnSuggestLoading, setTnSuggestLoading] = useState(false);
  const [tnSuggestError, setTnSuggestError] = useState<string | null>(null);

  // Summary enhance state — the streaming itself lives in <StreamingEnhancePanel>
  // so per-token updates don't re-render this panel. These flags only track
  // coarse transitions reported by the panel.
  const [summaryShowEnhanceOptions, setSummaryShowEnhanceOptions] =
    useState(false);
  const [summaryEnhanceParagraphs, setSummaryEnhanceParagraphs] = useState(1);
  const [summaryEnhanceParagraphLength, setSummaryEnhanceParagraphLength] =
    useState("sm");
  const [summaryEnhancing, setSummaryEnhancing] = useState(false);
  const [summaryPreviewActive, setSummaryPreviewActive] = useState(false);
  const summaryEnhanceRef = useRef<StreamingEnhanceHandle>(null);

  const handleSummaryAccept = useCallback((text: string) => {
    setContactSummary(text);
    setInfoSuccess(false);
  }, []);

  // Voice input for summary
  const summaryRef = useRef(contactSummary);
  summaryRef.current = contactSummary;
  const handleSummaryTranscript = useCallback((transcript: string) => {
    const current = summaryRef.current;
    setContactSummary(current ? `${current} ${transcript}` : transcript);
    setInfoSuccess(false);
  }, []);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setJobTitle(p.job_title ?? "");
        setYearsValue(p.years_of_experience ?? 0);
        setContactSummary(p.summary ?? "");
        setContactTnProfession(p.tn_profession ?? "");
      })
      .catch(() => setInfoError(t("errorLoad")))
      .finally(() => setLoading(false));
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
        }),
        updateContactInfo({
          summary: contactSummary.trim(),
          tn_profession: contactTnProfession,
        }),
      ]);
      setInfoSuccess(true);
    } catch {
      setInfoError(t("infoError"));
    } finally {
      setSavingInfo(false);
    }
  }, [jobTitle, yearsValue, contactSummary, contactTnProfession, t]);

  const handleSuggestTnCategory = useCallback(async () => {
    setTnSuggestError(null);
    setTnSuggestLoading(true);
    try {
      const result = await suggestTnCategory(locale);
      setTnSuggestResults(result.suggestions);
      setTnSuggestModal(true);
    } catch (err) {
      const is400 = err instanceof ApplicationError && err.status === 400;
      setTnSuggestError(t(is400 ? "tnSuggestNoData" : "tnSuggestError"));
    } finally {
      setTnSuggestLoading(false);
    }
  }, [t, locale]);

  const handleSummaryConfirmEnhanceOptions = useCallback(() => {
    setSummaryShowEnhanceOptions(false);
    const currentText = contactSummary.trim();
    if (!currentText) return;
    const { min, max } = PARAGRAPH_WORD_COUNTS[
      summaryEnhanceParagraphLength
    ] ?? {
      min: 25,
      max: 40,
    };
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
    summaryEnhanceRef.current?.start(messages);
  }, [
    contactSummary,
    summaryEnhanceParagraphLength,
    summaryEnhanceParagraphs,
    locale,
    jobTitle,
    yearsValue,
  ]);

  if (loading) {
    return <ProgressBar label={t("loading")} />;
  }

  return (
    <>
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
      {tnSuggestError && (
        <Toast message={tnSuggestError} variant="error" position="top-center" />
      )}

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
                variant="body"
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
                      <Typography variant="body" fontWeight={600} color={color}>
                        {r.likelihood}%
                      </Typography>
                    </Box>
                    <ProgressBar
                      value={r.likelihood}
                      size={6}
                      label={r.category}
                    />
                    <Typography
                      variant="body"
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
          okCallback={() => handleSummaryConfirmEnhanceOptions()}
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

      <Box display="flex" flexDirection="column" gap={12} marginBottom={12}>
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
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
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
                  summaryPreviewActive
                    ? "var(--primary, #06b6d4)"
                    : "var(--foreground, #171717)"
                }
                disabled={summaryEnhancing || !contactSummary.trim()}
                onClick={() => setSummaryShowEnhanceOptions(true)}
                aria-label={t("summaryEnhanceLabel")}
                title={t("summaryEnhanceLabel")}
                className={[
                  "ai-enhance-btn",
                  summaryEnhancing || !contactSummary.trim()
                    ? "ai-enhance-btn--busy"
                    : "",
                  summaryPreviewActive ? "ai-enhance-btn--active" : "",
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
          <StreamingEnhancePanel
            ref={summaryEnhanceRef}
            onAccept={handleSummaryAccept}
            onGeneratingChange={setSummaryEnhancing}
            onPreviewActiveChange={setSummaryPreviewActive}
            labels={{
              stop: t("summaryEnhanceStop"),
              discard: t("summaryEnhanceDiscard"),
              accept: t("summaryEnhanceAccept"),
            }}
          />
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
        {tnSuggestLoading && <ProgressBar label={t("tnSuggestGenerating")} />}
      </Box>
      {savingInfo && <ProgressBar label={t("savingInfo")} />}
      <Box display="flex" justifyContent="flex-end">
        <Button
          text={savingInfo ? t("savingInfo") : t("saveInfo")}
          type="button"
          size="lg"
          kind="primary"
          disabled={savingInfo || !jobTitle.trim()}
          onClick={() => void handleSaveInfo()}
          icon="/icons/download.svg"
          iconPosition="end"
        />
      </Box>
    </>
  );
}
