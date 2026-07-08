import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

type Params = { params: Promise<{ id: string }> };

// Lists objects in the bucket for the file picker. Forwards the optional
// `prefix` filter; Django returns 400 if the credentials can't list.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const prefix = request.nextUrl.searchParams.get("prefix") ?? "";
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  const res = await apiFetch(`/api/auth/s3-buckets/${id}/objects/${query}`, {
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
