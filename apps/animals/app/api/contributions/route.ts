import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The contributor's own list.
 *
 * A third door beside `/api/contribute/[...path]` (POST-only creates) and
 * `/api/admin/[...path]` (the whole admin surface), and separate from both for
 * the reason those two are separate from each other: what each may *ask* is the
 * safety boundary, and a handler that forwards one endpoint cannot be widened by
 * accident.
 *
 * There is deliberately **no allowlist here** - there is nothing to allow. This
 * file is the endpoint; the only thing forwarded is `GET /api/contributions/`
 * with its query string, and the sibling `[type]/[id]` route handles the rest.
 *
 * Django is what enforces the scope: `core.permissions.IsContributor` plus a
 * queryset filtered by `created_by`, re-derived from the token on every call
 * (`core/my_contributions.py`). What this handler contributes is that the
 * browser never holds a token.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.search;
  const res = await apiFetch(`/api/contributions/${query}`, {
    // Never cached in Next - this payload is per-account and changes the moment
    // a reviewer publishes something. See apps/CLAUDE.md → "Caching".
    cache: "no-store",
  });

  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
