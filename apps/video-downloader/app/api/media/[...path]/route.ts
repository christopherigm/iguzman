import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'node:fs';
import { promisify } from 'node:util';
import { join } from 'node:path';

const fsStat = promisify(stat);

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Directory where downloaded media is stored at runtime. */
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

/**
 * GET /api/media/:path+
 *
 * In production, static media files are served by the nginx sidecar
 * container (the ingress routes /api/media/* there directly).
 *
 * In development, we still need this handler because there is no nginx.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  /* ── Production: nginx handles this ── */
  if (IS_PRODUCTION) {
    return NextResponse.json(
      { error: 'Media files are served by nginx in production' },
      { status: 404 },
    );
  }

  /* ── Development: serve files from the local filesystem ── */
  const { createReadStream } = await import('node:fs');
  const { extname } = await import('node:path');
  const { Readable } = await import('node:stream');

  const MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4a': 'audio/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mkv': 'video/x-matroska',
    '.srt': 'text/plain; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  };

  const segments = (await params).path;

  if (!segments || segments.length !== 1 || !segments[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fileName: string = segments[0];

  if (fileName.includes('..') || fileName.includes('/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = join(MEDIA_DIR, fileName);

  try {
    const info = await fsStat(filePath);

    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = extname(fileName).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    /* ── Range request (seek support for video/audio elements) ── */
    const rangeHeader = _request.headers.get('range');
    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = parseInt(match[1]!, 10);
        const end = match[2] ? parseInt(match[2], 10) : info.size - 1;
        const safeStart = Math.min(start, info.size - 1);
        const safeEnd = Math.min(end, info.size - 1);
        const chunkSize = safeEnd - safeStart + 1;

        const rangeStream = createReadStream(filePath, {
          start: safeStart,
          end: safeEnd,
        });
        const rangeWebStream = Readable.toWeb(rangeStream) as ReadableStream;

        return new NextResponse(rangeWebStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${safeStart}-${safeEnd}/${info.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(info.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
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
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { unlink } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const { extname } = await import('node:path');
  const segments = (await params).path;

  if (!segments || segments.length !== 1 || !segments[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const oldFileName: string = segments[0];

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
    console.error('PUT /api/media – write failed:', err);
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 },
    );
  }
}
