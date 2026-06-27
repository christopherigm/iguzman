"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { RichText } from "@repo/ui/core-elements/rich-text";
import { useGroqProxy, type LlmMessage } from "@repo/ui/use-groq";

// ─── AI Analysis Configuration ──────────────────────────────────────────────────

/** Output language the LLM is forced to write in, keyed by app locale. */
const LOCALE_LANGUAGE: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazil)",
  de: "German",
};

/** Formality options → tone instruction handed to the model, plus its emoji. */
const FORMALITY_LEVELS = [
  {
    key: "professional",
    emoji: "🥸",
    tone: "a professional, polished business tone",
  },
  { key: "formal", emoji: "🤓", tone: "a very formal and respectful tone" },
  {
    key: "casual",
    emoji: "😎",
    tone: "a casual, friendly, conversational tone",
  },
  {
    key: "slang",
    emoji: "😈",
    tone: "a heavy street tone using local slang, bad words, two meaning words, colloquial expressions",
  },
] as const;

// ─── Web Research Enrichment ────────────────────────────────────────────────────

/** Shape returned by `/api/groq/enrich` (live web search + deep-dive extract). */
interface ResearchResult {
  query: string;
  title: string;
  url: string;
  snippet: string;
}
interface EnrichResponse {
  asOf: string;
  queries: string[];
  results: ResearchResult[];
  extract: { title: string; url: string; content: string } | null;
}

/**
 * Flattens the enrichment payload into a plain-text block the analysis model can
 * read. Returns "" when there is nothing usable so the caller can skip injecting
 * an empty research section.
 */
function formatResearch(data: EnrichResponse): string {
  if (data.results.length === 0 && !data.extract) return "";
  const parts: string[] = [
    `Live web research as of ${data.asOf}. Search queries used: ${data.queries.join(
      "; ",
    )}.`,
  ];
  for (const r of data.results) {
    parts.push(`- ${r.title} (${r.url}): ${r.snippet}`);
  }
  if (data.extract?.content) {
    parts.push(
      "",
      `Deep dive - ${data.extract.title} (${data.extract.url}):`,
      data.extract.content,
    );
  }
  return parts.join("\n");
}

/** Simulation data the analysis reasons over, supplied by the parent on demand. */
export interface AnalysisContext {
  /** Labelled, plain-text dump of every simulation input and calculated figure. */
  summary: string;
  /** Localized asset-type label, used as the purchase fallback when none is typed. */
  assetTypeLabel: string;
}

interface AiAnalysisProps {
  /**
   * Builds the simulation context the model reasons over, or returns `null` when
   * the simulation isn't ready. Called fresh each time the user runs an analysis
   * so the summary always reflects the current inputs.
   */
  buildContext: () => AnalysisContext | null;
  /**
   * Reports the latest analysis text to the parent (or `null` when cleared), so
   * it can be embedded in the exported PDF.
   */
  onAnalysisChange?: (text: string | null) => void;
}

/**
 * AI Analysis panel - lets the user describe their purchase, pick a tone, toggle
 * live web search, and run a streamed financial recommendation over the current
 * simulation. Owns all AI-specific state and the enrichment + LLM pipeline; the
 * parent only supplies the simulation context via `buildContext`.
 */
export function AiAnalysis({
  buildContext,
  onAnalysisChange,
}: AiAnalysisProps) {
  const t = useTranslations("SimulatorPage");
  const locale = useLocale();

  const [purchaseDesc, setPurchaseDesc] = useState<string>("");
  // Tone the model writes in, keyed by FORMALITY_LEVELS. Formal by default.
  const [formality, setFormality] = useState<string>("formal");
  const [analysis, setAnalysis] = useState<string | null>(null);
  // True while the pre-analysis web-search enrichment is running (before the
  // streaming LLM call below takes over via `analyzing`).
  const [enriching, setEnriching] = useState<boolean>(false);
  // Whether to enrich the analysis with live web search results. On by default;
  // users can turn it off for a faster, search-free analysis.
  const [webSearch, setWebSearch] = useState<boolean>(false);
  const {
    generate: generateAnalysis,
    isGenerating: analyzing,
    error: analysisError,
  } = useGroqProxy({ temperature: 0.7 });

  const formalityOptions: SelectOption[] = FORMALITY_LEVELS.map((f) => ({
    value: f.key,
    label: `${f.emoji} ${t(`aiAnalysis.formality.${f.key}` as Parameters<typeof t>[0])}`,
  }));

  // Pull the current simulation summary, optionally enrich it with live web
  // search, then stream a localized recommendation.
  const runAnalysis = async () => {
    const context = buildContext();
    if (!context) return;
    setAnalysis(null);
    onAnalysisChange?.(null);

    const { summary, assetTypeLabel } = context;
    const language = LOCALE_LANGUAGE[locale] ?? "English";
    const tone =
      FORMALITY_LEVELS.find((f) => f.key === formality)?.tone ??
      FORMALITY_LEVELS[0]!.tone;
    const purchase = purchaseDesc.trim() || assetTypeLabel;

    // Best-effort: enrich the analysis with live web search results before the
    // streaming LLM call. The LLM first turns the purchase + simulation into
    // search queries, the scraper runs them, and one top link is deep-dived.
    // Any failure here degrades gracefully to a search-free analysis.
    let research = "";
    if (webSearch) {
      setEnriching(true);
      try {
        const res = await fetch("/api/groq/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchase, simulationSummary: summary }),
        });
        if (res.ok) {
          research = formatResearch((await res.json()) as EnrichResponse);
        }
      } catch {
        // Ignore - analysis proceeds without web research.
      } finally {
        setEnriching(false);
      }
    }

    const messages: LlmMessage[] = [
      {
        role: "system",
        content:
          "You are an impartial financial advisor helping a person in Mexico decide how to fund a " +
          "specific purchase. They are comparing TandaOmni, an interest-free savings circle (tanda / " +
          "ROSCA), against a traditional bank loan. Your only job is to give an objective, " +
          "user-perspective analysis of which option is the better financial choice for THIS purchase, " +
          "based on what the user wants to buy and the numbers in their simulation. " +
          `Respond ONLY in ${language}. ` +
          "Reason from the user's point of view: total cost, interest paid, monthly payment, time to " +
          "ownership, and whether the purchase itself is a sensible use of their money. " +
          "Do NOT advise about the TandaOmni platform itself, its operations, or its trustworthiness, " +
          "and do NOT raise risks about the tanda mechanism such as members missing or defaulting on " +
          "payments, the circle collapsing, or payout ordering - those risks are already mitigated by " +
          "the platform and are out of scope. Treat TandaOmni's stated terms as given. " +
          "You may be given recent web research gathered live for this purchase; use it to ground your " +
          "assessment of the purchase and mention a relevant finding where it helps, but never " +
          "contradict the simulation numbers. If no research is provided, rely on the simulation alone. " +
          `Write in ${tone}. Format the answer in Markdown using EXACTLY these three section ` +
          "headings, in this order, each rendered as a Markdown heading:\n" +
          "🎯 Quick Summary\n" +
          "💸 TandaOmni vs. loan\n" +
          "✅ Final recommendation\n" +
          `Translate the heading text into ${language}, but ALWAYS keep the leading emoji ` +
          "(🎯, 💸, ✅) exactly as shown at the start of each heading. Use short sentences and " +
          "bullet points under each heading. Keep it concise (about 180 words). Do not invent " +
          "numbers beyond those provided.",
      },
      {
        role: "user",
        content:
          `The user is considering purchasing: ${purchase}.\n\n` +
          `Simulation data:\n${summary}\n\n` +
          (research
            ? `${research}\n\nUse the web research above to ground your assessment of the purchase ` +
              "and final recommendation, citing a specific finding where it helps.\n\n"
            : "") +
          "Under the first heading, briefly recap what they want to buy and their situation. Under the " +
          "second, objectively compare TandaOmni to the loan on total cost, interest, and monthly " +
          "payment. Then give a clear final recommendation on whether TandaOmni or a loan is the better " +
          "choice for this purchase. Focus only on the purchase and these two funding options - do not " +
          "discuss the platform or tanda payment risks.",
      },
    ];

    try {
      const text = await generateAnalysis(messages);
      setAnalysis(text);
      onAnalysisChange?.(text);
    } catch {
      // Error surfaced via the hook's `error` state.
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap={20}>
      <Typography
        as="h2"
        fontWeight={700}
        color="var(--foreground)"
        styles={{ textTransform: "uppercase", letterSpacing: 1 }}
      >
        {t("aiAnalysis.heading")}
      </Typography>

      <Card gap={16} padding={20}>
        <Typography color="var(--muted-foreground, #6b7280)">
          {t("aiAnalysis.description")}
        </Typography>

        {/* What is being purchased */}
        <TextInput
          label={t("aiAnalysis.purchaseLabel")}
          value={purchaseDesc}
          onChange={setPurchaseDesc}
          placeholder={t("aiAnalysis.purchasePlaceholder")}
          disabled={analyzing || enriching}
          multirow
          rows={3}
        />

        {/* Tone, live web-search toggle, and run button. Stacked on mobile;
            one row from tablet (sm) up. */}
        <Grid container spacing={2} alignItems="center">
          {/* Live web-search enrichment toggle */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Box
              display="flex"
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              gap={12}
            >
              <Box display="flex" flexDirection="column" gap={2}>
                <Typography fontWeight={600} color="var(--foreground)">
                  {t("aiAnalysis.webSearchLabel")}
                </Typography>
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("aiAnalysis.webSearchHint")}
                </Typography>
              </Box>
              <Switch
                checked={webSearch}
                onChange={setWebSearch}
                disabled={analyzing || enriching || !purchaseDesc}
                aria-label={t("aiAnalysis.webSearchLabel")}
              />
            </Box>
          </Grid>

          {/* Response formality */}
          <Grid size={{ xs: 12, sm: 3 }}>
            <Select
              label={t("aiAnalysis.formalityLabel")}
              value={formality}
              onChange={setFormality}
              options={formalityOptions}
              disabled={analyzing || enriching}
            />
          </Grid>

          {/* Run analysis */}
          <Grid size={{ xs: 12, sm: 3 }}>
            <Button
              text={
                enriching
                  ? t("aiAnalysis.searching")
                  : analyzing
                    ? t("aiAnalysis.analyzing")
                    : t("aiAnalysis.analyzeButton")
              }
              kind="primary"
              size="md"
              onClick={runAnalysis}
              disabled={analyzing || enriching}
              width="100%"
            />
          </Grid>
        </Grid>

        {(enriching || analyzing) && (
          <Box display="flex" flexDirection="column" gap={8}>
            <ProgressBar
              label={
                enriching
                  ? t("aiAnalysis.searching")
                  : t("aiAnalysis.analyzing")
              }
            />
            <Typography
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
            >
              {enriching
                ? t("aiAnalysis.searchNote")
                : t("aiAnalysis.loadingNote")}
            </Typography>
          </Box>
        )}

        {!analyzing && !enriching && analysisError && (
          <Box
            padding="12px 16px"
            borderRadius={8}
            backgroundColor="color-mix(in srgb, var(--error, #dc2626) 12%, transparent)"
          >
            <Typography color="var(--foreground)">
              {t("aiAnalysis.error")}
            </Typography>
          </Box>
        )}

        {!analyzing && analysis && (
          <Box
            padding="16px"
            borderRadius={8}
            backgroundColor="var(--surface-2)"
          >
            <RichText>{analysis}</RichText>
          </Box>
        )}
      </Card>
    </Box>
  );
}

export default AiAnalysis;
