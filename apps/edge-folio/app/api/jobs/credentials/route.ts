import { apiFetch } from "@/lib/api-fetch";
import { NextRequest, NextResponse } from "next/server";

function safeJson(
  res: Response,
  fallback: Record<string, unknown> = { detail: "Service unavailable" },
) {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  return isJson ? res.json() : Promise.resolve(fallback);
}

export async function GET() {
  const res = await apiFetch("/api/jobs/credentials/", { cache: "no-store" });
  return NextResponse.json(await safeJson(res), { status: res.status });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const res = await apiFetch("/api/jobs/credentials/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await safeJson(res), { status: res.status });
}
