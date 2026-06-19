import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'node:fs';
import { appendFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import logger from '@/lib/logger';
import { sweepTmpFiles } from '@/lib/tmp-cleanup';

const log = logger.child({ module: 'api/media/stage' });

const TEMP_DIR = '/tmp';

// UUID v4 key with extension – same pattern accepted by tmp-cleanup.
const VALID_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

/**
 * POST /api/media/stage?action=initiate&ext=mp4
 *   → { key }
 *
 * POST /api/media/stage?action=append&key=xxx
 *   body: raw chunk bytes
 *   → { ok: true }
 *
 * Stages a large file to /tmp on this pod by sequentially appending chunks.
 * Chunks must be sent in order (the client loop is sequential / await-in-loop).
 * Sticky ingress sessions guarantee the follow-up server-processing request
 * lands on this same pod, so the staged file is found locally.
 *
 * The output of the FFmpeg job is still uploaded to R2 after processing.
 */
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  // ── initiate ──────────────────────────────────────────────────────────────
  if (action === 'initiate') {
    const ext = request.nextUrl.searchParams.get('ext') ?? 'mp4';
    if (!/^[a-z0-9]{1,10}$/i.test(ext)) {
      return NextResponse.json({ error: 'Invalid extension' }, { status: 400 });
    }
    const key = `${randomUUID()}.${ext.toLowerCase()}`;
    const filePath = join(TEMP_DIR, key);
    try {
      // Create an empty file to reserve the key before any chunks arrive.
      await appendFile(filePath, Buffer.alloc(0));
      sweepTmpFiles();
      log.info({ key }, 'POST /api/media/stage - initiated');
      return NextResponse.json({ key });
    } catch (err) {
      log.error({ err, key }, 'POST /api/media/stage - initiate failed');
      return NextResponse.json(
        { error: 'Failed to initiate staging' },
        { status: 500 },
      );
    }
  }

  // ── append ────────────────────────────────────────────────────────────────
  if (action === 'append') {
    const key = request.nextUrl.searchParams.get('key');
    if (!key || !VALID_KEY_RE.test(key)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    }
    const filePath = join(TEMP_DIR, key);
    // Ensure the key was legitimately initiated on this pod.
    try {
      await access(filePath);
    } catch {
      log.warn({ key }, 'POST /api/media/stage - unknown key');
      return NextResponse.json({ error: 'Unknown key' }, { status: 404 });
    }
    try {
      const writeStream = createWriteStream(filePath, { flags: 'a' });
      await pipeline(
        Readable.fromWeb(
          request.body as Parameters<typeof Readable.fromWeb>[0],
        ),
        writeStream,
      );
      log.info({ key }, 'POST /api/media/stage - chunk appended');
      return NextResponse.json({ ok: true });
    } catch (err) {
      log.error({ err, key }, 'POST /api/media/stage - append failed');
      return NextResponse.json(
        { error: 'Failed to append chunk' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
