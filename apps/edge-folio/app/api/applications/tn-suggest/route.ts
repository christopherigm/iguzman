import { apiFetch } from '@/lib/api-fetch';
import { NextResponse } from 'next/server';

export async function POST() {
  const res = await apiFetch('/api/applications/tn-suggest/', {
    method: 'POST',
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
