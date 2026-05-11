import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import logger from '@/lib/logger';

const log = logger.child({ module: 'api/media' });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

/**
 * POST /api/media?ext=mp4
 *
 * Saves the uploaded body as a new file with a UUID filename.
 * Used to stage OPFS-stored videos on the server before dispatching
 * a server-side FFmpeg job.
 *
 * Returns { file: newFileName }.
 */
export async function POST(request: NextRequest) {
  const ext = request.nextUrl.searchParams.get('ext') ?? 'mp4';

  if (!/^[a-z0-9]{1,10}$/i.test(ext)) {
    return NextResponse.json({ error: 'Invalid extension' }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const fileName = `${randomUUID()}.${ext.toLowerCase()}`;
  const filePath = join(MEDIA_DIR, fileName);

  try {
    const writeStream = createWriteStream(filePath);
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      writeStream,
    );
    log.info({ fileName }, 'POST /api/media – file saved');
    return NextResponse.json({ file: fileName }, { status: 201 });
  } catch (err) {
    log.error({ err, fileName }, 'POST /api/media – write failed');
    unlink(filePath).catch(() => {});
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
