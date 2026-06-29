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
import { SourceRow } from "./analysis/source-row";
import type { TierKey } from "../lib/tiers";

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
 * A single web source consulted during enrichment, surfaced to the user (and to
 * the parent for the PDF export) so the analysis is traceable to its sources.
 */
export interface AnalysisSource {
  title: string;
  url: string;
  snippet: string;
  /** True for the single deep-dived "main article consulted" (the extract). */
  main?: boolean;
}

/**
 * True for sponsored search "results" that are really ad-network click
 * trackers/redirects (e.g. `duckduckgo.com/y.js?ad_domain=…`, `bing.com/aclick`)
 * rather than a genuine source. These are dropped before sources are surfaced.
 */
function isAdLink(url: string): boolean {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    // DuckDuckGo ad redirect: /y.js with ad_* params.
    if (host === "duckduckgo.com" && pathname.startsWith("/y.js")) return true;
    if (searchParams.has("ad_domain") || searchParams.has("ad_provider"))
      return true;
    // Bing ad click redirect.
    if (host === "bing.com" && pathname.startsWith("/aclick")) return true;
    return false;
  } catch {
    return false;
  }
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

// ─── Per-tier prompt tailoring ──────────────────────────────────────────────────
//
// The analysis prompt is split by tier rather than sent as one monolithic
// message. The shared parts (role, language, no-moralizing, TandaOmni-out-of-
// scope, web-research grounding, markdown format) live in `buildSystemPrompt` /
// `buildUserPrompt`; only the tier-specific pieces below are swapped in. This
// drops the red-flag clauses that don't apply to a given tier (sharpening
// accuracy) and shrinks the payload, and points the model at the funding
// counterpart that tier actually competes with.

interface TierPrompt {
  /** The funding alternative this tier competes with, long form (intro). */
  counterpartLong: string;
  /** Short noun for the alternative, used inline in the comparison instructions. */
  counterpartShort: string;
  /** Tier-specific red-flag rule for the system prompt (what may be flagged). */
  systemRedFlag: string;
  /** How to use any web research for this tier (appended to the research block). */
  researchGuidance: string;
  /** Risk instruction under the first heading (recap). */
  riskFirstHeading: string;
  /** Risk instruction under the third heading (final recommendation). */
  riskThirdHeading: string;
  /** Optional extra emphasis for the comparison heading (high-CAT lenders). */
  secondHeadingExtra?: string;
}

const TIER_PROMPTS: Record<TierKey, TierPrompt> = {
  real_estate: {
    counterpartLong: "a traditional bank mortgage",
    counterpartShort: "the bank mortgage",
    systemRedFlag:
      "Only flag the purchase itself when it crosses a HIGH bar of GENUINE physical or legal " +
      "danger to this specific property - for example building or buying on an active fault line, " +
      "in a flood zone, on the slope of an active volcano, or a property with clear title/legal " +
      "problems (no clean deed, liens, or irregular/ejido land). If live web research about the " +
      "location or property is provided, use it to check for such hazards. If - and ONLY if - such " +
      "a red flag is clearly present, flag it prominently and advise caution regardless of how " +
      "attractive the financing looks. Otherwise do NOT discourage the purchase; a fairly-priced, " +
      "legally-clean property is not a risk. Do not invent a red flag where none exists.",
    researchGuidance:
      "If location or property research is provided, use it to check for physical or legal hazards " +
      "(fault line, flood zone, active volcano, title/ejido problems) and only flag the property " +
      "when such a hazard is clearly present.",
    riskFirstHeading:
      "Only mention a risk in the property itself if it crosses the high bar of genuine physical " +
      "or legal danger; otherwise do not raise one.",
    riskThirdHeading:
      "ONLY if such a high-bar danger is clearly present should you instead advise caution about " +
      "the property; otherwise do not invent risks or discourage a normal, legally-clean purchase.",
  },
  vehicle: {
    counterpartLong: "a traditional bank auto loan",
    counterpartShort: "the auto loan",
    systemRedFlag:
      "Only flag the purchase itself when it crosses a HIGH bar, namely: (a) a GROSS overpayment, " +
      "where the stated price is wildly out of line with the vehicle's real market value for its " +
      "make, model, year, and condition; or (b) a GENUINE legal or safety problem with this " +
      "specific vehicle, such as a salvage/rebuilt or flood-damaged title, a wrecked ('auto " +
      "chocado') or odometer-rolled-back history, or no clean papers/import documents. When live " +
      "web research is provided, USE it to establish the vehicle's current market price before " +
      "judging a gross overpayment. If - and ONLY if - one of these is clearly present, flag it " +
      "prominently and advise caution regardless of how attractive the financing looks. Otherwise " +
      "do NOT discourage the purchase; a fairly-priced vehicle with clean papers is not a risk. " +
      "Do not invent a red flag where none exists.",
    researchGuidance:
      "If research is provided, use it to establish the vehicle's current market price for its " +
      "make, model, year, and condition, and to check for salvage/legal/safety problems; only flag " +
      "a gross overpayment or a legal problem when clearly present.",
    riskFirstHeading:
      "Only mention a risk in the vehicle itself if it crosses the high bar (gross overpayment vs " +
      "market, or a salvage/legal/safety problem); otherwise do not raise one.",
    riskThirdHeading:
      "ONLY if such a high-bar red flag is clearly present should you advise caution about the " +
      "vehicle; otherwise do not invent risks or discourage a fairly-priced vehicle with clean papers.",
  },
  travel: {
    counterpartLong: "a high-interest consumer or payday lender",
    counterpartShort: "the consumer lender",
    systemRedFlag:
      "A trip is a normal, personal purchase: do NOT raise a red flag about the purchase itself - " +
      "there is no 'overpriced' or 'dangerous' trip to weigh here. Keep the focus entirely on " +
      "funding the trip on the best terms. (You may briefly note a safety point only if live web " +
      "research clearly reports an active travel advisory for the destination, but never discourage " +
      "the trip on grounds of cost or taste.)",
    researchGuidance:
      "If research is provided, use it only to add helpful, concrete context about the trip " +
      "(typical prices, timing, tips); do not use it to discourage the trip.",
    riskFirstHeading:
      "Do not raise a red flag about the trip itself - a trip is a normal personal purchase.",
    riskThirdHeading:
      "Recommend the better funding option and do not discourage the trip on grounds of cost or taste.",
    secondHeadingExtra:
      "Make the contrast stark: the consumer lender's CAT is extremely high, so emphasize how much " +
      "interest TandaOmni avoids and reference the total repaid as a multiple of the amount financed.",
  },
  small_purchases: {
    counterpartLong: "store credit or a high-interest consumer lender",
    counterpartShort: "the store-credit / consumer lender",
    systemRedFlag:
      "Only flag the purchase itself when it crosses a HIGH bar: a GROSS overpayment, where the " +
      "stated price is wildly out of line with the item's real street/retail value - for example a " +
      "phone, camera, console, or other consumer electronic priced at several times its normal " +
      "retail price (such as paying $100,000 MXN for a device that sells for about $30,000 MXN). " +
      "When the item is named and live web research is provided, USE that research to establish the " +
      "item's current street/retail price before judging a gross overpayment. There is no physical " +
      "or legal danger to weigh for a small consumer good - only price. If - and ONLY if - the price " +
      "is clearly far above market, flag it prominently; otherwise do NOT discourage the purchase. " +
      "Do not invent a red flag where none exists; a fairly-priced item is not a risk.",
    researchGuidance:
      "If the item is named and research is provided, use it to check the item's current " +
      "street/retail price, and only flag a gross overpayment when the stated price is clearly far " +
      "above it.",
    riskFirstHeading:
      "Only mention a risk if the price is a gross overpayment versus the item's market price; " +
      "there is no physical or legal danger to weigh for a small consumer good.",
    riskThirdHeading:
      "ONLY if the price is clearly far above market should you advise caution; otherwise do not " +
      "discourage a fairly-priced item.",
    secondHeadingExtra:
      "Make the contrast stark: the lender's CAT is very high, so emphasize how much interest " +
      "TandaOmni avoids and reference the total repaid as a multiple of the amount financed.",
  },
};

/**
 * Assembles the tier-tailored system prompt: shared guardrails plus the tier's
 * own red-flag rule and funding counterpart.
 */
function buildSystemPrompt(
  tier: TierKey,
  language: string,
  tone: string,
): string {
  const tp = TIER_PROMPTS[tier];
  return [
    "You are a practical financial advisor helping a person in Mexico fund a specific purchase. " +
      "They are comparing TandaOmni, an interest-free savings circle (tanda / ROSCA), against " +
      `${tp.counterpartLong}. Treat the purchase as the user's own decision that they have already ` +
      "made: your MAIN job is to help them pay for it on the best terms by comparing TandaOmni " +
      `against ${tp.counterpartShort} and showing, with the numbers, why the interest-free TandaOmni ` +
      "route is usually the cheaper, smarter way to pay.",
    `Respond ONLY in ${language}.`,
    "Do NOT moralize about whether they should buy it, second-guess their taste, or lecture them " +
      "about depreciation, resale value, model turnover, or whether a cheaper alternative exists - " +
      "assume they have already decided what they want and focus on the financing.",
    tp.systemRedFlag,
    "Reason from the user's point of view: total cost, interest paid, monthly payment, and time to " +
      "ownership.",
    "Do NOT advise about the TandaOmni platform itself, its operations, or its trustworthiness, and " +
      "do NOT raise risks about the tanda mechanism such as members missing or defaulting on " +
      "payments, the circle collapsing, or payout ordering - those risks are already mitigated by " +
      "the platform and are out of scope. Treat TandaOmni's stated terms as given.",
    "You may be given recent web research gathered live for this purchase; use it to ground your " +
      "assessment of the purchase and mention a relevant finding where it helps, but never " +
      "contradict the simulation numbers. If no research is provided, rely on the simulation alone.",
    `Write in ${tone}. Format the answer in Markdown using EXACTLY these three section headings, in ` +
      "this order, each rendered as a Markdown heading:\n" +
      "🎯 Quick Summary\n" +
      "💸 TandaOmni vs. loan\n" +
      "✅ Final recommendation\n" +
      `Translate the heading text into ${language}, but ALWAYS keep the leading emoji ` +
      "(🎯, 💸, ✅) exactly as shown at the start of each heading. Use short sentences and bullet " +
      "points under each heading. Keep it concise (about 180 words). Do not invent numbers beyond " +
      "those provided.",
  ].join("\n");
}

/**
 * Assembles the tier-tailored user prompt: the purchase, the simulation summary,
 * any web research (with tier-specific guidance), and the per-heading
 * instructions pointed at the tier's red flags and funding counterpart.
 */
function buildUserPrompt(
  tier: TierKey,
  purchase: string,
  summary: string,
  research: string,
): string {
  const tp = TIER_PROMPTS[tier];
  const parts: string[] = [
    `The user is considering purchasing: ${purchase}.`,
    `Simulation data:\n${summary}`,
  ];
  if (research) {
    parts.push(
      `${research}\n\nUse the web research above to ground your assessment of the purchase and final ` +
        `recommendation, citing a specific finding where it helps. ${tp.researchGuidance}`,
    );
  }
  parts.push(
    `Under the first heading, briefly recap what they want to buy and their situation. ${tp.riskFirstHeading} ` +
      `Under the second heading, objectively compare TandaOmni to ${tp.counterpartShort} on total cost, ` +
      "interest, and monthly payment, highlighting TandaOmni's interest-free advantage." +
      (tp.secondHeadingExtra ? ` ${tp.secondHeadingExtra}` : "") +
      ` Under the third heading, give a clear final recommendation: by default, recommend the better ` +
      `funding option (usually TandaOmni) and explain why. ${tp.riskThirdHeading} ` +
      "Focus on the purchase and these two funding options - do not discuss the platform or tanda " +
      "payment risks.",
  );
  return parts.join("\n\n");
}

/** Simulation data the analysis reasons over, supplied by the parent on demand. */
export interface AnalysisContext {
  /** Labelled, plain-text dump of every simulation input and calculated figure. */
  summary: string;
  /** Localized asset-type label, used as the purchase fallback when none is typed. */
  assetTypeLabel: string;
  /**
   * Which financing tier the simulation is for. Selects a tailored LLM prompt
   * (relevant red flags + the correct funding counterpart) instead of one
   * monolithic message, improving accuracy and shrinking the payload.
   */
  tier: TierKey;
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
  /**
   * Reports the web sources consulted for the latest analysis (empty when web
   * search is off or none were found), so they can be listed in the PDF export.
   */
  onSourcesChange?: (sources: AnalysisSource[]) => void;
  /**
   * Reports the search queries the model ran during enrichment (empty when web
   * search is off), so they can be listed alongside the sources in the PDF.
   */
  onQueriesChange?: (queries: string[]) => void;
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
  onSourcesChange,
  onQueriesChange,
}: AiAnalysisProps) {
  const t = useTranslations("SimulatorPage");
  const locale = useLocale();

  const [purchaseDesc, setPurchaseDesc] = useState<string>("");
  // Tone the model writes in, keyed by FORMALITY_LEVELS. Formal by default.
  const [formality, setFormality] = useState<string>("formal");
  const [analysis, setAnalysis] = useState<string | null>(null);
  // Web sources consulted for the current analysis (populated by the enrichment
  // step when web search is on); listed below the analysis and in the PDF.
  const [sources, setSources] = useState<AnalysisSource[]>([]);
  // Search queries the model ran during enrichment; listed below the sources
  // and carried into the PDF export so the research is fully traceable.
  const [queries, setQueries] = useState<string[]>([]);
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
    setSources([]);
    onSourcesChange?.([]);
    setQueries([]);
    onQueriesChange?.([]);

    const { summary, assetTypeLabel, tier } = context;
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
          const data = (await res.json()) as EnrichResponse;
          research = formatResearch(data);
          // The deep-dived article (the extract) is the main source consulted.
          // Flag it and surface it at the top of the list.
          const deepDiveUrl = data.extract?.url;
          const consulted: AnalysisSource[] = data.results
            // Drop ad-network click trackers/redirects masquerading as sources.
            .filter(({ url }) => !isAdLink(url))
            .map(({ title, url, snippet }) => ({
              title,
              url,
              snippet,
              main: !!deepDiveUrl && url === deepDiveUrl,
            }));
          // If the deep-dived page wasn't among the search results, prepend it
          // so the main article is always shown.
          if (data.extract && !consulted.some((s) => s.main)) {
            consulted.unshift({
              title: data.extract.title,
              url: data.extract.url,
              snippet: "",
              main: true,
            });
          }
          consulted.sort((a, b) => Number(b.main) - Number(a.main));
          setSources(consulted);
          onSourcesChange?.(consulted);
          const ranQueries = data.queries ?? [];
          setQueries(ranQueries);
          onQueriesChange?.(ranQueries);
        }
      } catch {
        // Ignore - analysis proceeds without web research.
      } finally {
        setEnriching(false);
      }
    }

    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt(tier, language, tone) },
      {
        role: "user",
        content: buildUserPrompt(tier, purchase, summary, research),
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

        {/* Sources consulted via live web search, so the user can trace the
            analysis back to the pages it was grounded on. */}
        {!analyzing && !enriching && sources.length > 0 && (
          <Box display="flex" flexDirection="column" gap={8}>
            <Box display="flex" flexDirection="column" gap={2}>
              <Typography fontWeight={600} color="var(--foreground)">
                {t("aiAnalysis.sourcesHeading")}
              </Typography>
              <Typography
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("aiAnalysis.sourcesNote")}
              </Typography>
            </Box>
            {sources.map((s, idx) => (
              <SourceRow
                key={s.url}
                title={s.title}
                url={s.url}
                snippet={s.snippet}
                idx={idx}
                last={idx === sources.length - 1}
                main={s.main}
                mainLabel={t("aiAnalysis.mainSourceLabel")}
              />
            ))}
          </Box>
        )}

        {/* Search queries the model ran to gather the sources above, so the
            research path is fully traceable. */}
        {!analyzing && !enriching && queries.length > 0 && (
          <Box display="flex" flexDirection="column" gap={8}>
            <Box display="flex" flexDirection="column" gap={2}>
              <Typography fontWeight={600} color="var(--foreground)">
                {t("aiAnalysis.queriesHeading")}
              </Typography>
              <Typography
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("aiAnalysis.queriesNote")}
              </Typography>
            </Box>
            <Box
              display="flex"
              flexDirection="row"
              flexWrap="wrap"
              gap={8}
              alignItems="center"
            >
              {queries.map((q) => (
                <Box
                  key={q}
                  padding="4px 12px"
                  borderRadius={999}
                  backgroundColor="var(--surface-2)"
                  styles={{ border: "1px solid var(--border, #e5e7eb)" }}
                >
                  <Typography variant="caption" color="var(--foreground)">
                    {q}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Card>
    </Box>
  );
}

export default AiAnalysis;
