import { NextRequest, NextResponse } from 'next/server';
import {
  registerClient,
  listRegisteredClients,
} from '@/lib/ws-client-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/ws-clients' });

const WS_BROKER_URL = process.env.WS_BROKER_URL ?? '';
async function fetchBrokerStatus(): Promise<Map<string, boolean>> {
  const connected = new Map<string, boolean>();
  if (!WS_BROKER_URL) return connected;
  try {
    const res = await fetch(`${WS_BROKER_URL}/api/clients`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as Array<{ uuid: string; connected: boolean }>;
      for (const c of data) connected.set(c.uuid, c.connected);
    }
  } catch {
    // broker unreachable — all clients show as disconnected
  }
  return connected;
}

export async function GET() {
  try {
    const [clients, brokerStatus] = await Promise.all([
      listRegisteredClients(),
      fetchBrokerStatus(),
    ]);
    const result = clients.map((c) => ({
      ...c,
      connected: brokerStatus.get(c.uuid) ?? false,
    }));
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'GET /api/ws-clients failed');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: { uuid?: string; label?: string };
  try {
    body = (await request.json()) as { uuid?: string; label?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { uuid, label } = body;
  if (!uuid || typeof uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uuid)) {
    return NextResponse.json({ error: 'Invalid uuid' }, { status: 400 });
  }
  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  try {
    const client = await registerClient(uuid.toLowerCase(), label.trim());
    log.info({ uuid }, 'WS client registered');
    return NextResponse.json(client, { status: 201 });
  } catch (err) {
    log.error({ err, uuid }, 'Failed to register WS client');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
