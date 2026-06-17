"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Switch } from "@repo/ui/core-elements/switch";
import { useGroqProxy } from "@repo/ui/use-groq";
import { getJobSearchPrefs, saveJobSearchPrefs, getProfile } from "@/lib/auth";
import { getLanguages, getEducations } from "@/lib/career";

const YEARS_LABELS: Record<number, string> = {
  0: "less than 1 year",
  1: "1-2 years",
  3: "3-5 years",
  6: "6-9 years",
  10: "10-14 years",
  15: "15+ years",
};

const DEGREE_LABELS: Record<string, string> = {
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  phd: "PhD",
  associate: "Associate's degree",
  certificate: "Certificate",
  bootcamp: "Bootcamp",
  other: "Degree",
};

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={12}
    >
      <Typography variant="body">{label}</Typography>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </Box>
  );
}

/**
 * JobSearch - search query preferences + generated query, rendered as bare
 * content (no surrounding card). The caller supplies the wrapper: the profile
 * page wraps it in a section card, the jobs page renders it inside a modal to
 * let the user refine the search before fetching.
 */
export function JobSearchPanel() {
  const t = useTranslations("ProfilePage");
  const locale = useLocale();

  // Job search prefs state
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [includeTitle, setIncludeTitle] = useState(true);
  const [extraText, setExtraText] = useState("");
  const [bilingual, setBilingual] = useState(false);
  const [includeTnProfession, setIncludeTnProfession] = useState(false);
  const [includeEducation, setIncludeEducation] = useState(false);
  const [includeYears, setIncludeYears] = useState(false);
  const [includeStack, setIncludeStack] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [languageCount, setLanguageCount] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Profile context used to compose the generated query (read from saved DB state)
  const [profileJobTitle, setProfileJobTitle] = useState("");
  const [profileStack, setProfileStack] = useState<string[]>([]);
  const [profileYears, setProfileYears] = useState<number | null>(null);
  const [profileTnProfession, setProfileTnProfession] = useState("");
  const [profileEducation, setProfileEducation] = useState("");

  // Generated query state
  const [generatedQuery, setGeneratedQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [querySaved, setQuerySaved] = useState(false);
  const {
    streamingText: queryStreamingText,
    isGenerating: queryGenerating,
    generate: queryGenerate,
    reset: queryReset,
  } = useGroqProxy({ temperature: 0.3 });

  useEffect(() => {
    Promise.all([
      getJobSearchPrefs(),
      getLanguages(),
      getProfile(),
      getEducations(),
    ])
      .then(([prefs, langs, profile, educations]) => {
        setIncludeTitle(prefs.job_search_include_title);
        setExtraText(prefs.job_search_extra_text);
        setBilingual(prefs.job_search_bilingual);
        setIncludeTnProfession(prefs.job_search_include_tn_profession);
        setIncludeEducation(prefs.job_search_include_education);
        setIncludeYears(prefs.job_search_include_years);
        setIncludeStack(prefs.job_search_include_stack);
        setIncludeLocation(prefs.job_search_include_location);
        setGeneratedQuery(prefs.job_search_generated_query);
        setLanguageCount(langs.results.length);
        setProfileJobTitle(profile.job_title);
        setProfileStack(profile.preferred_stack.map((ts) => ts.name));
        setProfileYears(profile.years_of_experience);
        setProfileTnProfession(profile.tn_profession);
        const topEdu = educations.results[0];
        if (topEdu) {
          const degree = DEGREE_LABELS[topEdu.degree] ?? "Degree";
          setProfileEducation(
            topEdu.field_of_study
              ? `${degree} in ${topEdu.field_of_study}`
              : degree,
          );
        }
      })
      .catch(() => setPrefsError(t("jobSearchPrefsLoadError")))
      .finally(() => setPrefsLoading(false));
  }, [t]);

  const handleSavePrefs = useCallback(async () => {
    setSavingPrefs(true);
    setPrefsError(null);
    setPrefsSaved(false);
    try {
      await saveJobSearchPrefs({
        job_search_include_title: includeTitle,
        job_search_extra_text: extraText,
        job_search_bilingual: bilingual,
        job_search_include_tn_profession: includeTnProfession,
        job_search_include_education: includeEducation,
        job_search_include_years: includeYears,
        job_search_include_stack: includeStack,
        job_search_include_location: includeLocation,
      });
      setPrefsSaved(true);
    } catch {
      setPrefsError(t("jobSearchPrefsError"));
    } finally {
      setSavingPrefs(false);
    }
  }, [
    includeTitle,
    extraText,
    bilingual,
    includeTnProfession,
    includeEducation,
    includeYears,
    includeStack,
    includeLocation,
    t,
  ]);

  const handleGenerateQuery = useCallback(async () => {
    setQueryError(null);
    setQuerySaved(false);
    queryReset();

    // Compose the context from the enabled preferences, mirroring what the worker uses.
    const ctx: string[] = [];
    if (includeTitle && profileJobTitle.trim())
      ctx.push(`Job title: ${profileJobTitle.trim()}`);
    if (includeStack && profileStack.length > 0)
      ctx.push(`Tech stack: ${profileStack.join(", ")}`);
    if (includeTnProfession && profileTnProfession)
      ctx.push(`TN profession: ${profileTnProfession}`);
    if (includeYears && profileYears !== null) {
      ctx.push(
        `Experience: ${YEARS_LABELS[profileYears] ?? `${profileYears}+ years`}`,
      );
    }
    if (bilingual && languageCount >= 2) ctx.push("Bilingual candidate");
    if (includeEducation && profileEducation)
      ctx.push(`Education: ${profileEducation}`);
    if (extraText.trim())
      ctx.push(`Additional preferences: ${extraText.trim()}`);

    if (ctx.length === 0) {
      setQueryError(t("jobSearchQueryNoData"));
      return;
    }

    const profileCtx = ctx.join(". ");
    const isEs = locale === "es";
    const messages = isEs
      ? [
          {
            role: "system" as const,
            content:
              "Eres un experto en búsqueda de empleo. A partir del perfil y las preferencias del candidato, redacta UNA sola consulta de búsqueda concisa (una frase corta de palabras clave) optimizada para portales de empleo como Adzuna o JSearch. No incluyas la ubicación. Devuelve únicamente la consulta - sin comillas, explicaciones ni etiquetas.",
          },
          { role: "user" as const, content: profileCtx },
        ]
      : [
          {
            role: "system" as const,
            content:
              "You are a job search expert. From the candidate profile and preferences, write ONE concise job-board search query (a short keyword phrase) optimized for job APIs like Adzuna or JSearch. Do not include location. Return only the query - no quotes, explanations, or labels.",
          },
          { role: "user" as const, content: profileCtx },
        ];

    try {
      const result = await queryGenerate(messages);
      const cleaned = result
        .trim()
        .replace(/^["']+|["']+$/g, "")
        .trim();
      if (!cleaned) {
        setQueryError(t("jobSearchQueryError"));
        return;
      }
      setGeneratedQuery(cleaned);
      await saveJobSearchPrefs({ job_search_generated_query: cleaned });
      setQuerySaved(true);
    } catch {
      setQueryError(t("jobSearchQueryError"));
    }
  }, [
    queryReset,
    queryGenerate,
    includeTitle,
    profileJobTitle,
    includeStack,
    profileStack,
    includeTnProfession,
    profileTnProfession,
    includeYears,
    profileYears,
    bilingual,
    languageCount,
    includeEducation,
    profileEducation,
    extraText,
    locale,
    t,
  ]);

  return (
    <Box display="flex" flexDirection="column" gap={20}>
      {/* ── Search Query Preferences ── */}
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography variant="body" fontWeight={600}>
          {t("jobSearchPrefsTitle")}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("jobSearchPrefsSubtitle")}
        </Typography>
      </Box>

      {prefsLoading ? (
        <ProgressBar label={t("loading")} />
      ) : (
        <>
          <Box display="flex" flexDirection="column" gap={12}>
            <SwitchRow
              label={t("jobSearchIncludeTitle")}
              checked={includeTitle}
              onChange={(v) => {
                setIncludeTitle(v);
                setPrefsSaved(false);
              }}
            />
            <TextInput
              label={t("jobSearchExtraTextLabel")}
              type="text"
              value={extraText}
              onChange={(v) => {
                setExtraText(v);
                setPrefsSaved(false);
              }}
              placeholder={t("jobSearchExtraTextPlaceholder")}
              aria-label={t("jobSearchExtraTextLabel")}
              width="100%"
            />
            {languageCount >= 2 && (
              <SwitchRow
                label={t("jobSearchBilingual")}
                checked={bilingual}
                onChange={(v) => {
                  setBilingual(v);
                  setPrefsSaved(false);
                }}
              />
            )}
            <SwitchRow
              label={t("jobSearchIncludeTnProfession")}
              checked={includeTnProfession}
              onChange={(v) => {
                setIncludeTnProfession(v);
                setPrefsSaved(false);
              }}
            />
            <SwitchRow
              label={t("jobSearchIncludeEducation")}
              checked={includeEducation}
              onChange={(v) => {
                setIncludeEducation(v);
                setPrefsSaved(false);
              }}
            />
            <SwitchRow
              label={t("jobSearchIncludeYears")}
              checked={includeYears}
              onChange={(v) => {
                setIncludeYears(v);
                setPrefsSaved(false);
              }}
            />
            <SwitchRow
              label={t("jobSearchIncludeStack")}
              checked={includeStack}
              onChange={(v) => {
                setIncludeStack(v);
                setPrefsSaved(false);
              }}
            />
            <SwitchRow
              label={t("jobSearchIncludeLocation")}
              checked={includeLocation}
              onChange={(v) => {
                setIncludeLocation(v);
                setPrefsSaved(false);
              }}
            />
          </Box>

          {prefsError && (
            <Typography variant="body" role="alert" color="var(--error, #ef4444)">
              {prefsError}
            </Typography>
          )}

          <Box
            display="flex"
            justifyContent="flex-end"
            alignItems="center"
            gap={12}
            marginTop={8}
            marginBottom={8}
          >
            {prefsSaved && (
              <Typography variant="body" color="var(--success, #22c55e)">
                {t("jobSearchPrefsSaved")}
              </Typography>
            )}
            <Button
              text={
                savingPrefs ? t("jobSearchPrefsSaving") : t("jobSearchPrefsSave")
              }
              type="button"
              size="lg"
              kind="success"
              disabled={savingPrefs}
              onClick={() => void handleSavePrefs()}
            />
          </Box>

          {/* ── Generated Query ── */}
          <Box display="flex" flexDirection="column" gap={12}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="flex-start"
              gap={12}
            >
              <Box display="flex" flexDirection="column" gap={4}>
                <Typography variant="body" fontWeight={600}>
                  {t("jobSearchQueryTitle")}
                </Typography>
                <Typography
                  variant="body"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("jobSearchQuerySubtitle")}
                </Typography>
              </Box>
              <Button
                text={
                  queryGenerating
                    ? t("jobSearchQueryGenerating")
                    : t("jobSearchQueryGenerate")
                }
                type="button"
                kind="success"
                size="md"
                icon="/icons/enhance.svg"
                iconSize="16px"
                disabled={queryGenerating}
                onClick={() => void handleGenerateQuery()}
              />
            </Box>

            {queryGenerating && (
              <ProgressBar label={t("jobSearchQueryGenerating")} />
            )}

            <Box
              padding={12}
              borderRadius={8}
              styles={{
                border: "1px solid var(--border, #e5e7eb)",
                background: "var(--surface-2)",
              }}
            >
              {(queryGenerating ? queryStreamingText : generatedQuery) ? (
                <Typography variant="body">
                  {queryGenerating ? queryStreamingText : generatedQuery}
                </Typography>
              ) : (
                <Typography
                  variant="body"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("jobSearchQueryEmpty")}
                </Typography>
              )}
            </Box>

            {querySaved && (
              <Typography variant="body" color="var(--success, #22c55e)">
                {t("jobSearchQuerySaved")}
              </Typography>
            )}
            {queryError && (
              <Typography
                variant="body"
                role="alert"
                color="var(--error, #ef4444)"
              >
                {queryError}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
