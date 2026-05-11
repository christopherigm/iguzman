import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream, stat } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
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
  const oldFileName = (await params).filename;

  if (!oldFileName) {
    log.warn('PUT /api/media/[filename] – missing filename param');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (oldFileName.includes('..') || oldFileName.includes('/')) {
    log.warn({ oldFileName }, 'PUT /api/media/[filename] – path traversal attempt');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const oldFilePath = join(MEDIA_DIR, oldFileName);

  /* Only allow replacing a file that already exists */
  try {
    const info = await fsStat(oldFilePath);
    if (!info.isFile()) {
      log.warn({ oldFileName }, 'PUT /api/media/[filename] – path exists but is not a file');
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch {
    log.warn({ oldFileName }, 'PUT /api/media/[filename] – original file not found');
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
      log.warn({ oldFileName }, 'PUT /api/media/[filename] – empty request body');
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }

    /* Stream the request body directly to disk — avoids buffering the entire
       file in Node.js heap, which would OOM on large videos. */
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
      } catch (dbErr) {
        log.warn({ err: dbErr, oldFileName, newFileName }, 'PUT /api/media/[filename] – MongoDB sync failed (best-effort)');
      }
    }

    log.info({ oldFileName, newFileName }, 'PUT /api/media/[filename] – file replaced');
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

/**
 * DELETE /api/media/:filename
 *
 * Removes a single media file from disk. Used to clean up server-side
 * copies after they have been saved back to OPFS on the client.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename || filename.includes('..') || filename.includes('/')) {
    log.warn({ filename }, 'DELETE /api/media/[filename] – invalid or traversal filename');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = join(MEDIA_DIR, filename);
  try {
    await unlink(filePath);
  } catch {
    // File may already be gone — not an error
  }

  log.info({ filename }, 'DELETE /api/media/[filename] – file removed');
  return NextResponse.json({ ok: true });
}
