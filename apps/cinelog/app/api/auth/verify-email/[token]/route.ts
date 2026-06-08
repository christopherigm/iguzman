import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${process.env.API_URL}/api/auth/verify-email/${token}/`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
