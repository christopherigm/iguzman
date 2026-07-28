import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

/**
 * GET /api/backups/<id>/download/ - stream one backup archive to an admin.
 *
 * Deliberately **not** routed through `/api/admin/[...path]`: that proxy parses
 * every response as JSON, which corrupts a zip. This is a byte-for-byte
 * passthrough of Django's `FileResponse`.
 *
 * Streamed (`res.body`) rather than buffered - a journal with a few years of
 * photographs produces a large archive, and holding one in the Node process per
 * concurrent download is how a small container runs out of memory.
 *
 * Authorisation is Django's: the endpoint is `IsSiteAdmin`, so an id guessed by
 * a signed-out visitor gets a 401 rather than the site's whole database.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ detail: 'Not found' }, { status: 404 });
  }

  const res = await apiFetch(`/api/backups/${id}/download/`, { cache: 'no-store' });

  if (!res.ok || !res.body) {
    const data: unknown = await res.json().catch(() => ({ detail: 'Download failed' }));
    return NextResponse.json(data, { status: res.status });
  }

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition':
      res.headers.get('content-disposition') ?? 'attachment; filename="backup.zip"',
    // An archive is the site's whole database; never let a proxy or the browser
    // keep a copy a later visitor could be served.
    'Cache-Control': 'no-store, private',
  });
  const length = res.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new NextResponse(res.body, { status: 200, headers });
}
