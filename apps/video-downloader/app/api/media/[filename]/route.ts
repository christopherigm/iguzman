import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'node:fs';
import { promisify } from 'node:util';
import { join } from 'node:path';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/media/[filename]' });

const fsStat = promisify(stat);

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Directory where downloaded media is stored at runtime. */
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

/**
 * PUT /api/media/:filename
 *
 * Saves the uploaded body as a *new* file (new unique name, same
 * extension), deletes the old file, updates the MongoDB record so
 * `file` points to the new name, and returns the new filename.
 *
 * The fresh filename guarantees browser caches are automatically
 * invalidated — no query-string cache-busting needed.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { unlink } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const { extname } = await import('node:path');
  const oldFileName = (await params).filename;

  if (!oldFileName) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (oldFileName.includes('..') || oldFileName.includes('/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const oldFilePath = join(MEDIA_DIR, oldFileName);

  /* Only allow replacing a file that already exists */
  try {
    const info = await fsStat(oldFilePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Original file not found — nothing to replace' },
      { status: 404 },
    );
  }

  /* Write to a new file and remove the old one */
  try {
    const ext = extname(oldFileName); // e.g. ".mp4"
    const newFileName = `${randomUUID()}${ext}`; // e.g. "a1b2c3d4-…-ef56.mp4"
    const newFilePath = join(MEDIA_DIR, newFileName);

    if (!request.body) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }

    /* Stream the request body directly to disk — avoids buffering the entire
       file in Node.js heap, which would OOM on large videos. */
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    const { Readable } = await import('node:stream');

    const writeStream = createWriteStream(newFilePath);
    try {
      await pipeline(
        Readable.fromWeb(
          request.body as Parameters<typeof Readable.fromWeb>[0],
        ),
        writeStream,
      );
    } catch (pipeErr) {
      /* Clean up the partial file on stream failure. */
      unlink(newFilePath).catch(() => {});
      throw pipeErr;
    }

    /* Best-effort: delete old file */
    unlink(oldFilePath).catch(() => {});

    /* Best-effort MongoDB sync — the file write already succeeded */
    const taskUpdateHeader = request.headers.get('X-Task-Update');
    if (taskUpdateHeader) {
      try {
        const { updateTaskByFile } = await import('@/lib/video-task-db');
        const patch = JSON.parse(taskUpdateHeader);
        await updateTaskByFile(oldFileName, { ...patch, file: newFileName });
      } catch {
        /* MongoDB update is best-effort */
      }
    }

    return NextResponse.json(
      { ok: true, file: newFileName, oldFile: oldFileName },
      { status: 200 },
    );
  } catch (err) {
    log.error({ err, oldFileName }, 'PUT /api/media – write failed');
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 },
    );
  }
}
