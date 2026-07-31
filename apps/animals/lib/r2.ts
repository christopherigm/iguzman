import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/**
 * Writing a transcoded clip into the bucket animals-api reads from.
 *
 * ⚠ **This is the one thing in this app that writes to storage directly**, and it
 * exists only because of where the video pipeline runs. Every other upload here -
 * every photograph, every icon, every brand image - is base64 in a JSON body that
 * Django receives and stores, which is the pattern to keep using. A clip cannot
 * go that way: it is measured in GB, so it is transcoded on this pod and the
 * ~100 MB result is PUT straight to R2 rather than pushed back through an API
 * that would have to hold it in memory to do the same thing.
 *
 * Two consequences worth keeping in mind:
 *
 * - **The key is built here, to Django's convention** (`keyForVideo` /
 *   `keyForPoster` below). It is then handed back to animals-api, which records
 *   it on the row's `FileField.name`. If `core/models.py`'s `video()` or
 *   `picture()` upload paths ever change, these must change with them or a clip
 *   lands somewhere the API will not look for it.
 * - **Nothing resizes what is written here.** Django's `ResizedImageField` only
 *   runs for a file assigned through the ORM, so a poster is stored exactly as
 *   ffmpeg produced it.
 *
 * The S3 endpoint (`<account>.r2.cloudflarestorage.com`) is **not** the proxied
 * `r2.iguzman.com.mx` domain, so the ~100 MB Cloudflare body cap that shapes the
 * rest of this pipeline does not apply to these writes.
 */

export const USE_R2 = !!process.env.R2_ACCOUNT_ID;

const BUCKET = process.env.R2_BUCKET_NAME ?? '';

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * ⚠ A stored object's Content-Type is what decides whether a browser plays a
 * clip or offers to download it, and it cannot be corrected later without
 * re-uploading. Default to the video type rather than `application/octet-stream`
 * for exactly that reason.
 */
function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return client;
}

/**
 * Where a transcoded clip goes, matching animals-api's `core.models.video`.
 * Kept in step with it by hand - see the note at the top of this file.
 */
export function keyForVideo(extension = 'mp4'): string {
  return `videos/sightingmedia/${randomUUID().replace(/-/g, '')}.${extension}`;
}

/** Where a poster frame goes, matching animals-api's `core.models.picture`. */
export function keyForPoster(): string {
  return `pictures/sightingmedia/${randomUUID().replace(/-/g, '')}.jpg`;
}

/**
 * Streams a local file into the bucket.
 *
 * `Upload` from `lib-storage` rather than a plain `PutObjectCommand`: it splits
 * the file into parts on its own, so a 150 MB transcode does not have to be read
 * into memory to be sent.
 */
export async function uploadFile(key: string, filePath: string): Promise<number> {
  const { size } = await stat(filePath);

  await new Upload({
    client: r2(),
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentTypeFor(key),
    },
  }).done();

  return size;
}

/**
 * Removes an object, for backing out a half-finished write.
 *
 * A transcode that uploads its video and then fails to upload its poster would
 * otherwise leave the video orphaned in the bucket with no row pointing at it -
 * invisible, unreachable, and paid for.
 */
export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
