import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId, unresolvedTenantResponse } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  // Refuse rather than guess - the credentials offered are the ones registered
  // to this System's account. See `getSystemId`.
  const systemId = await getSystemId();
  if (systemId === null) return unresolvedTenantResponse();

  const res = await fetch(`${API_URL}/api/auth/passkey/authenticate/options/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: systemId }),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
