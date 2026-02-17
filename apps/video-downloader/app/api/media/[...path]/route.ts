import { NextRequest, NextResponse } from 'next/server';
import { stat, createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';
import { Readable } from 'node:stream';

const fsStat = promisify(stat);

/** Directory where downloaded media is stored at runtime. */
const MEDIA_DIR = '/app/apps/video-downloader/public/media';

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
