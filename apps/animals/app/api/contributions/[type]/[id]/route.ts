import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";
import { isContributionType } from "@/lib/contributions";

/**
 * One of the caller's own contributions: read it, correct it, withdraw it.
 *
 * Two static segments rather than a `[...path]` catch-all with a regex
 * allowlist, which is what `/api/contribute/[...path]` needs for its one dynamic
 * path. Here the shape is fixed, so the router itself is the allowlist and there
 * is no pattern to get subtly wrong.
 *
 * `type` is still checked against the three known values before anything is
 * forwarded: it lands in the upstream URL, so an unchecked segment would let a
 * caller aim this handler at any path under `/api/contributions/`.
 *
 * ⚠ **Ownership is not decided here and must not be.** This handler cannot know
 * who filed a given record. Django looks every row up *inside* a
 * `created_by=request.user` filter, so another account's id answers 404 - see
 * `core/my_contributions.py`.
 */

type Ctx = { params: Promise<{ type: string; id: string }> };

async function upstream(params: Ctx["params"]): Promise<string | null> {
  const { type, id } = await params;
  if (!isContributionType(type)) return null;
  // The route matched a string; the API's converter is `<int:pk>`, so anything
  // else would 404 upstream anyway - refused here so it never leaves this pod.
  if (!/^\d+$/.test(id)) return null;
  return `/api/contributions/${type}/${id}/`;
}

const notFound = () =>
  NextResponse.json({ detail: "Not found" }, { status: 404 });

export async function GET(_request: NextRequest, { params }: Ctx) {
  const path = await upstream(params);
  if (!path) return notFound();

  const res = await apiFetch(path, { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const path = await upstream(params);
  if (!path) return notFound();

  const res = await apiFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const path = await upstream(params);
  if (!path) return notFound();

  const res = await apiFetch(path, { method: "DELETE" });
  // 204 carries no body, and `NextResponse.json(undefined)` would send the
  // string "null" with it - which the client would then try to parse.
  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
