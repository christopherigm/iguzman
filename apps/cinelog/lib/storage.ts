import { ApiError } from "./auth";

/**
 * Client for a user's registered S3-compatible buckets, used to host their own
 * digital copies of films. Mirrors the Django `/api/auth/s3-buckets/` endpoints
 * (proxied through the Next route handlers, which attach the access token).
 */

export interface S3Bucket {
  id: number;
  label: string;
  endpoint_url: string;
  region: string;
  bucket_name: string;
  access_key_id: string;
  created: string;
}

/** The fields a create/update accepts. `secret_access_key` is optional on update. */
export interface S3BucketInput {
  label: string;
  endpoint_url: string;
  region?: string;
  bucket_name: string;
  access_key_id: string;
  secret_access_key?: string;
}

export interface S3Object {
  key: string;
  size: number;
  last_modified: string;
}

/** Prefix that marks a digital-copy value as an S3 reference (vs. a plain URL). */
export const S3_REF_PREFIX = "s3://";

/** Build the stored reference for a bucket + object key. */
export function buildS3Ref(bucketId: number, key: string): string {
  return `${S3_REF_PREFIX}${bucketId}/${key}`;
}

/** Parse an `s3://<bucketId>/<key>` reference, or null when it isn't one. */
export function parseS3Ref(
  value: string,
): { bucketId: number; key: string } | null {
  if (!value.startsWith(S3_REF_PREFIX)) return null;
  const rest = value.slice(S3_REF_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucketId = Number.parseInt(rest.slice(0, slash), 10);
  const key = rest.slice(slash + 1);
  if (Number.isNaN(bucketId) || !key) return null;
  return { bucketId, key };
}

async function parseError(res: Response): Promise<never> {
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  throw new ApiError(res.status, data);
}

export async function listBuckets(): Promise<S3Bucket[]> {
  const res = await fetch("/api/auth/s3-buckets");
  if (!res.ok) return parseError(res);
  return res.json() as Promise<S3Bucket[]>;
}

export async function createBucket(input: S3BucketInput): Promise<S3Bucket> {
  const res = await fetch("/api/auth/s3-buckets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<S3Bucket>;
}

export async function updateBucket(
  id: number,
  input: Partial<S3BucketInput>,
): Promise<S3Bucket> {
  const res = await fetch(`/api/auth/s3-buckets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseError(res);
  return res.json() as Promise<S3Bucket>;
}

export async function deleteBucket(id: number): Promise<void> {
  const res = await fetch(`/api/auth/s3-buckets/${id}`, { method: "DELETE" });
  if (!res.ok) return parseError(res);
}

export async function listBucketObjects(
  id: number,
  prefix = "",
): Promise<S3Object[]> {
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  const res = await fetch(`/api/auth/s3-buckets/${id}/objects${query}`);
  if (!res.ok) return parseError(res);
  const data = (await res.json()) as { objects: S3Object[] };
  return data.objects;
}
