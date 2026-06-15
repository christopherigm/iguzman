import { apiFetch } from "@/lib/api-fetch";
import { NextResponse } from "next/server";

export async function POST() {
  const res = await apiFetch("/api/applications/tn-suggest/", {
    method: "POST",
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson
    ? await res.json()
    : { detail: "LLM service unavailable. Please try again." };
  return NextResponse.json(body, { status: res.status });
}
