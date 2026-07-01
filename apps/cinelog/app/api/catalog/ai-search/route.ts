import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

// Proxies the AI natural-language movie search to Django. Same shape as the
// regular movies list (paginated Movie), so the catalog grid renders it as-is.
export async function GET(request: NextRequest) {
  const res = await apiFetch(
    `/api/catalog/movies/ai-search/${request.nextUrl.search}`,
    { cache: "no-store", allowAnonymous: true },
  );
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
