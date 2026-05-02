import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCRAPER_URL = process.env.SCRAPER_URL ?? 'https://scraper.iguzman.com.mx';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY ?? '';
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

export async function POST(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
  }

  const valid = await verifyToken(token);
  if (!valid) {
    return NextResponse.json({ detail: 'Invalid or expired token.' }, { status: 401 });
  }

  if (!SCRAPER_API_KEY) {
    return NextResponse.json({ detail: 'Scraper API key not configured.' }, { status: 500 });
  }

  const body = await req.json();
  const endpoint = (body.endpoint as string) ?? 'search';
  delete body.endpoint;

  let scraperRes: globalThis.Response;
  try {
    scraperRes = await fetch(`${SCRAPER_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SCRAPER_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach scraper service';
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  const data = await scraperRes.json();
  return NextResponse.json(data, { status: scraperRes.status });
}
