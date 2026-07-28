import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export const dynamic = 'force-dynamic';

/**
 * Streams an LLM completion from animals-api back to the CMS.
 *
 * Every provider decision (Groq first, OpenRouter as fallback) and both API keys
 * live in Django - see `core/services/llm.py`. This handler only attaches the
 * caller's bearer token via `apiFetch` and pipes the SSE body **straight
 * through**: buffering it here (e.g. via `res.json()`) would turn the live
 * enhance/translate preview into one lump arriving at the end.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const res = await apiFetch('/api/ai/chat/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await req.text(),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { detail: detail || 'The AI service is unavailable.' },
      { status: res.ok ? 502 : res.status },
    );
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
