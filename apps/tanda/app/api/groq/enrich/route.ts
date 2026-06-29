import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const SCRAPER_SEARCH_URL = "https://scraper.iguzman.com.mx/search";
const SCRAPER_EXTRACT_URL = "https://scraper.iguzman.com.mx/extract";
// Small, fast model for the query-builder step (mirrors the edge-folio extract route).
const QUERY_MODEL = process.env.GROQ_QUERY_MODEL ?? "llama-3.1-8b-instant";
// Fallback model used when Groq is rate-limited (mirrors /api/groq/chat).
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";

/**
 * Runs a non-streaming JSON-mode chat completion through Groq, transparently
 * falling back to OpenRouter on a Groq 429 (rate limit) — mirroring the
 * `/api/groq/chat` proxy so enrichment keeps producing queries (and therefore
 * sources) even when Groq is throttled. Returns the assistant message content,
 * or "" on any failure so callers can degrade gracefully.
 */
async function llmJson(
  groqApiKey: string,
  messages: { role: string; content: string }[],
  temperature: number,
): Promise<string> {
  const body = {
    model: QUERY_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
  };
  try {
    let res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openrouterApiKey) return "";
      console.warn(
        "[groq/enrich] Groq rate limit hit; falling back to OpenRouter",
      );
      res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterApiKey}`,
        },
        body: JSON.stringify({ ...body, model: OPENROUTER_MODEL }),
      });
    }
    if (!res.ok) return "";
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

const MAX_QUERIES = 2;
const RESULTS_PER_QUERY = 4;
const MAX_EXTRACT_CHARS = 6_000;

interface EnrichBody {
  /** Free-text description of what the user wants to buy. */
  purchase?: string;
  /** The labelled simulation summary the client already builds for the analysis. */
  simulationSummary?: string;
}

interface ScraperSearchResult {
  title: string;
  url: string;
  snippet: string;
  og_image?: string | null;
  engine?: string;
}

interface ScraperExtractResult {
  title: string;
  url: string;
  content: string;
}

/** One de-duplicated search hit, tagged with the query that produced it. */
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
  extract: ScraperExtractResult | null;
}

// ── Step 1: build search queries with the LLM ──────────────────────────────────

async function buildQueries(
  groqApiKey: string,
  purchase: string,
  simulationSummary: string,
  asOf: string,
): Promise<string[]> {
  const messages = [
    {
      role: "system",
      content:
        "You generate web search queries that surface up-to-date, real-world context " +
        `for a financial purchase decision. Today is ${asOf}.`,
    },
    {
      role: "user",
      content:
        `The user is considering this purchase: ${purchase}\n\n` +
        `Simulation context:\n${simulationSummary}\n\n` +
        `Generate 1 to ${MAX_QUERIES} web search queries that will find recent risks, ` +
        "recommendations, advantages, market conditions, and general information relevant " +
        "to this purchase. Guidelines:\n" +
        "- Choose the language most likely to surface authoritative local sources for the " +
        "target market (e.g. Spanish for purchases in Mexico, English for global topics).\n" +
        `- Include the current month and year (${asOf}) in time-sensitive queries to force ` +
        "fresh results.\n" +
        "- Make the queries specific and varied (market outlook, risks, price trends, etc.), " +
        "not near-duplicates of each other.\n" +
        'Return ONLY a JSON object of the form: { "queries": ["...", "..."] }',
    },
  ];

  try {
    const content = await llmJson(groqApiKey, messages, 0.3);
    if (!content) return [];
    const parsed = JSON.parse(content) as { queries?: unknown };
    const raw = Array.isArray(parsed.queries) ? parsed.queries : [];
    return raw
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim())
      .slice(0, MAX_QUERIES);
  } catch {
    return [];
  }
}

// ── Step 2: run each query through the scraper search endpoint ──────────────────

async function searchQuery(
  query: string,
  scraperKey: string,
): Promise<ScraperSearchResult[]> {
  try {
    const res = await fetch(SCRAPER_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(scraperKey ? { "X-API-Key": scraperKey } : {}),
      },
      body: JSON.stringify({
        query,
        engine: "duckduckgo",
        maxResults: RESULTS_PER_QUERY,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as ScraperSearchResult[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Step 3: let the LLM pick the single most relevant link to deep-dive ─────────

async function pickBestResultIndex(
  groqApiKey: string,
  purchase: string,
  results: ResearchResult[],
): Promise<number> {
  // Nothing to choose between — keep the top hit.
  if (results.length <= 1) return 0;

  const list = results
    .map(
      (r, i) =>
        `${i}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet || "(no snippet)"}`,
    )
    .join("\n\n");

  const messages = [
    {
      role: "system",
      content:
        "You select the single most useful web page to read in full for grounding a " +
        "financial purchase decision. Pick the page richest in real-world, decision-relevant " +
        "context (market outlook, prices, risks, reviews, expert recommendations). " +
        "Strongly avoid low-value pages: dictionary/translation entries (e.g. spanishdict, " +
        "wordreference, linguee), thin definitions, login walls, pure listings/aggregators " +
        "with no analysis, and unrelated results.",
    },
    {
      role: "user",
      content:
        `Purchase under consideration: ${purchase}\n\n` +
        `Candidate search results:\n\n${list}\n\n` +
        'Return ONLY a JSON object of the form: { "index": <number> } where index is the ' +
        "0-based position of the best page to read in full.",
    },
  ];

  try {
    const content = await llmJson(groqApiKey, messages, 0);
    if (!content) return 0;
    const parsed = JSON.parse(content) as { index?: unknown };
    const idx =
      typeof parsed.index === "number" ? Math.trunc(parsed.index) : NaN;
    return Number.isInteger(idx) && idx >= 0 && idx < results.length ? idx : 0;
  } catch {
    return 0;
  }
}

// ── Step 4: deep-dive the chosen link ──────────────────────────────────────────

async function extractUrl(
  url: string,
  scraperKey: string,
): Promise<ScraperExtractResult | null> {
  try {
    const res = await fetch(SCRAPER_EXTRACT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(scraperKey ? { "X-API-Key": scraperKey } : {}),
      },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ScraperExtractResult;
    if (!data?.content) return null;
    return {
      title: data.title ?? "",
      // Report the URL we were asked to read (the search-result URL), NOT the
      // scraper's canonicalized/redirect-resolved one. The client matches this
      // against `results[*].url` to flag the "main article consulted"; using the
      // scraper's normalized URL breaks that match and drops the highlight.
      url,
      content: data.content.slice(0, MAX_EXTRACT_CHARS),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const { purchase = "", simulationSummary = "" } =
    (await req.json()) as EnrichBody;

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json(
      { detail: "Groq API key not configured." },
      { status: 500 },
    );
  }

  // Anchor every search to the server's current month + year (e.g. "June 2026")
  // so the model and the search engines surface fresh, time-relevant results.
  const asOf = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const scraperKey = process.env.SCRAPER_API_KEY ?? "";

  // 1. Ask the LLM for up to MAX_QUERIES search queries.
  let queries = await buildQueries(
    groqApiKey,
    purchase || "a major purchase",
    simulationSummary,
    asOf,
  );

  // Guarantee a search always runs when web enrichment is requested: if the
  // query-builder LLM produced nothing (e.g. both Groq AND OpenRouter are
  // throttled, or it returned malformed JSON), fall back to a deterministic
  // query derived from the purchase text and anchored to the current month/year.
  // Without this the route would return zero results and the UI would silently
  // show no "Sources consulted" list.
  if (queries.length === 0) {
    queries = [`${(purchase || "a major purchase").trim()} ${asOf}`.trim()];
  }

  // 2. Search every query in parallel, then flatten in query order and dedupe by URL.
  const perQuery = await Promise.all(
    queries.map((q) => searchQuery(q, scraperKey)),
  );

  const seen = new Set<string>();
  const results: ResearchResult[] = [];
  perQuery.forEach((hits, i) => {
    const query = queries[i]!;
    for (const hit of hits) {
      if (!hit.url || seen.has(hit.url)) continue;
      seen.add(hit.url);
      results.push({
        query,
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
      });
    }
  });

  // 3. Ask the LLM which result is worth reading in full, then deep-dive it for
  //    richer grounding than the snippets alone. Falls back to the top hit if the
  //    picker fails, but explicitly steers away from dictionary/low-value pages.
  let extract: ScraperExtractResult | null = null;
  if (results.length > 0) {
    const bestIdx = await pickBestResultIndex(
      groqApiKey,
      purchase || "a major purchase",
      results,
    );
    extract = await extractUrl(results[bestIdx]!.url, scraperKey);
  }

  const response: EnrichResponse = { asOf, queries, results, extract };
  return NextResponse.json(response);
}
