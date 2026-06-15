import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

function safeJson(res: Response, fallback: Record<string, unknown> = { detail: 'Service unavailable' }) {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  return isJson ? res.json() : Promise.resolve(fallback);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const res = await apiFetch(`/api/jobs/credentials/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await safeJson(res), { status: res.status });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/jobs/credentials/${id}/`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await safeJson(res), { status: res.status });
}
