import { NextRequest, NextResponse } from "next/server";

import { apiFetch } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const locale = request.headers.get("accept-language") || "";
  const res = await apiFetch("/api/applications/tn-suggest/", {
    method: "POST",
    headers: { "Accept-Language": locale },
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson
    ? await res.json()
    : { detail: "LLM service unavailable. Please try again." };
  return NextResponse.json(body, { status: res.status });
}
