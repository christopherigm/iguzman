import { NextRequest, NextResponse } from 'next/server';
import { createCoupons, listCoupons } from '@/lib/credits-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/internal/coupons' });
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

function isAuthorized(request: NextRequest): boolean {
  if (!INTERNAL_SECRET) return false;
  return request.headers.get('x-internal-secret') === INTERNAL_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { quantity?: number; value?: number; maxRedemptions?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const quantity = Number(body.quantity ?? 1);
  const value = Number(body.value);
  const maxRedemptions = Number(body.maxRedemptions ?? 1);

  if (!value || value <= 0 || !Number.isInteger(value)) {
    return NextResponse.json({ error: 'value must be a positive integer' }, { status: 400 });
  }
  if (quantity <= 0 || quantity > 1000 || !Number.isInteger(quantity)) {
    return NextResponse.json({ error: 'quantity must be an integer between 1 and 1000' }, { status: 400 });
  }
  if (maxRedemptions <= 0 || !Number.isInteger(maxRedemptions)) {
    return NextResponse.json({ error: 'maxRedemptions must be a positive integer' }, { status: 400 });
  }

  const codes = await createCoupons(quantity, value, maxRedemptions);
  log.info({ quantity, value, maxRedemptions }, 'Coupons created');
  return NextResponse.json({ codes, quantity, value, maxRedemptions });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const redeemedParam = url.searchParams.get('redeemed');
  const amountParam = url.searchParams.get('amount');

  const filters: { redeemed?: boolean; credits?: number } = {};

  if (redeemedParam === 'true') filters.redeemed = true;
  else if (redeemedParam === 'false') filters.redeemed = false;

  if (amountParam) {
    const parsed = parseInt(amountParam, 10);
    if (!isNaN(parsed)) filters.credits = parsed;
  }

  const coupons = await listCoupons(filters);
  return NextResponse.json({ coupons, total: coupons.length });
}
