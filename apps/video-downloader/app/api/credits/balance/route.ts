import { NextRequest, NextResponse } from 'next/server';
import { getBalance, getCreditsKey } from '@/lib/credits-middleware';

export async function GET(request: NextRequest) {
  const key = getCreditsKey(request);
  if (!key) {
    return NextResponse.json({ error: 'NO_CREDITS_KEY' }, { status: 401 });
  }

  const balance = await getBalance(key);
  if (balance === null) {
    return NextResponse.json({ error: 'INVALID_CREDITS_KEY' }, { status: 404 });
  }

  return NextResponse.json({ credits: balance });
}
