import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/passkey/register/verify/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
