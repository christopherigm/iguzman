import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, stat, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  probeVideoFile,
  transcodeForWeb,
  extractPoster,
  type WebVideoCodec,
} from '@repo/helpers/ffmpeg-helper';
import { USE_R2, uploadFile, deleteObject, keyForVideo, keyForPoster } from '@/lib/r2';

/**
 * The video pipeline: chunked upload in, transcoded clip out.
 *
 * ## Why this runs here and not in animals-api
 *
 * A source clip is a camera-roll 4K recording - a few GB. It cannot reach Django
 * at all (Cloudflare caps a request to that hostname at ~100 MB), it would
 * occupy one of three **sync** gunicorn workers for the whole upload if it could,
 * and there is no ffmpeg in that image and no worker to run it in. So the browser
 * uploads here in ≤90 MB chunks, this pod transcodes with ffmpeg, PUTs the
 * ~100 MB result to R2, and PATCHes the row in animals-api with the key.
 *
 * ## The three constraints that shape everything below
 *
 * - **Scratch is local and ephemeral.** There is no shared volume (the cluster
 *   has no ReadWriteMany storage class), so an upload's chunks and its transcode
 *   live on one pod's own disk. Cookie session affinity on the ingress is what
 *   keeps every chunk of one upload arriving at the same pod; without it chunk 2
 *   lands somewhere chunk 1 is not.
 * - **A pod restart loses the job**, and nothing here can prevent that. The row
 *   is left mid-flight in Django, which reports it failed once
 *   `VIDEO_PROCESSING_TIMEOUT_MINUTES` has passed - a *derived* sweep, so no
 *   scheduler is needed on either side. The contributor re-uploads.
 * - **This pod also serves the public site.** ffmpeg is the heaviest thing that
 *   will ever run in it, so transcodes are serialised (`queue` below) and uploads
 *   are admission-capped. Without both, two 4K clips at once starve SSR for
 *   readers and can push the container past its memory limit.
 */

/* ── Scratch ─────────────────────────────────────────────────────────── */

/**
 * Where uploads and transcodes live. An `emptyDir` in the cluster, so it is
 * wiped with the pod - which is the durability model, not an accident.
 *
 * ⚠ It has a `sizeLimit`, and **exceeding it gets the pod evicted** rather than
 * failing the write. That takes down the public site briefly and kills every
 * other in-flight job, which is why `MAX_CONCURRENT_UPLOADS` exists at all: the
 * disk budget is (max source size x concurrent uploads) + the output, and
 * uploads are what drive it, not transcodes.
 */
const SCRATCH_ROOT = process.env.VIDEO_SCRATCH_DIR || join(tmpdir(), 'animals-video');

/** Ceiling on the source file, mirroring animals-api's `MAX_VIDEO_UPLOAD_MB`. */
const MAX_SOURCE_BYTES =
  Number(process.env.MAX_VIDEO_UPLOAD_MB || 3000) * 1024 * 1024;

/**
 * How many uploads may be in flight on this pod at once. See the scratch note:
 * this is a disk budget, and it is deliberately small.
 */
const MAX_CONCURRENT_UPLOADS = Number(process.env.MAX_CONCURRENT_UPLOADS || 2);

/** Chunks larger than this are refused - the browser should be splitting. */
const MAX_CHUNK_BYTES = 100 * 1024 * 1024;

/* ── Failure codes ───────────────────────────────────────────────────── */

/**
 * ⚠ These strings are written to `SightingMedia.processing_error`, which is on a
 * payload cached under one key and served to **every** caller. So a code, never
 * ffmpeg's stderr - that carries absolute paths from inside this pod. The detail
 * is logged here instead.
 */
export type ProcessingError =
  | 'too_long'
  | 'too_large'
  | 'unsupported_format'
  | 'probe_failed'
  | 'encode_failed'
  | 'upload_failed';

/* ── Upload tickets ──────────────────────────────────────────────────── */

const HANDLER_TOKEN = process.env.VIDEO_HANDLER_TOKEN ?? '';

interface TicketClaims {
  media_id: number;
  sighting_id: number;
  expires: number;
}

/**
 * Verifies the ticket animals-api issued when the row was reserved.
 *
 * This pod cannot decide for itself whether a caller may write to a given media
 * row: for a contributor the answer turns on the sighting's `created_by`, which
 * the read payload deliberately does not publish. The reserve endpoints have
 * already made that decision under their own permission classes, and the ticket
 * carries it here.
 *
 * ⚠ Returns null when no secret is configured. An empty `HANDLER_TOKEN` must
 * never verify an empty signature - that would make this endpoint an open upload
 * target for anyone who can guess a media id.
 */
export function verifyUploadTicket(ticket: string): TicketClaims | null {
  if (!HANDLER_TOKEN || !ticket) return null;

  const [encoded, signature] = ticket.split('.');
  if (!encoded || !signature) return null;

  let payload: Buffer;
  try {
    payload = Buffer.from(encoded, 'base64url');
  } catch {
    return null;
  }

  const expected = createHmac('sha256', HANDLER_TOKEN).update(payload).digest('hex');
  // Compare as bytes of equal length - `timingSafeEqual` throws otherwise, which
  // would itself leak whether the length was right.
  const supplied = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return null;
  }

  let claims: TicketClaims;
  try {
    claims = JSON.parse(payload.toString()) as TicketClaims;
  } catch {
    return null;
  }

  if (!claims.expires || claims.expires * 1000 < Date.now()) return null;
  return claims;
}

/* ── Upload sessions ─────────────────────────────────────────────────── */

interface UploadSession {
  mediaId: number;
  sightingId: number;
  filename: string;
  dir: string;
  sourcePath: string;
  /** Chunk indexes already written, so a retried part is not appended twice. */
  received: Set<number>;
  /** Highest chunk index appended so far - parts must arrive in order. */
  nextIndex: number;
  bytes: number;
  startedAt: number;
}

const sessions = new Map<string, UploadSession>();

/** An upload abandoned mid-way still holds disk; reap it on the next attempt. */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

async function reapStaleSessions(): Promise<void> {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.startedAt < cutoff) {
      sessions.delete(id);
      await rm(session.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export function activeUploadCount(): number {
  return sessions.size;
}

export async function beginUpload(claims: TicketClaims, filename: string) {
  await reapStaleSessions();

  if (sessions.size >= MAX_CONCURRENT_UPLOADS) return null;

  const uploadId = `${claims.media_id}-${Date.now().toString(36)}`;
  const dir = join(SCRATCH_ROOT, uploadId);
  await mkdir(dir, { recursive: true });

  // The extension decides the container ffmpeg reads and the Content-Type of
  // anything derived from it, so it is taken from the caller's filename rather
  // than assumed - but only after the API has already validated it against the
  // allowed list at reserve time.
  const extension = filename.split('.').pop()?.toLowerCase() || 'mp4';

  const session: UploadSession = {
    mediaId: claims.media_id,
    sightingId: claims.sighting_id,
    filename,
    dir,
    sourcePath: join(dir, `source.${extension}`),
    received: new Set(),
    nextIndex: 0,
    bytes: 0,
    startedAt: Date.now(),
  };
  sessions.set(uploadId, session);
  return { uploadId, session };
}

export function getUpload(uploadId: string): UploadSession | undefined {
  return sessions.get(uploadId);
}

/**
 * Appends one chunk to the source file.
 *
 * Chunks are **appended in order** rather than written as N part files and
 * concatenated at the end. Concatenating would need the whole file's worth of
 * disk a second time, and the scratch budget is already the binding constraint
 * here. The cost is that parts cannot arrive out of order - which is a real
 * limitation, so the browser uploads them sequentially rather than in parallel.
 */
export async function appendChunk(
  uploadId: string,
  index: number,
  body: Buffer,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const session = sessions.get(uploadId);
  if (!session) return { ok: false, reason: 'unknown_upload' };

  if (body.byteLength > MAX_CHUNK_BYTES) {
    return { ok: false, reason: 'chunk_too_large' };
  }

  // A retried chunk is a no-op rather than a duplicate append: a network blip
  // that loses the response but not the request would otherwise corrupt the file
  // in a way nothing downstream could detect.
  if (session.received.has(index)) return { ok: true };

  if (index !== session.nextIndex) return { ok: false, reason: 'out_of_order' };

  if (session.bytes + body.byteLength > MAX_SOURCE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  await appendFile(session.sourcePath, body);
  session.received.add(index);
  session.nextIndex += 1;
  session.bytes += body.byteLength;
  return { ok: true };
}

export async function discardUpload(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (!session) return;
  sessions.delete(uploadId);
  await rm(session.dir, { recursive: true, force: true }).catch(() => {});
}

/* ── The transcode queue ─────────────────────────────────────────────── */

/**
 * One transcode at a time, per pod.
 *
 * A promise chain rather than a worker pool: ffmpeg already uses every core it
 * is given, so a second concurrent encode makes both slower while doubling peak
 * memory - on the same pod that is serving the public site. Scaling out is
 * `replicaCount`, not concurrency here.
 *
 * ⚠ Nothing survives a restart. The chain is in-process, so a rollout drops
 * whatever is queued; those rows are reported failed by animals-api once they
 * age past its timeout. That is the accepted durability model, not an oversight.
 */
let queue: Promise<unknown> = Promise.resolve();

export function enqueueTranscode(uploadId: string): void {
  queue = queue.then(() => runTranscode(uploadId)).catch(() => {});
}

interface SystemVideoSettings {
  maxHeight: number;
  crf: number;
  codec: WebVideoCodec;
}

/**
 * The authored encode settings, read fresh for every clip.
 *
 * Not cached: a transcode happens minutes apart at most and the cost is one
 * request, while a cached copy would mean an author changing the quality at
 * /admin/system sees no effect until this pod restarts.
 */
async function readSystemSettings(): Promise<SystemVideoSettings> {
  const fallback: SystemVideoSettings = { maxHeight: 1080, crf: 23, codec: 'h264' };
  try {
    const res = await fetch(`${process.env.API_URL}/api/system/`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      video_max_height?: number;
      video_quality?: number;
      video_codec?: string;
    };
    return {
      maxHeight: data.video_max_height ?? fallback.maxHeight,
      crf: data.video_quality ?? fallback.crf,
      codec: data.video_codec === 'hevc' ? 'hevc' : 'h264',
    };
  } catch {
    // A dead API costs the *settings*, not the transcode - the same bargain
    // `SYSTEM_FALLBACK` makes for the site's branding.
    return fallback;
  }
}

/**
 * Tells animals-api where a transcode got to.
 *
 * Authenticated with the shared secret rather than the uploader's session: this
 * runs minutes after that request returned, and often after the session itself
 * has gone.
 */
async function report(
  sightingId: number,
  mediaId: number,
  body: Record<string, unknown>,
): Promise<void> {
  await fetch(
    `${process.env.API_URL}/api/journal/sightings/${sightingId}/media/${mediaId}/processing/`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Video-Handler-Token': HANDLER_TOKEN,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  ).catch(() => {
    // Nothing to do but let the row age out into `failed` on the API's side.
    // Retrying here would outlive the scratch files this depends on.
  });
}

async function runTranscode(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (!session) return;

  const { mediaId, sightingId, dir, sourcePath } = session;
  const outputPath = join(dir, 'output.mp4');
  const posterPath = join(dir, 'poster.jpg');
  let videoKey: string | null = null;

  const fail = async (code: ProcessingError, detail?: unknown) => {
    console.error('[video] transcode failed', { mediaId, code, detail });
    // Back out a video already in the bucket, or it is orphaned: paid for,
    // unreachable, and pointed at by nothing.
    if (videoKey) await deleteObject(videoKey).catch(() => {});
    await report(sightingId, mediaId, { status: 'failed', error: code });
  };

  try {
    await report(sightingId, mediaId, { status: 'processing' });

    const probe = await probeVideoFile(sourcePath);
    if (!probe.durationSec) {
      await fail('probe_failed', probe);
      return;
    }

    const settings = await readSystemSettings();

    await transcodeForWeb({
      inputPath: sourcePath,
      outputPath,
      maxHeight: settings.maxHeight,
      crf: settings.crf,
      codec: settings.codec,
    });

    // The poster is best-effort: a clip with no still is worse-looking, a clip
    // thrown away for want of one is worse.
    let posterKey: string | null = null;
    try {
      await extractPoster({ inputPath: sourcePath, outputPath: posterPath });
    } catch (err) {
      console.error('[video] poster extraction failed', { mediaId, err });
    }

    if (!USE_R2) {
      // Development without R2 configured. Failing loudly beats reporting a
      // `ready` row whose file is on a laptop.
      await fail('upload_failed', 'R2 is not configured');
      return;
    }

    const outputProbe = await probeVideoFile(outputPath);
    videoKey = keyForVideo('mp4');
    const sizeBytes = await uploadFile(videoKey, outputPath);

    if (existsSync(posterPath)) {
      const key = keyForPoster();
      await uploadFile(key, posterPath);
      posterKey = key;
    }

    await report(sightingId, mediaId, {
      status: 'ready',
      file_key: videoKey,
      ...(posterKey ? { poster_key: posterKey } : {}),
      duration_seconds: Math.round(outputProbe.durationSec || probe.durationSec),
      width: outputProbe.width,
      height: outputProbe.height,
      size_bytes: sizeBytes,
    });
  } catch (err) {
    await fail(videoKey ? 'upload_failed' : 'encode_failed', err);
  } finally {
    // Always, on every path: the source is the largest thing on this disk and
    // leaving one behind on a failure is how the scratch volume fills up and
    // the pod gets evicted.
    sessions.delete(uploadId);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ── Source validation ───────────────────────────────────────────────── */

/**
 * Checks the assembled source before it is queued.
 *
 * The browser already checked the duration from the file's own metadata and the
 * API checked the declared size, but both of those are things a caller *says*.
 * This is the first point at which the actual bytes can be measured, which is
 * why the contributor duration cap is enforced here rather than trusted from the
 * reservation.
 */
export async function validateSource(
  uploadId: string,
  maxDurationSeconds: number | null,
): Promise<ProcessingError | null> {
  const session = sessions.get(uploadId);
  if (!session) return 'probe_failed';

  const { size } = await stat(session.sourcePath).catch(() => ({ size: 0 }));
  if (!size) return 'probe_failed';
  if (size > MAX_SOURCE_BYTES) return 'too_large';

  const probe = await probeVideoFile(session.sourcePath);
  if (!probe.durationSec) return 'unsupported_format';
  if (maxDurationSeconds && probe.durationSec > maxDurationSeconds) return 'too_long';

  return null;
}

export async function reportFailure(
  uploadId: string,
  code: ProcessingError,
): Promise<void> {
  const session = sessions.get(uploadId);
  if (!session) return;
  await report(session.sightingId, session.mediaId, { status: 'failed', error: code });
}
