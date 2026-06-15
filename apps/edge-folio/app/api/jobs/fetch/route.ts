import { apiFetch } from "@/lib/api-fetch";
import { NextResponse } from "next/server";

function safeJson(
  res: Response,
  fallback: Record<string, unknown> = { detail: "Service unavailable" },
) {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  return isJson ? res.json() : Promise.resolve(fallback);
}

export async function POST() {
  const res = await apiFetch("/api/jobs/fetch/", { method: "POST" });
  return NextResponse.json(await safeJson(res), { status: res.status });
}
