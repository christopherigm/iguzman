import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/applications/${id}/metrics/`, {
    method: 'POST',
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
