import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Tavily web-search helpers ─────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

async function fetchTavilyResults(
  query: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 5,
    }),
  });
  if (!res.ok) return '';
  const data: TavilyResponse = await res.json();
  if (!data.results?.length) return '';
  return data.results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join('\n\n');
}

function buildSearchSystemMessage(results: string): string {
  return `You have access to the following up-to-date web search results. Use them to answer the user's question accurately.\n\n${results}\n\n---`;
}

// ── Request body shape sent by the hook ──────────────────────────────────────

interface GroqProxyBody {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  temperature?: number;
  seed?: number;
  webSearch?: boolean;
  [key: string]: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  // ── Parse body ────────────────────────────────────────────────────────────
  const parsed = (await req.json()) as GroqProxyBody;
  const doWebSearch = Boolean(parsed.webSearch);
  delete parsed.webSearch;

  // ── Optional Tavily injection ─────────────────────────────────────────────
  if (doWebSearch) {
    const tavilyKey = process.env.TAVILY_API_KEY ?? '';
    const lastUser = [...parsed.messages].reverse().find((m) => m.role === 'user');
    if (lastUser && tavilyKey) {
      const results = await fetchTavilyResults(lastUser.content, tavilyKey);
      if (results) {
        const systemContent = buildSearchSystemMessage(results);
        const hasSystem = parsed.messages.some((m) => m.role === 'system');
        parsed.messages = hasSystem
          ? parsed.messages.map((m) =>
              m.role === 'system'
                ? { ...m, content: `${systemContent}\n\n${m.content}` }
                : m,
            )
          : [{ role: 'system', content: systemContent }, ...parsed.messages];
      }
    }
  }

  // ── Forward to Groq ───────────────────────────────────────────────────────
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json(
      { detail: 'Groq API key not configured.' },
      { status: 500 },
    );
  }

  let groqRes: globalThis.Response;
  try {
    groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(parsed),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to reach Groq API';
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  if (!groqRes.ok) {
    const body = await groqRes.text();
    return new Response(body, {
      status: groqRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Stream response back ──────────────────────────────────────────────────
  const responseHeaders = new Headers();
  groqRes.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'transfer-encoding') {
      responseHeaders.set(key, value);
    }
  });

  return new Response(groqRes.body, {
    status: groqRes.status,
    headers: responseHeaders,
  });
}
