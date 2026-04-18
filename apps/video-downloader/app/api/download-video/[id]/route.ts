import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getTask, deleteTask } from '@/lib/video-task-db';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/download-video/[id]' });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const task = await getTask(id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
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
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  try {
    const task = await getTask(id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.file) {
      const filePath = join(MEDIA_DIR, task.file);
      try {
        await unlink(filePath);
      } catch {
        /* File may already be gone — acceptable */
      }
    }

    if (task.thumbnail) {
      const thumbPath = join(MEDIA_DIR, task.thumbnail);
      try {
        await unlink(thumbPath);
      } catch {
        /* Thumbnail may already be gone — acceptable */
      }
    }

    if (task.captionsFile) {
      const captionsPath = join(MEDIA_DIR, task.captionsFile);
      try {
        await unlink(captionsPath);
      } catch {
        /* Captions file may already be gone — acceptable */
      }
    }

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
