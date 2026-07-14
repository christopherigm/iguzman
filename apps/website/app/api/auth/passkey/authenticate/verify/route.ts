import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId, setAuthCookies } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const res = await fetch(`${API_URL}/api/auth/passkey/authenticate/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: await getSystemId() }),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
