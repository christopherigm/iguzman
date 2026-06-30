import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

// Links the signed-in user's account to the pairing code shown on their TV.
// apiFetch attaches the user's access token (refreshing on expiry) so Django
// can resolve request.user for the authorize endpoint.
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/tv/authorize/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
