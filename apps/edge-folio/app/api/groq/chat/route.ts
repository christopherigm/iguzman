import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshAccessToken } from '@/lib/api-fetch';

export const dynamic = 'force-dynamic';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const OLLAMA_BASE = (process.env.OLLAMA_URL ?? 'http://192.168.0.24:11434').replace(/\/$/, '');
const OLLAMA_API_URL = `${OLLAMA_BASE}/v1/chat/completions`;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:latest';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.API_URL}/api/auth/token/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface GroqProxyBody {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  temperature?: number;
  seed?: number;
  [key: string]: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
  }

  let valid = await verifyToken(token);
  if (!valid) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return NextResponse.json({ detail: 'Invalid or expired token.' }, { status: 401 });
    }
    valid = true;
  }

  const parsed = (await req.json()) as GroqProxyBody;

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json({ detail: 'Groq API key not configured.' }, { status: 500 });
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
    const message = err instanceof Error ? err.message : 'Failed to reach Groq API';
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  let upstream = groqRes;

  if (groqRes.status === 429) {
    console.warn('[groq/chat] Groq rate limit hit; falling back to Ollama');
    const ollamaBody = { ...parsed, model: OLLAMA_MODEL };
    try {
      upstream = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaBody),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reach Ollama fallback';
      return NextResponse.json({ detail: message }, { status: 502 });
    }
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const responseHeaders = new Headers();
  const STRIP_HEADERS = new Set(['transfer-encoding', 'content-encoding', 'content-length']);
  upstream.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
