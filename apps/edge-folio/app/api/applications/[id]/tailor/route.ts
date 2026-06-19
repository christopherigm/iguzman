import { apiFetch } from "@/lib/api-fetch";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const locale = request.headers.get("accept-language") || "";
  const res = await apiFetch(`/api/applications/${id}/tailor/`, {
    method: "POST",
    headers: { "Accept-Language": locale },
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : { detail: "Service unavailable" };
  return NextResponse.json(body, { status: res.status });
}
