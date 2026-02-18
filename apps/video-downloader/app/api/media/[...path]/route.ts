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

    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(info.size),
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
 * Replaces an existing media file on disk with the uploaded body.
 * Used after client-side FFmpeg processing (e.g. FPS interpolation)
 * so the server copy stays in sync. The filename is kept identical
 * so all existing URLs remain valid.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { writeFile } = await import('node:fs/promises');
  const segments = (await params).path;

  if (!segments || segments.length !== 1 || !segments[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fileName: string = segments[0];

  if (fileName.includes('..') || fileName.includes('/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = join(MEDIA_DIR, fileName);

  /* Only allow replacing a file that already exists */
  try {
    const info = await fsStat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Original file not found — nothing to replace' },
      { status: 404 },
    );
  }

  /* Read the incoming body as bytes and overwrite the file */
  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({ ok: true, file: fileName }, { status: 200 });
  } catch (err) {
    console.error('PUT /api/media – write failed:', err);
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 },
    );
  }
}
