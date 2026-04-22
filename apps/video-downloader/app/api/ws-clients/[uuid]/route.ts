import { NextRequest, NextResponse } from 'next/server';
import { deregisterClient } from '@/lib/ws-client-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/ws-clients/[uuid]' });

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: 'Invalid uuid' }, { status: 400 });
  }

  try {
    const deleted = await deregisterClient(uuid.toLowerCase());
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    log.info({ uuid }, 'WS client deregistered');
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error({ err, uuid }, 'Failed to deregister WS client');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
