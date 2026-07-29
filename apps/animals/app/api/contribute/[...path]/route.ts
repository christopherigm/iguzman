import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The public contribute flow's door to animals-api.
 *
 * A sibling of `/api/admin/[...path]` rather than a couple more lines in its
 * allowlist, and the separation is the point: that handler forwards the *whole*
 * admin surface, and the accounts that reach it are administrators. This one is
 * used by any signed-in reader, so its allowlist is two exact paths - not two
 * prefixes - and it accepts nothing but POST.
 *
 * Django is what actually enforces the permission (`core.permissions.IsContributor`,
 * re-derived from the token on every call). What this handler contributes is that
 * the browser never holds a token: `apiFetch` attaches the bearer from the
 * HTTP-only cookie and retries once on a 401, so a contributor whose access token
 * expired while they were filling in the form does not lose the entry.
 */
const ALLOWED_PATHS = [
  "catalog/species/contribute/",
  "journal/sightings/contribute/",
];

type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const joined = `${(await params).path.join("/")}/`;
  if (!ALLOWED_PATHS.includes(joined)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const res = await apiFetch(`/api/${joined}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });

  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
