import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const res = await apiFetch(`/api/catalog/movies/by-slug/${slug}/`, {
    cache: "no-store",
    allowAnonymous: true,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
