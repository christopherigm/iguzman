import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const USE_R2 = !!process.env.R2_ACCOUNT_ID;

const BUCKET = process.env.R2_BUCKET_NAME ?? '';
const PRESIGNED_TTL_SECONDS = 3600;

const EXT_CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4a: 'audio/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mkv: 'video/x-matroska',
  srt: 'text/plain',
  txt: 'text/plain',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

let _client: S3Client | null = null;

function r2(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

/** Upload a local file to R2, streaming to avoid buffering large videos. */
export async function uploadFromPath(key: string, filePath: string): Promise<void> {
  const { size } = await stat(filePath);
  const body = createReadStream(filePath);
  await r2().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentLength: size,
      ContentType: contentTypeFor(key),
    }),
  );
}

/** Upload a web ReadableStream (e.g. from a Next.js request body) to R2.
 *  Uses multipart upload so large files (e.g. 100+ MB) succeed even on
 *  slow or VPN-routed connections: each 10 MB part is uploaded
 *  independently with built-in retries.
 */
export async function uploadFromWebStream(
  key: string,
  stream: ReadableStream,
  _contentLength?: number,
): Promise<void> {
  const body = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
  const upload = new Upload({
    client: r2(),
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentTypeFor(key),
    },
    partSize: 10 * 1024 * 1024, // 10 MB parts
    queueSize: 3,               // 3 concurrent part uploads
    leavePartsOnError: false,
  });
  await upload.done();
}

// ── R2 multipart upload helpers ─────────────────────────────────────────────
// Used by /api/media/multipart so the browser can split large files into
// chunks that each stay under Cloudflare's 100 MB proxy limit.

export async function createMultipartUpload(key: string): Promise<string> {
  const res = await r2().send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentTypeFor(key),
    }),
  );
  if (!res.UploadId) throw new Error('R2 did not return an UploadId');
  return res.UploadId;
}

export async function uploadMultipartPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Readable,
  contentLength: number,
): Promise<string> {
  const res = await r2().send(
    new UploadPartCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
      ContentLength: contentLength,
    }),
  );
  if (!res.ETag) throw new Error('R2 did not return an ETag for the part');
  return res.ETag;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  await r2()
    .send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }))
    .catch(() => {});
}

/**
 * Delete an object from R2.
 * Non-throwing — swallows errors (same semantics as fs.unlink on ENOENT).
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // intentionally ignored
  }
}

/** Generate a pre-signed GET URL (expires after ttlSeconds). */
export async function getPresignedGetUrl(
  key: string,
  ttlSeconds = PRESIGNED_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/** Download an R2 object to a local file path. */
export async function downloadToPath(key: string, destPath: string): Promise<void> {
  const res = await r2().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!res.Body) throw new Error(`R2: object not found: ${key}`);
  const write = createWriteStream(destPath);
  await pipeline(res.Body as Readable, write);
}
