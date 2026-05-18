import { NextRequest, NextResponse } from 'next/server';
import { redeemCoupon } from '@/lib/credits-db';
import { getCreditsKey } from '@/lib/credits-middleware';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/credits/redeem' });

export async function POST(request: NextRequest) {
  const key = getCreditsKey(request);
  if (!key) {
    return NextResponse.json({ error: 'NO_CREDITS_KEY' }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code) {
    return NextResponse.json({ error: 'Missing coupon code' }, { status: 400 });
  }

  const added = await redeemCoupon(code, key);
  if (added === null) {
    log.info({ code }, 'Coupon redemption failed');
    return NextResponse.json({ error: 'INVALID_COUPON' }, { status: 400 });
  }

  log.info({ code, added }, 'Coupon redeemed successfully');
  return NextResponse.json({ creditsAdded: added });
}
