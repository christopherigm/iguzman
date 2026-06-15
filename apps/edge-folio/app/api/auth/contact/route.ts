import { apiFetch } from "@/lib/api-fetch";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const res = await apiFetch("/api/auth/contact/", { cache: "no-store" });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const res = await apiFetch("/api/auth/contact/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
