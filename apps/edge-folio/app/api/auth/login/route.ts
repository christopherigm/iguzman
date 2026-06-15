import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(`${process.env.API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const isProduction = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set("access_token", data.access as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    // Cookie outlives the 1h JWT so an expired access token gets refreshed
    // (proxy.ts / apiFetch) instead of looking like a logout.
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.set("refresh_token", data.refresh as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
