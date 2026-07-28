import { NextRequest, NextResponse } from 'next/server';
import { apiUrl } from '@repo/auth/tokens';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${apiUrl()}/api/auth/verify-email/${token}/`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
