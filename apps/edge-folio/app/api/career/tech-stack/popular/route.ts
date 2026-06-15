import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET() {
  const res = await apiFetch("/api/career/tech-stack/popular/", {
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
