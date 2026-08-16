import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import {
  getSystemId,
  setAuthCookies,
  unresolvedTenantResponse,
} from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  // ⚠ Refuse rather than guess - this mints the session, so a substituted
  // tenant is the same wrong-customer sign-in the password path has. See
  // `getSystemId`.
  const systemId = await getSystemId();
  if (systemId === null) return unresolvedTenantResponse();

  const res = await fetch(`${API_URL}/api/auth/passkey/authenticate/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: systemId }),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
