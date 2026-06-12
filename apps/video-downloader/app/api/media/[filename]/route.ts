import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream, stat } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import logger from '@/lib/logger';
import {
  USE_R2,
  getPresignedGetUrl,
  uploadFromWebStream,
  deleteObject,
} from '@/lib/r2';

const log = logger.child({ module: 'api/media/[filename]' });

const fsStat = promisify(stat);

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

const MEDIA_DIR = IS_PRODUCTION ? '/app/media' : './public/media';

// When set, GET requests redirect directly to the custom R2 domain instead of
// proxying through this server, eliminating the double-bandwidth hop.
// Must have CORS configured on the R2 bucket for the app origin.
const R2_PUBLIC_URL = (() => {
  const raw = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
})();

// UUID v4 filename check — prevents creating files with arbitrary names
const VALID_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

/**
 * GET /api/media/:filename
 *
 * With R2_PUBLIC_URL set: redirects directly to the custom R2 domain (zero
 * bandwidth through this server — CORS must be configured on the bucket).
 *
 * R2 without custom domain: proxies through this server (avoids CORS issues
 * with the bare r2.cloudflarestorage.com endpoint).
 *
 * Local dev: redirects to the Next.js static path (/media/).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename || filename.includes('..') || filename.includes('/')) {
    log.warn({ filename }, 'GET /api/media/[filename] - invalid filename');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (USE_R2) {
    // Custom domain path: redirect directly — R2 → client, no server proxy.
    // Only in production; in dev the redirect would be cross-origin (127.0.0.1
    // → media2go.app) and CORS would block the fetch.
    if (R2_PUBLIC_URL && IS_PRODUCTION) {
      return NextResponse.redirect(`${R2_PUBLIC_URL}/${filename}`);
    }

    // Fallback: proxy through the server because the bare r2.cloudflarestorage.com
    // endpoint lacks CORS headers (fetch() in the OPFS migration path would fail).
    try {
      const url = await getPresignedGetUrl(filename);
      const r2Res = await fetch(url);
      if (!r2Res.ok) {
        log.warn(
          { filename, status: r2Res.status },
          'GET /api/media/[filename] - R2 returned non-OK status',
        );
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
      }
      const headers: Record<string, string> = {};
      const ct = r2Res.headers.get('content-type');
      const cl = r2Res.headers.get('content-length');
      if (ct) headers['Content-Type'] = ct;
      if (cl) headers['Content-Length'] = cl;
      return new NextResponse(r2Res.body, { status: 200, headers });
    } catch (err) {
      log.error(
        { err, filename },
        'GET /api/media/[filename] - R2 fetch failed',
      );
      return NextResponse.json(
        { error: 'Failed to fetch media' },
        { status: 500 },
      );
    }
  }

  // Dev: files live in public/media/, served by Next.js at /media/
  // Use the Host header to reconstruct the origin so the redirect stays
  // on the same host:port the browser connected to — avoids a
  // localhost vs 127.0.0.1 mismatch that COEP: require-corp would block.
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  return NextResponse.redirect(`${proto}://${host}/media/${filename}`);
}

/**
 * PUT /api/media/:filename
 *
 * Saves the uploaded body as a *new* file (new unique name, same extension),
 * deletes the old file, updates the MongoDB record so `file` points to the
 * new name, and returns the new filename.
 *
 * The fresh filename guarantees browser caches are automatically invalidated.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const oldFileName = (await params).filename;

  if (!oldFileName) {
    log.warn('PUT /api/media/[filename] - missing filename param');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (oldFileName.includes('..') || oldFileName.includes('/')) {
    log.warn(
      { oldFileName },
      'PUT /api/media/[filename] - path traversal attempt',
    );
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!request.body) {
    log.warn({ oldFileName }, 'PUT /api/media/[filename] - empty request body');
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const ext = extname(oldFileName);
  const newFileName = `${randomUUID()}${ext}`;

  if (USE_R2) {
    // Validate format so we don't accept arbitrary key names
    if (!VALID_FILENAME_RE.test(oldFileName)) {
      log.warn(
        { oldFileName },
        'PUT /api/media/[filename] - invalid filename format',
      );
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
      const cl = request.headers.get('content-length');
      const contentLength = cl ? parseInt(cl, 10) : undefined;
      await uploadFromWebStream(newFileName, request.body, contentLength);
    } catch (err) {
      log.error({ err, oldFileName }, 'PUT /api/media - R2 upload failed');
      return NextResponse.json(
        { error: 'Failed to write file' },
        { status: 500 },
      );
    }

    deleteObject(oldFileName).catch(() => {});

    const taskUpdateHeader = request.headers.get('X-Task-Update');
    if (taskUpdateHeader) {
      try {
        const { updateTaskByFile } = await import('@/lib/video-task-db');
        const patch = JSON.parse(taskUpdateHeader) as Record<string, unknown>;
        await updateTaskByFile(oldFileName, { ...patch, file: newFileName });
      } catch (dbErr) {
        log.warn(
          { err: dbErr, oldFileName, newFileName },
          'PUT /api/media/[filename] - MongoDB sync failed (best-effort)',
        );
      }
    }

    log.info(
      { oldFileName, newFileName },
      'PUT /api/media/[filename] - file replaced in R2',
    );
    return NextResponse.json(
      { ok: true, file: newFileName, oldFile: oldFileName },
      { status: 200 },
    );
  }

  /* ── Local disk (dev) ── */

  const oldFilePath = join(MEDIA_DIR, oldFileName);

  try {
    const info = await fsStat(oldFilePath);
    if (!info.isFile()) {
      log.warn(
        { oldFileName },
        'PUT /api/media/[filename] - path exists but is not a file',
      );
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch {
    log.warn(
      { oldFileName },
      'PUT /api/media/[filename] - original file not found',
    );
    return NextResponse.json(
      { error: 'Original file not found — nothing to replace' },
      { status: 404 },
    );
  }

  try {
    const newFilePath = join(MEDIA_DIR, newFileName);

    const writeStream = createWriteStream(newFilePath);
    try {
      await pipeline(
        Readable.fromWeb(
          request.body as Parameters<typeof Readable.fromWeb>[0],
        ),
        writeStream,
      );
    } catch (pipeErr) {
      unlink(newFilePath).catch(() => {});
      throw pipeErr;
    }

    unlink(oldFilePath).catch(() => {});

    const taskUpdateHeader = request.headers.get('X-Task-Update');
    if (taskUpdateHeader) {
      try {
        const { updateTaskByFile } = await import('@/lib/video-task-db');
        const patch = JSON.parse(taskUpdateHeader) as Record<string, unknown>;
        await updateTaskByFile(oldFileName, { ...patch, file: newFileName });
      } catch (dbErr) {
        log.warn(
          { err: dbErr, oldFileName, newFileName },
          'PUT /api/media/[filename] - MongoDB sync failed (best-effort)',
        );
      }
    }

    log.info(
      { oldFileName, newFileName },
      'PUT /api/media/[filename] - file replaced',
    );
    return NextResponse.json(
      { ok: true, file: newFileName, oldFile: oldFileName },
      { status: 200 },
    );
  } catch (err) {
    log.error({ err, oldFileName }, 'PUT /api/media - write failed');
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/media/:filename
 *
 * Removes a single media file. Used to clean up server-side copies
 * after they have been saved back to OPFS on the client.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename || filename.includes('..') || filename.includes('/')) {
    log.warn(
      { filename },
      'DELETE /api/media/[filename] - invalid or traversal filename',
    );
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (USE_R2) {
    await deleteObject(filename);
    log.info(
      { filename },
      'DELETE /api/media/[filename] - object removed from R2',
    );
    return NextResponse.json({ ok: true });
  }

  const filePath = join(MEDIA_DIR, filename);
  try {
    await unlink(filePath);
  } catch {
    // File may already be gone — not an error
  }

  log.info({ filename }, 'DELETE /api/media/[filename] - file removed');
  return NextResponse.json({ ok: true });
}
