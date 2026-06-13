import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  const res = await apiFetch(`/api/applications/${id}/nafta-letter/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    cache: 'no-store',
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const responseBody = isJson ? await res.json() : { detail: 'Service unavailable' };
  return NextResponse.json(responseBody, { status: res.status });
}
