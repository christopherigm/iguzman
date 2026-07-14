import { NextRequest, NextResponse } from "next/server";
import { setAuthCookies } from "@repo/auth/api-fetch";
import { apiUrl } from "@repo/auth/tokens";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${apiUrl()}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
