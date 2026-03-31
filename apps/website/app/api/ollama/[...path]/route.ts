import { NextRequest, NextResponse } from 'next/server';
import { ollamaServerURL } from '@repo/helpers/constants';

export const dynamic = 'force-dynamic';

const OLLAMA_URL = ollamaServerURL;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

async function handler(req: NextRequest, context: RouteContext): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
  }

  const valid = await verifyToken(token);
  if (!valid) {
    return NextResponse.json({ detail: 'Invalid or expired token.' }, { status: 401 });
  }

  const { path } = await context.params;
  const targetUrl = `${OLLAMA_URL}/${path.join('/')}${req.nextUrl.search}`;

  const forwardHeaders = new Headers();
  const STRIPPED = new Set(['authorization', 'host', 'origin', 'referer']);
  req.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  let ollamaRes: globalThis.Response;
  try {
    ollamaRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: hasBody ? req.body : undefined,
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Ollama server';
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
