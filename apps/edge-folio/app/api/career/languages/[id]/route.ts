import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/career/languages/${id}/`, { cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const res = await apiFetch(`/api/career/languages/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/career/languages/${id}/`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await res.json(), { status: res.status });
}
