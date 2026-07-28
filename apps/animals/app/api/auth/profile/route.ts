import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';
import { reissueTokens } from '@repo/auth/api-fetch';

export async function GET() {
  const res = await apiFetch('/api/auth/profile/');
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch('/api/auth/profile/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();

  // The name is a token claim, and claims ride on the refresh token - so without
  // a reissue a rename would not reach the navbar until the refresh token expired.
  if (res.ok) await reissueTokens();

  return NextResponse.json(data, { status: res.status });
}
