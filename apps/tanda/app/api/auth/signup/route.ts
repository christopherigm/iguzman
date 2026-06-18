import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/signup/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
