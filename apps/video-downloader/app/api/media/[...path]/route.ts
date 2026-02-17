import { NextRequest, NextResponse } from 'next/server';
import { stat, createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';
import { Readable } from 'node:stream';

const fsStat = promisify(stat);

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Directory where downloaded media is stored at runtime. */
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

/** Minimal MIME-type map for the formats we serve. */
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

/**
 * GET /api/media/:path+
 *
 * Serves files that yt-dlp writes to the media directory at runtime.
 * The Next.js standalone server only serves static assets known at build
 * time, so runtime-generated files need an explicit route handler.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  // Only allow a single filename – no traversal
  if (!segments || segments.length !== 1 || !segments[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fileName: string = segments[0];

  // Block path-traversal attempts
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
