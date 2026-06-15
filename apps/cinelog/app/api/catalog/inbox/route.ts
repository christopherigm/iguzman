import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET(request: NextRequest) {
  const res = await apiFetch(`/api/catalog/inbox/${request.nextUrl.search}`, {
    cache: "no-store",
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
