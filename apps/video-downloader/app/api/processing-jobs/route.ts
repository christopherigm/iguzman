import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createProcessingJob, type ProcessingOp } from '@/lib/processing-job-db';
import { getClient } from '@/lib/ws-client-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/processing-jobs' });

const WS_BROKER_URL = process.env.WS_BROKER_URL ?? '';
const VALID_OPS: ProcessingOp[] = [
  'interpolateFps',
  'removeBlackBars',
  'convertToH264',
  'burnSubtitles',
];

export async function POST(request: NextRequest) {
  let body: {
    clientUuid?: string;
    op?: string;
    taskId?: string;
    params?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { clientUuid, op, taskId, params } = body;

  if (!clientUuid || !op || !taskId || !params) {
    return NextResponse.json({ error: 'Missing clientUuid, op, taskId, or params' }, { status: 400 });
  }

  if (!VALID_OPS.includes(op as ProcessingOp)) {
    return NextResponse.json({ error: `Invalid op. Valid: ${VALID_OPS.join(', ')}` }, { status: 400 });
  }

  const client = await getClient(clientUuid);
  if (!client) {
    return NextResponse.json({ error: 'Client not registered' }, { status: 404 });
  }

  if (!WS_BROKER_URL) {
    return NextResponse.json({ error: 'WS_BROKER_URL not configured' }, { status: 503 });
  }

  const jobId = randomUUID();

  await createProcessingJob({
    jobId,
    clientUuid,
    taskId,
    op: op as ProcessingOp,
    params,
    status: 'pending',
    progress: 0,
    outputFile: null,
    error: null,
  });

  // Dispatch to ws-broker
  try {
    const res = await fetch(`${WS_BROKER_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientUuid, op, params: { ...params, taskId } }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn({ jobId, status: res.status, text }, 'Broker rejected job dispatch');
      return NextResponse.json(
        { error: `Broker error: ${res.status}`, detail: text },
        { status: res.status === 409 ? 409 : 502 },
      );
    }
  } catch (err) {
    log.error({ err, jobId }, 'Failed to reach ws-broker');
    return NextResponse.json({ error: 'ws-broker unreachable' }, { status: 503 });
  }

  log.info({ jobId, clientUuid, op }, 'Processing job created and dispatched');
  return NextResponse.json({ jobId }, { status: 201 });
}
