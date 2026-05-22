import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getTask, deleteTask } from '@/lib/video-task-db';
import { USE_R2, deleteObject } from '@/lib/r2';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/download-video/[id]' });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

async function deleteMediaFile(filename: string | null | undefined): Promise<void> {
  if (!filename) return;
  if (USE_R2) {
    await deleteObject(filename);
  } else {
    try {
      await unlink(join(MEDIA_DIR, filename));
    } catch {
      // File may already be gone — acceptable
    }
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
    log.warn({ taskId: id }, 'Invalid task ID format in GET');
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const task = await getTask(id);

    if (!task) {
      log.warn({ taskId: id }, 'Task not found in GET');
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { result: _result, ...taskBase } = task;

    return NextResponse.json({ task: taskBase });
  } catch (err) {
    log.error({ err, taskId: id }, 'Failed to fetch task');
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
    log.warn({ taskId: id }, 'Invalid task ID format in DELETE');
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const task = await getTask(id);
    if (!task) {
      log.warn({ taskId: id }, 'Task not found in DELETE');
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await Promise.all([
      deleteMediaFile(task.file),
      deleteMediaFile(task.thumbnail),
      deleteMediaFile(task.captionsFile),
      deleteMediaFile(task.commentsFile),
    ]);

    await deleteTask(id);

    log.info({ taskId: id, file: task.file }, 'Task deleted');
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error({ err, taskId: id }, 'Failed to delete task');
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 },
    );
  }
}
