import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

function safeJson(res: Response, fallback: Record<string, unknown> = { detail: 'Service unavailable' }) {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  return isJson ? res.json() : Promise.resolve(fallback);
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/jobs/${id}/save/`, { method: 'POST' });
  return NextResponse.json(await safeJson(res), { status: res.status });
}
