import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

/**
 * POST /api/backups/restore/ - forward a restore upload to Django.
 *
 * Separate from `/api/admin/[...path]` because that proxy re-sends the body as
 * text with a JSON content type, which destroys a multipart upload: the
 * boundary in the original `Content-Type` header is what delimits the file, and
 * it cannot be reconstructed on the other side.
 *
 * The body is **buffered** rather than streamed, which is the one place this
 * route trades memory for correctness. `apiFetch` retries once on a 401 (an
 * access token that expired mid-upload), and a `ReadableStream` body can only
 * be consumed once - streaming would turn every expired-token restore into an
 * unexplained failure after the whole archive had already been sent.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ detail: 'Expected a multipart upload.' }, { status: 400 });
  }

  const body = await request.arrayBuffer();

  const res = await apiFetch('/api/backups/restore/', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
    cache: 'no-store',
  });

  const data: unknown = await res.json().catch(() => ({ detail: 'The restore failed.' }));
  return NextResponse.json(data, { status: res.status });
}
