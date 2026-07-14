import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId, setAuthCookies } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const res = await fetch(`${API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: await getSystemId() }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
