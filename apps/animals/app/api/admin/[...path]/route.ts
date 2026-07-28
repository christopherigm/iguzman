import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api-fetch';

/**
 * The CMS's single door to animals-api.
 *
 * The admin section talks to a wide surface of Django endpoints, so rather than
 * a route handler per resource this forwards the whole admin surface through
 * `apiFetch` - which attaches the bearer token from the HTTP-only cookie and
 * retries once on a 401, so the browser never holds a token.
 *
 * The allowlist is what stops it being an open proxy to *any* Django path -
 * notably the rest of `/api/auth/`, where a forwarded `password-reset/confirm/`
 * would be a genuine hole. A new admin endpoint under a new top-level prefix
 * needs a line here.
 */
const ALLOWED_PREFIXES = [
  'system/',
  'catalog/',
  'journal/',
  // Only the CMS user list, not the rest of /api/auth/.
  'auth/admin/users/',
  // Listing, creating and deleting restore points only. Downloading an archive
  // and uploading one to restore are binary/multipart and cannot come through
  // here (this proxy re-encodes every body and response as JSON) - they have
  // dedicated handlers under /api/backups/.
  'backups/',
];

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const joined = `${path.join('/')}/`;
  if (!isAllowed(joined)) return NextResponse.json({ detail: 'Not found' }, { status: 404 });

  const search = request.nextUrl.search;
  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';

  const res = await apiFetch(`/api/${joined}${search}`, {
    method: request.method,
    ...(hasBody
      ? { headers: { 'Content-Type': 'application/json' }, body: await request.text() }
      : {}),
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PUT(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
