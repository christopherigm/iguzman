import { apiFetch } from '@/lib/api-fetch';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/matrix/extract/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
