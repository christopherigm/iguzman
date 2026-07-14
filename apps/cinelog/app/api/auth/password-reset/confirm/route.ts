import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@repo/auth/tokens";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/password-reset/confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
