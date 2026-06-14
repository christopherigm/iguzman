import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import logger from '@/lib/logger';
import { USE_R2, uploadFromWebStream } from '@/lib/r2';
import { sweepTmpFiles } from '@/lib/tmp-cleanup';

const log = logger.child({ module: 'api/media' });

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';
const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';
const TEMP_DIR = '/tmp';

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
    log.warn({ ext }, 'POST /api/media - invalid file extension');
    return NextResponse.json({ error: 'Invalid extension' }, { status: 400 });
  }

  if (!request.body) {
    log.warn({ ext }, 'POST /api/media - empty request body');
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const fileName = `${randomUUID()}.${ext.toLowerCase()}`;

  // ?tmp=1: stage the upload to /tmp instead of R2 so the same server can
  // process it immediately without a wasted R2 round-trip. Ingress sticky
  // sessions (see helm/values.yaml) guarantee the follow-up processing
  // request lands on this same pod, so the staged file is found locally.
  // The output of processing is still uploaded to R2 after the job completes.
  const stageTmp = USE_R2 && request.nextUrl.searchParams.get('tmp') === '1';

  // Opportunistically remove orphaned staged files left in /tmp by uploads
  // that were never processed (throttled to run at most once per 30 min).
  if (stageTmp) sweepTmpFiles();

  if (USE_R2 && !stageTmp) {
    try {
      const cl = request.headers.get('content-length');
      const contentLength = cl ? parseInt(cl, 10) : undefined;
      await uploadFromWebStream(fileName, request.body, contentLength);
      log.info({ fileName }, 'POST /api/media - file saved to R2');
      return NextResponse.json({ file: fileName }, { status: 201 });
    } catch (err) {
      log.error({ err, fileName }, 'POST /api/media - R2 upload failed');
      return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
    }
  }

  const filePath = join(stageTmp ? TEMP_DIR : MEDIA_DIR, fileName);

  try {
    const writeStream = createWriteStream(filePath);
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      writeStream,
    );
    log.info({ fileName, stageTmp }, 'POST /api/media - file saved');
    return NextResponse.json({ file: fileName }, { status: 201 });
  } catch (err) {
    log.error({ err, fileName }, 'POST /api/media - write failed');
    unlink(filePath).catch(() => {});
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
