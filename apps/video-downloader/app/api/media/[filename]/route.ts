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
 * GET /api/media/:filename
 *
 * In production: redirects to the dedicated nginx-media host if
 * NEXT_PUBLIC_MEDIA_HOST is set, so video/thumbnail requests are served
 * by nginx directly without an extra Next.js hop.
 *
 * Fallback (no NEXT_PUBLIC_MEDIA_HOST): streams the file from disk so the
 * app still works without the standalone nginx-media service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const filename = (await params).filename;

  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Block sensitive files
  if (filename === 'netscape-cookies.txt') {
    return new NextResponse(null, { status: 403 });
  }

  const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;
  if (mediaHost) {
    // Permanent-ish redirect — browsers & CDNs cache 307 for the session.
    return NextResponse.redirect(`https://${mediaHost}/api/media/${filename}`, {
      status: 307,
    });
  }

  // ── Fallback: serve from disk ──────────────────────────────────────────
  const filePath = join(MEDIA_DIR, filename);
  try {
    const info = await fsStat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const MIME: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      m4a: 'audio/x-m4a',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      mkv: 'video/x-matroska',
      srt: 'text/plain',
      webp: 'image/webp',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    };
    const contentType = MIME[ext] ?? 'application/octet-stream';
    const fileSize = info.size;

    const { createReadStream } = await import('node:fs');
    const { Readable } = await import('node:stream');

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr ?? '0', 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }

    const stream = createReadStream(filePath);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

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
