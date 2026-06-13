import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string; category: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { id, category } = await params;
  const res = await apiFetch(`/api/applications/${id}/company-intel/${category}/`, {
    method: 'POST',
    cache: 'no-store',
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : { detail: 'Service unavailable' };
  return NextResponse.json(body, { status: res.status });
}
