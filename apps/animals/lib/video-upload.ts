/**
 * The browser half of a clip upload.
 *
 * Both callers - the CMS's media editor and the public contribute flow - reserve
 * a row through their own API route first (which is what decides they are allowed
 * to), then hand the ticket that came back to `uploadVideo` below.
 *
 * ⚠ **Chunks go up one at a time, in order, on purpose.** The handler appends
 * each to the source file as it arrives rather than staging N part files and
 * concatenating them, because concatenating would need the whole file's worth of
 * scratch disk a second time - and that disk is an `emptyDir` whose `sizeLimit`
 * evicts the pod when exceeded. Parallel chunks would arrive out of order and be
 * refused. The cost is throughput on a fast connection; the alternative costs
 * the pod.
 */

/**
 * ⚠ Must stay under Cloudflare's ~100 MB request cap. `animals.iguzman.com.mx`
 * is proxied, so a chunk larger than that is rejected at the edge with an opaque
 * 413 that never reaches the handler - which is the whole reason this file
 * exists. 90 MB leaves room for request framing.
 */
const CHUNK_BYTES = 90 * 1024 * 1024;

export interface UploadVideoOptions {
  file: File;
  /** The signed ticket from the reserve response. */
  ticket: string;
  /**
   * Enforced against the real bytes by `ffprobe` on the handler. Pass it for a
   * contribution; omit for the CMS, which has no duration limit.
   */
  maxDurationSeconds?: number;
  /** Called with 0-100 as the bytes go up. Upload only - not the transcode. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export class VideoUploadError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * Reads a video file's duration in the browser, for refusing an over-long clip
 * before any of it is uploaded.
 *
 * Advisory only - the handler re-reads it from the actual bytes - but it is the
 * difference between "that clip is too long" in the picker and the same message
 * after a contributor has spent ten minutes uploading on cellular data.
 *
 * Resolves `null` when the browser cannot read the metadata, which is a real
 * case for some phone containers; the caller should let those through and leave
 * the decision to the handler.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.onloadedmetadata = () => {
      done(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

export async function uploadVideo({
  file,
  ticket,
  maxDurationSeconds,
  onProgress,
  signal,
}: UploadVideoOptions): Promise<void> {
  const initiate = await fetch('/api/video/upload?action=initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, filename: file.name }),
    signal,
  });

  if (!initiate.ok) {
    const body = (await initiate.json().catch(() => ({}))) as { error?: string };
    // 503 is admission control rather than a fault - every pod is already
    // holding as many uploads as its scratch disk allows.
    throw new VideoUploadError(
      initiate.status === 503 ? 'busy' : (body.error ?? 'initiate_failed'),
    );
  }

  const { uploadId } = (await initiate.json()) as { uploadId: string };
  const total = Math.ceil(file.size / CHUNK_BYTES);

  try {
    for (let index = 0; index < total; index += 1) {
      const chunk = file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
      const res = await fetch(
        `/api/video/upload?action=part&uploadId=${encodeURIComponent(uploadId)}&index=${index}`,
        { method: 'POST', body: chunk, signal },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new VideoUploadError(body.error ?? 'chunk_failed');
      }
      onProgress?.(Math.round(((index + 1) / total) * 100));
    }

    const res = await fetch(
      `/api/video/upload?action=complete&uploadId=${encodeURIComponent(uploadId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDurationSeconds: maxDurationSeconds ?? null }),
        signal,
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new VideoUploadError(body.error ?? 'complete_failed');
    }
  } catch (error) {
    // Free the pod's scratch disk rather than waiting for the session to age
    // out - an abandoned multi-GB upload is the thing most likely to fill it.
    await fetch(
      `/api/video/upload?action=abort&uploadId=${encodeURIComponent(uploadId)}`,
      { method: 'POST' },
    ).catch(() => {});
    throw error;
  }
}
