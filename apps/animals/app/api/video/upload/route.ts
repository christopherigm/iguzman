import { NextRequest, NextResponse } from 'next/server';
import {
  verifyUploadTicket,
  beginUpload,
  getUpload,
  appendChunk,
  discardUpload,
  enqueueTranscode,
  validateSource,
  reportFailure,
} from '@/lib/video-pipeline';

/**
 * The chunked upload endpoint for sighting clips.
 *
 * ```
 * POST /api/video/upload?action=initiate   { ticket, filename }  -> { uploadId }
 * POST /api/video/upload?action=part&uploadId=..&index=N   raw bytes  -> { ok }
 * POST /api/video/upload?action=complete&uploadId=..       -> 202, transcode queued
 * POST /api/video/upload?action=abort&uploadId=..          -> { ok }
 * ```
 *
 * ⚠ **Why chunks at all.** `animals.iguzman.com.mx` is proxied through
 * Cloudflare, which caps a request body at ~100 MB regardless of what nginx
 * allows - so a 2 GB clip cannot arrive in one POST no matter how the ingress is
 * configured. The browser splits it and this reassembles.
 *
 * ⚠ **This route is stateful, and that is what the ingress affinity is for.** The
 * upload session and its bytes live on *this pod's* disk, so every chunk of one
 * upload has to reach the same replica. Cookie session affinity on the upload
 * Ingress is what guarantees that; without it a second replica answers chunk 2
 * with `unknown_upload` and the upload can never complete.
 *
 * Authorisation is the signed ticket animals-api issued when the row was
 * reserved - see `verifyUploadTicket`. There is deliberately no session check
 * here: the decision about who may write a given media row was already made by
 * the endpoint that issued the ticket, under its own permission class, and
 * re-deriving it would mean publishing a sighting's `created_by`.
 */

/** Node, not Edge: this writes to the filesystem and spawns ffmpeg. */
export const runtime = 'nodejs';
/** An upload is per-request state on one pod; nothing here may be cached. */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'initiate') return initiate(request);
  if (action === 'part') return part(request);
  if (action === 'complete') return complete(request);
  if (action === 'abort') return abort(request);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

async function initiate(request: NextRequest) {
  let body: { ticket?: string; filename?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const claims = verifyUploadTicket(body.ticket ?? '');
  if (!claims) {
    return NextResponse.json({ error: 'Invalid or expired ticket' }, { status: 403 });
  }

  const filename = (body.filename ?? '').trim();
  // The filename only ever contributes an extension, and `beginUpload` takes the
  // last dot-segment - but a path separator in it would still be a bad thing to
  // have accepted, so it is refused rather than sanitised.
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const started = await beginUpload(claims, filename);
  if (!started) {
    // Admission control, not an error: the scratch disk is the binding limit and
    // exceeding it evicts the pod. The browser retries.
    return NextResponse.json(
      { error: 'Too many uploads in progress. Try again shortly.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ uploadId: started.uploadId });
}

async function part(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId') ?? '';
  const index = Number(request.nextUrl.searchParams.get('index'));

  if (!uploadId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Missing uploadId or index' }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: 'Empty chunk' }, { status: 400 });
  }

  const chunk = Buffer.from(await request.arrayBuffer());
  const result = await appendChunk(uploadId, index, chunk);

  if (!result.ok) {
    // `unknown_upload` is the one worth distinguishing: it is what a client sees
    // when its pod was replaced mid-upload, and the answer is to start again
    // rather than to retry the chunk.
    const status = result.reason === 'unknown_upload' ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true });
}

async function complete(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId') ?? '';
  const session = getUpload(uploadId);
  if (!session) {
    return NextResponse.json({ error: 'unknown_upload' }, { status: 404 });
  }

  let body: { maxDurationSeconds?: number | null } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* the field is optional - an admin upload sends nothing */
  }

  // The first point at which the real bytes can be measured. Everything checked
  // before this - the declared size at reservation, the duration the browser
  // read off the file - is something the caller *said*.
  const problem = await validateSource(uploadId, body.maxDurationSeconds ?? null);
  if (problem) {
    await reportFailure(uploadId, problem);
    await discardUpload(uploadId);
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Fire and forget: a transcode runs for minutes and the browser must not hold
  // a request open across it. Progress is read by polling the sighting payload,
  // whose `processing_status` this job updates.
  enqueueTranscode(uploadId);

  return NextResponse.json({ ok: true, mediaId: session.mediaId }, { status: 202 });
}

async function abort(request: NextRequest) {
  const uploadId = request.nextUrl.searchParams.get('uploadId') ?? '';
  await discardUpload(uploadId);
  return NextResponse.json({ ok: true });
}
