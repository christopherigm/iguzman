import { NextRequest, NextResponse } from 'next/server';
import { getTask, updateTask } from '@/lib/video-task-db';
import type { TaskStatus } from '@/lib/types';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/server-processing/[taskId]' });

const ALLOWED_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'pending',
  'downloading',
  'processing',
  'converting',
  'burning',
  'translating',
  'done',
  'error',
]);

interface UpdateBody {
  status?: TaskStatus;
  progress?: number;
  outputFile?: string;
  error?: string;
  file?: string;
  name?: string;
  isH265?: boolean;
  sourceFps?: number;
  width?: number;
  height?: number;
  captionsFile?: string;
  uploader?: string;
  duration?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;

  if (!taskId || !/^[0-9a-f]{24}$/i.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (body.status) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (typeof body.progress === 'number') {
    const progress = Math.round(body.progress);
    if (progress < 0 || progress > 100) {
      return NextResponse.json(
        { error: 'progress must be 0-100' },
        { status: 400 },
      );
    }
    patch.progress = progress;
  }

  const outputFile =
    typeof body.outputFile === 'string' ? body.outputFile : undefined;
  const file = typeof body.file === 'string' ? body.file : undefined;
  if (outputFile || file) {
    patch.file = outputFile ?? file;
  }

  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.isH265 === 'boolean') patch.isH265 = body.isH265;
  if (typeof body.sourceFps === 'number') patch.sourceFps = body.sourceFps;
  if (typeof body.width === 'number') patch.width = body.width;
  if (typeof body.height === 'number') patch.height = body.height;
  if (typeof body.captionsFile === 'string')
    patch.captionsFile = body.captionsFile;
  if (typeof body.uploader === 'string') patch.uploader = body.uploader;
  if (typeof body.duration === 'number') patch.duration = body.duration;

  if (body.error) {
    patch.error = {
      code: 'DOWNLOAD_FAILED',
      message: body.error,
    };
    patch.status = 'error';
    patch.progress = 0;
  } else if (patch.status === 'done') {
    patch.error = null;
    patch.progress = 100;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await updateTask(taskId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error(
      { err, taskId, patch },
      'Failed to update task from broker callback',
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
