import { NextResponse } from 'next/server';
import { getSystemStats } from '@repo/helpers/system-monitor';

export async function GET() {
  const stats = await getSystemStats();
  return NextResponse.json({ status: 'ok', ...stats });
}
