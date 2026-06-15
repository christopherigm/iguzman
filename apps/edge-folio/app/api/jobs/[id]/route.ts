import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/jobs/${id}/delete/`, { method: 'DELETE' });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await res.json(), { status: res.status });
}
