import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function POST() {
  const res = await apiFetch('/api/auth/passkey/register/options/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ detail: 'Upstream error' }, { status: 502 });
  }
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
