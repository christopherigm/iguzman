"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  generateNaftaLetter,
  suggestTnCategory,
  getApplication,
  ApplicationError,
  type JobApplication,
  type NaftaLetterPayload,
  type TnCategorySuggestion,
} from "@/lib/applications";
import type { UserProfile } from "@/lib/auth";
import { TN_PROFESSIONS, CITIZENSHIP_OPTIONS } from "@/lib/nafta-constants";
import { SwitchRow } from "./detail-primitives";

interface Props {
  app: JobApplication;
  profile: UserProfile | null;
  companyDescription: string;
}

/**
 * Self-contained "NAFTA / TN Visa Letter" section: owns the letter parameters,
 * the generated letter, its async generation (with polling) and PDF export, and
 * the TN-category suggestion modal.
 */
export function NaftaLetterSection({
  app,
  profile,
  companyDescription,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const locale = useLocale();

  // Letter parameters
  const [tnProfession, setTnProfession] = useState(
    profile?.tn_profession ?? "",
  );
  const [isContinuation, setIsContinuation] = useState(false);
  const [citizenship, setCitizenship] = useState(profile?.citizenship ?? "");
  const [dob, setDob] = useState("");
  const [passport, setPassport] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("40");
  const [duration, setDuration] = useState("3 years");
  const [companyDescriptionInput, setCompanyDescriptionInput] = useState("");

  // Generation state
  const [generating, setGenerating] = useState(
    app.nafta_letter_status === "processing",
  );
  const [letter, setLetter] = useState<string | null>(app.nafta_letter || null);
  const [error, setError] = useState<string | null>(null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TN suggestion
  const [suggestModal, setSuggestModal] = useState(false);
  const [suggestResults, setSuggestResults] = useState<TnCategorySuggestion[]>(
    [],
  );
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function stopPolling() {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function startPolling(appId: number) {
    if (pollingRef.current) return;
    setGenerating(true);
    let errorCount = 0;

    const schedule = () => {
      pollingRef.current = setTimeout(async () => {
        try {
          const data = await getApplication(appId);
          if (data.nafta_letter_status === "complete") {
            setLetter(data.nafta_letter || null);
            setGenerating(false);
            pollingRef.current = null;
            return;
          }
          if (data.nafta_letter_status === "failed") {
            setError(t("errorNaftaLetter"));
            setGenerating(false);
            pollingRef.current = null;
            return;
          }
          errorCount = 0;
        } catch {
          errorCount++;
          if (errorCount >= 3) {
            setError(t("errorNaftaLetter"));
            setGenerating(false);
            stopPolling();
            return;
          }
        }
        if (pollingRef.current !== null) schedule();
      }, 5000);
    };

    schedule();
  }

  // Resume polling if generation was already running when the page loaded.
  useEffect(() => {
    if (app.nafta_letter_status === "processing") {
      startPolling(app.id);
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    setError(null);
    const combinedCompanyDesc = [
      app.company?.description ?? companyDescription,
      companyDescriptionInput,
    ]
      .filter(Boolean)
      .join("\n\n");
    const payload: NaftaLetterPayload = {
      tn_profession: tnProfession || undefined,
      is_continuation: isContinuation,
      citizenship: citizenship || undefined,
      date_of_birth: dob || undefined,
      passport_number: passport || undefined,
      hours_per_week: hoursPerWeek ? Number(hoursPerWeek) : 40,
      duration: duration || "3 years",
      company_description: combinedCompanyDesc || undefined,
    };
    try {
      const result = await generateNaftaLetter(app.id, payload, locale);
      if (result.status === "complete") {
        // Eager (no broker) path: already done – re-fetch to get the letter text.
        const data = await getApplication(app.id);
        setLetter(data.nafta_letter || null);
        setGenerating(false);
      } else if (result.status === "failed") {
        setError(t("errorNaftaLetter"));
        setGenerating(false);
      } else {
        startPolling(app.id);
      }
    } catch {
      setError(t("errorNaftaLetter"));
      setGenerating(false);
    }
  }

  async function handleDownloadPDF() {
    if (!letter) return;
    setExportingPDF(true);
    setPdfError(null);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { NaftaLetterDocument } = await import("./resume-pdf");
      const blob = await pdf(
        <NaftaLetterDocument
          companyName={app.company_name}
          letterText={letter}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${app.company_name}-${app.job_title}-tn-nafta-letter.pdf`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError(t("errorNaftaPDF"));
    } finally {
      setExportingPDF(false);
    }
  }

  async function handleSuggestCategory() {
    setSuggestError(null);
    setSuggestLoading(true);
    try {
      const result = await suggestTnCategory(locale);
      setSuggestResults(result.suggestions);
      setSuggestModal(true);
    } catch (err) {
      const is400 = err instanceof ApplicationError && err.status === 400;
      setSuggestError(t(is400 ? "tnSuggestNoData" : "tnSuggestError"));
    } finally {
      setSuggestLoading(false);
    }
  }

  const companyBusy =
    app.company?.status === "pending" || app.company?.status === "processing";

  return (
    <Box marginBottom={28} marginTop={48}>
      {suggestModal && (
        <ConfirmationModal
          title={t("tnSuggestModalTitle")}
          text={t("tnSuggestModalSubtitle")}
          okCallback={() => setSuggestModal(false)}
          panelMaxWidth="540px"
        >
          <Box display="flex" flexDirection="column" gap={16} marginTop={4}>
            {suggestResults.length === 0 ? (
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("tnSuggestNoMatches")}
              </Typography>
            ) : (
              suggestResults.map((r) => {
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
                    <Typography variant="body" styles={{ lineHeight: 1.5 }}>
                      {r.explanation}
                    </Typography>
                  </Box>
                );
              })
            )}
          </Box>
        </ConfirmationModal>
      )}

      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
        {t("naftaLetterTitle")}
      </Typography>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={12}
      />
      <Typography
        variant="body"
        color="var(--muted-foreground, #6b7280)"
        marginBottom={16}
        as="p"
      >
        {t("naftaLetterSubtitle")}
      </Typography>

      {/* ── NAFTA parameters ── */}
      <Card display="flex" flexDirection="column" gap={14} marginBottom={20}>
        <Box display="flex" gap={12} flexWrap="wrap">
          <Box flex={2} styles={{ minWidth: 220 }}>
            <Box display="flex" alignItems="center" gap={8}>
              <Box styles={{ flex: 1 }}>
                <Select
                  label={t("naftaProfessionLabel")}
                  value={tnProfession}
                  onChange={setTnProfession}
                  options={[
                    { value: "", label: t("naftaProfessionPlaceholder") },
                    ...TN_PROFESSIONS,
                  ]}
                  disabled={suggestLoading}
                  width="100%"
                />
              </Box>
              <Button
                unstyled
                type="button"
                icon="/icons/enhance.svg"
                iconSize="16px"
                iconColor={
                  suggestLoading
                    ? "var(--primary, #06b6d4)"
                    : "var(--foreground, #171717)"
                }
                disabled={suggestLoading}
                onClick={() => void handleSuggestCategory()}
                aria-label={t("tnSuggestLabel")}
                title={t("tnSuggestLabel")}
                className={[
                  "ai-enhance-btn",
                  suggestLoading ? "ai-enhance-btn--busy" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </Box>
            {suggestLoading && (
              <ProgressBar label={t("tnSuggestGenerating")} marginTop={8} />
            )}
            {suggestError && (
              <Typography
                variant="body"
                role="alert"
                color="var(--error, #ef4444)"
              >
                {suggestError}
              </Typography>
            )}
          </Box>
          <Box flex={1} styles={{ minWidth: 140 }}>
            <Select
              label={t("naftaCitizenshipLabel")}
              value={citizenship}
              onChange={setCitizenship}
              options={[
                { value: "", label: t("naftaCitizenshipPlaceholder") },
                ...CITIZENSHIP_OPTIONS,
              ]}
              width="100%"
            />
          </Box>
        </Box>

        <Box display="flex" gap={12} flexWrap="wrap">
          <Box flex={1} styles={{ minWidth: 160 }}>
            <TextInput
              label={t("naftaDobLabel")}
              value={dob}
              onChange={setDob}
              placeholder="e.g. January 1, 1990"
              width="100%"
            />
          </Box>
          <Box flex={1} styles={{ minWidth: 160 }}>
            <TextInput
              label={t("naftaPassportLabel")}
              value={passport}
              onChange={setPassport}
              width="100%"
            />
          </Box>
        </Box>

        <Box display="flex" gap={12} flexWrap="wrap">
          <Box flex={1} styles={{ minWidth: 120 }}>
            <TextInput
              label={t("naftaHoursLabel")}
              value={hoursPerWeek}
              onChange={setHoursPerWeek}
              type="number"
              width="100%"
            />
          </Box>
          <Box flex={1} styles={{ minWidth: 160 }}>
            <TextInput
              label={t("naftaDurationLabel")}
              value={duration}
              onChange={setDuration}
              placeholder="e.g. 3 years"
              width="100%"
            />
          </Box>
        </Box>

        <SwitchRow
          label={t("naftaContinuationLabel")}
          checked={isContinuation}
          onChange={setIsContinuation}
        />

        <Box>
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            as="p"
            marginBottom={6}
            marginTop={8}
          >
            {t("naftaCompanyDescLabel")}
          </Typography>
          <TextInput
            multirow
            rows={10}
            value={companyDescriptionInput}
            onChange={setCompanyDescriptionInput}
            placeholder={t("naftaCompanyDescPlaceholder")}
            width="100%"
            aria-label={t("naftaCompanyDescLabel")}
          />
        </Box>
      </Card>

      <Box display="flex" justifyContent="center" marginBottom={12}>
        <Button
          text={
            generating
              ? t("generatingNafta")
              : letter
                ? t("regenerateNafta")
                : t("generateNafta")
          }
          type="button"
          size="md"
          kind="primary"
          disabled={generating || companyBusy}
          onClick={handleGenerate}
        />
        {generating && <ProgressBar label={t("generatingNafta")} />}
      </Box>
      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
      {letter && (
        <Card display="flex" flexDirection="column" gap={8}>
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            as="p"
          >
            {t("naftaEditHint")}
          </Typography>
          <TextInput
            multirow
            className="detail__cover-letter"
            value={letter}
            onChange={setLetter}
            rows={24}
            width="100%"
            aria-label={t("naftaLetterTitle")}
          />
          <Box display="flex" gap={8} justifyContent="center">
            <Button
              text={
                exportingPDF ? t("downloadingNaftaPDF") : t("downloadNaftaPDF")
              }
              type="button"
              size="md"
              kind="primary"
              disabled={exportingPDF}
              onClick={handleDownloadPDF}
            />
          </Box>
          {pdfError && (
            <Typography variant="body" color="var(--error, #ef4444)" as="p">
              {pdfError}
            </Typography>
          )}
        </Card>
      )}
    </Box>
  );
}
