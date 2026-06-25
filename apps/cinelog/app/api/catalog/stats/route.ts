import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Proxy the public catalog statistics aggregation. `allowAnonymous` lets a
 * logged-out visitor through to Django (the endpoint is read-only), while a
 * signed-in request forwards the auth header so `?scope=library` can resolve the
 * user's owned movies. The `?scope=` query string is passed straight through.
 */
export async function GET(request: NextRequest) {
  const res = await apiFetch(`/api/catalog/stats/${request.nextUrl.search}`, {
    cache: "no-store",
    allowAnonymous: true,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
