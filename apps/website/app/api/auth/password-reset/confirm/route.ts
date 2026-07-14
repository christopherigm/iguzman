import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${API_URL}/api/auth/password-reset/confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
