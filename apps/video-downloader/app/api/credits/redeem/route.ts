import { NextRequest, NextResponse } from 'next/server';
import { redeemCoupon, createCreditKey, getCreditKey } from '@/lib/credits-db';
import { getCreditsKey } from '@/lib/credits-middleware';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/credits/redeem' });

export async function POST(request: NextRequest) {
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

  let key = getCreditsKey(request);
  let newKey: string | undefined;

  if (!key) {
    key = await createCreditKey(0);
    newKey = key;
  }

  const added = await redeemCoupon(code, key);
  if (added === null) {
    log.info({ code }, 'Coupon redemption failed');
    return NextResponse.json({ error: 'INVALID_COUPON' }, { status: 400 });
  }

  const keyDoc = await getCreditKey(key);
  const creditsRemaining = keyDoc?.credits ?? added;

  log.info({ code, added, creditsRemaining }, 'Coupon redeemed successfully');
  return NextResponse.json({
    creditsAdded: added,
    creditsRemaining,
    ...(newKey ? { newKey } : {}),
  });
}
