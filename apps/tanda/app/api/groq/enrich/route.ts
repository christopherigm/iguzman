import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const SCRAPER_SEARCH_URL = "https://scraper.iguzman.com.mx/search";
const SCRAPER_EXTRACT_URL = "https://scraper.iguzman.com.mx/extract";
// Small, fast model for the query-builder step (mirrors the edge-folio extract route).
const QUERY_MODEL = process.env.GROQ_QUERY_MODEL ?? "llama-3.1-8b-instant";

const MAX_QUERIES = 3;
const RESULTS_PER_QUERY = 5;
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
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: QUERY_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
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

// ── Step 3: deep-dive the single most relevant link ────────────────────────────

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
      url: data.url ?? url,
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
  const queries = await buildQueries(
    groqApiKey,
    purchase || "a major purchase",
    simulationSummary,
    asOf,
  );

  const empty: EnrichResponse = { asOf, queries, results: [], extract: null };
  if (queries.length === 0) return NextResponse.json(empty);

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

  // 3. Deep-dive the single most relevant link (top hit of the first query that
  //    returned anything) for richer grounding than the snippets alone.
  const extract =
    results.length > 0 ? await extractUrl(results[0]!.url, scraperKey) : null;

  return NextResponse.json({ asOf, queries, results, extract });
}
