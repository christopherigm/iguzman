import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

export async function GET() {
  const res = await apiFetch('/api/career/work-experience/', { cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await apiFetch('/api/career/work-experience/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
