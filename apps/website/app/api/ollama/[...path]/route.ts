import { NextRequest, NextResponse } from 'next/server';
import { ollamaServerURL } from '@repo/helpers/constants';

export const dynamic = 'force-dynamic';

const OLLAMA_URL = ollamaServerURL;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/token/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handler(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { detail: 'Authentication required.' },
      { status: 401 },
    );
  }

  const valid = await verifyToken(token);
  if (!valid) {
    return NextResponse.json(
      { detail: 'Invalid or expired token.' },
      { status: 401 },
    );
  }

  const { path } = await context.params;
  const pathStr = path.join('/');
  const targetUrl = `${OLLAMA_URL}/${pathStr}${req.nextUrl.search}`;

  const forwardHeaders = new Headers();
  const STRIPPED = new Set(['authorization', 'host', 'origin', 'referer']);
  req.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  // ── webSearch interception for /api/chat ──────────────────────────────────
  // Parse the body, strip the `webSearch` flag (unknown to Ollama), and optionally
  // inject Tavily results as a system message before forwarding.
  let forwardBody: BodyInit | undefined;

  if (req.method === 'POST' && pathStr === 'api/chat') {
    const parsed = (await req.json()) as Record<string, unknown>;
    const doWebSearch = Boolean(parsed.webSearch);
    delete parsed.webSearch;

    if (doWebSearch) {
      const apiKey = process.env.TAVILY_API_KEY ?? '';
      const messages =
        (parsed.messages as Array<{ role: string; content: string }>) ?? [];
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUser && apiKey) {
        const results = await fetchTavilyResults(lastUser.content, apiKey);
        console.log(
          '[ollama-proxy] Tavily results length:',
          results,
          results.length,
        );
        if (results) {
          const systemContent = buildSearchSystemMessage(results);
          const hasSystem = messages.some((m) => m.role === 'system');
          parsed.messages = hasSystem
            ? messages.map((m) =>
                m.role === 'system'
                  ? { ...m, content: `${systemContent}\n\n${m.content}` }
                  : m,
              )
            : [{ role: 'system', content: systemContent }, ...messages];
        }
      }
    }

    forwardBody = JSON.stringify(parsed);
    // The re-serialized body has a different byte length than the original request
    // (webSearch field removed, Tavily results possibly injected). Drop the stale
    // Content-Length so Ollama reads until EOF instead of stopping too early.
    forwardHeaders.delete('content-length');
  } else {
    forwardBody = hasBody ? (req.body ?? undefined) : undefined;
  }

  let ollamaRes: globalThis.Response;
  try {
    ollamaRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: forwardBody,
      ...(hasBody && forwardBody === req.body ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to reach Ollama server';
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  const responseHeaders = new Headers();
  ollamaRes.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'transfer-encoding') {
      responseHeaders.set(key, value);
    }
  });

  return new Response(ollamaRes.body, {
    status: ollamaRes.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
