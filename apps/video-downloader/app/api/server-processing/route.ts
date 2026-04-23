import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/ws-client-db';
import { getTask, updateTask } from '@/lib/video-task-db';
import type { TaskStatus } from '@/lib/types';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/server-processing' });

const WS_BROKER_URL = process.env.WS_BROKER_URL ?? '';
const VALID_OPS = [
  'interpolateFps',
  'removeBlackBars',
  'convertToH264',
  'burnSubtitles',
] as const;

type ProcessingOp = (typeof VALID_OPS)[number];

const STATUS_BY_OP: Record<ProcessingOp, TaskStatus> = {
  interpolateFps: 'processing',
  removeBlackBars: 'processing',
  convertToH264: 'converting',
  burnSubtitles: 'burning',
};

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
    return NextResponse.json(
      { error: 'Missing clientUuid, op, taskId, or params' },
      { status: 400 },
    );
  }

  if (!/^[0-9a-f]{24}$/i.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }

  if (!VALID_OPS.includes(op as ProcessingOp)) {
    return NextResponse.json(
      { error: `Invalid op. Valid: ${VALID_OPS.join(', ')}` },
      { status: 400 },
    );
  }

  const client = await getClient(clientUuid);
  if (!client) {
    return NextResponse.json(
      { error: 'Client not registered' },
      { status: 404 },
    );
  }

  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  let inputFile =
    typeof params.inputFile === 'string' ? params.inputFile : undefined;
  if (!inputFile) {
    if (!task.file) {
      return NextResponse.json(
        { error: 'Task has no output file yet' },
        { status: 422 },
      );
    }
    inputFile = task.file;
  }

  if (!WS_BROKER_URL) {
    return NextResponse.json(
      { error: 'WS_BROKER_URL not configured' },
      { status: 503 },
    );
  }

  const brokerParams = { ...params, taskId, inputFile };
  const activeStatus = STATUS_BY_OP[op as ProcessingOp];

  await updateTask(taskId, {
    status: activeStatus,
    progress: 0,
    error: null,
  });

  try {
    const res = await fetch(`${WS_BROKER_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: taskId,
        taskId,
        clientUuid,
        op,
        params: brokerParams,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn(
        { taskId, status: res.status, text },
        'Broker rejected processing task dispatch',
      );
      return NextResponse.json(
        { error: `Broker error: ${res.status}`, detail: text },
        { status: res.status === 409 ? 409 : 502 },
      );
    }
  } catch (err) {
    log.error({ err, taskId }, 'Failed to reach ws-broker');
    return NextResponse.json(
      { error: 'ws-broker unreachable' },
      { status: 503 },
    );
  }

  log.info({ taskId, clientUuid, op }, 'Server processing task dispatched');
  return NextResponse.json({ taskId }, { status: 201 });
}
