import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The public contribute flow's door to animals-api.
 *
 * A sibling of `/api/admin/[...path]` rather than a couple more lines in its
 * allowlist, and the separation is the point: that handler forwards the *whole*
 * admin surface, and the accounts that reach it are administrators. This one is
 * used by any signed-in reader, so its allowlist is three exact paths - not three
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
  // ⚠ Note what this is **not**: `catalog/locations/`. The literal segment is
  // the whole point - the CMS's location list lives one path up and is
  // administrator-only, and a prefix here would forward writes to it.
  "catalog/locations/contribute/",
  "journal/sightings/contribute/",
];

/**
 * The one contribute path that cannot be an exact string: reserving a clip row
 * names the entry it belongs to.
 *
 * ⚠ Anchored, and `\d+` rather than anything looser. A pattern is a weaker
 * promise than the exact list above, so it is written to match that one endpoint
 * and nothing else - `journal/sightings/12/media/` or any other suffix must not
 * slip through, or this handler would start forwarding gallery writes for any
 * signed-in reader.
 *
 * Django still re-derives the real decision (the entry must be the caller's own
 * and still unpublished); this only decides what may be *asked*.
 */
const ALLOWED_PATH_PATTERNS = [
  /^journal\/sightings\/\d+\/media\/video\/contribute\/$/,
];

type Ctx = { params: Promise<{ path: string[] }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const joined = `${(await params).path.join("/")}/`;
  const allowed =
    ALLOWED_PATHS.includes(joined) ||
    ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(joined));
  if (!allowed) {
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
