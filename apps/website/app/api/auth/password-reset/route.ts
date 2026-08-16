import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId, unresolvedTenantResponse } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  // Refuse rather than guess - the account is looked up per System, so a
  // substituted tenant silently resets nothing. See `getSystemId`.
  const systemId = await getSystemId();
  if (systemId === null) return unresolvedTenantResponse();

  const res = await fetch(`${API_URL}/api/auth/password-reset/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: systemId }),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
