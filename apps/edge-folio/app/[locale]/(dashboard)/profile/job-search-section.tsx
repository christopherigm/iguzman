"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Switch } from "@repo/ui/core-elements/switch";
import { Toast } from "@repo/ui/core-elements/toast";
import { getJobSearchPrefs, saveJobSearchPrefs, getProfile } from "@/lib/auth";
import { getLanguages, getEducations } from "@/lib/career";

// Mirrors the backend `_YEARS_QUERY` map in jobs/tasks.py so the query built
// here matches what the API would otherwise compose from the same preferences.
const YEARS_QUERY: Record<number, string> = {
  0: "entry level",
  1: "1-2 years experience",
  3: "3-5 years experience",
  6: "6-9 years experience",
  10: "10+ years experience",
  15: "15+ years experience",
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
  const [profileLocation, setProfileLocation] = useState("");

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
        setLanguageCount(langs.results.length);
        setProfileJobTitle(profile.job_title);
        setProfileStack(profile.preferred_stack.map((ts) => ts.name));
        setProfileYears(profile.years_of_experience);
        setProfileTnProfession(profile.tn_profession);
        setProfileLocation(profile.location);
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

  // Build the job-board search query from the enabled preferences. This mirrors
  // the backend `_build_query_parts` in jobs/tasks.py: a short keyword phrase
  // (no location) assembled from the toggled profile fields - no LLM involved.
  // Recomputes automatically as the user toggles options or edits the extra text.
  const generatedQuery = useMemo(() => {
    const parts: string[] = [];
    if (includeTitle && profileJobTitle.trim())
      parts.push(profileJobTitle.trim());
    if (includeStack && profileStack.length > 0) parts.push(profileStack[0]!);
    if (includeTnProfession && profileTnProfession)
      parts.push(profileTnProfession);
    if (includeYears && profileYears !== null) {
      parts.push(
        YEARS_QUERY[profileYears] ?? `${profileYears}+ years experience`,
      );
    }
    if (bilingual && languageCount >= 2) parts.push("bilingual");
    if (includeEducation && profileEducation) parts.push(profileEducation);
    if (extraText.trim()) parts.push(extraText.trim());
    return parts.join(" ");
  }, [
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
  ]);

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
        job_search_generated_query: generatedQuery,
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
    generatedQuery,
    t,
  ]);

  return (
    <>
      {prefsSaved && (
        <Toast
          message={t("jobSearchPrefsSaved")}
          variant="success"
          position="top-center"
        />
      )}
      {prefsError && (
        <Toast message={prefsError} variant="error" position="top-center" />
      )}
      <Box display="flex" flexDirection="column" gap={20}>
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
                label={
                  profileTnProfession.trim()
                    ? `${t("jobSearchIncludeTnProfession")} (${profileTnProfession.trim()})`
                    : t("jobSearchIncludeTnProfession")
                }
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
                label={
                  profileLocation.trim()
                    ? `${t("jobSearchIncludeLocation")} (${profileLocation.trim()})`
                    : t("jobSearchIncludeLocation")
                }
                checked={includeLocation}
                onChange={(v) => {
                  setIncludeLocation(v);
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
              </Box>

              <Box
                padding={12}
                borderRadius={8}
                styles={{
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--surface-2)",
                }}
              >
                {generatedQuery ? (
                  <Typography variant="body">{generatedQuery}</Typography>
                ) : (
                  <Typography
                    variant="body"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t("jobSearchQueryEmpty")}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              gap={12}
            >
              <Button
                text={
                  savingPrefs
                    ? t("jobSearchPrefsSaving")
                    : t("jobSearchPrefsSave")
                }
                type="button"
                size="md"
                kind="primary"
                disabled={savingPrefs}
                onClick={() => void handleSavePrefs()}
              />
            </Box>
          </>
        )}
      </Box>
    </>
  );
}
