import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

interface RequestBody {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
}

export async function POST(req: NextRequest): Promise<Response> {
  const tavilyKey = process.env.TAVILY_API_KEY ?? '';
  if (!tavilyKey) {
    return NextResponse.json(
      { detail: 'Tavily API key not configured.' },
      { status: 500 },
    );
  }

  const { query, maxResults = 5, searchDepth = 'basic' } =
    (await req.json()) as RequestBody;

  if (!query?.trim()) {
    return NextResponse.json({ detail: 'query is required.' }, { status: 400 });
  }

  let tavilyRes: globalThis.Response;
  try {
    tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Tavily API';
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  if (!tavilyRes.ok) {
    const body = await tavilyRes.text();
    return new Response(body, {
      status: tavilyRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = (await tavilyRes.json()) as TavilyResponse;

  return NextResponse.json({ results: data.results ?? [] });
}
