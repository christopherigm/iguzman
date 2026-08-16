import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId, unresolvedTenantResponse } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  // Refuse rather than guess - a substituted tenant would create the account
  // under another customer's System. See `getSystemId`.
  const systemId = await getSystemId();
  if (systemId === null) return unresolvedTenantResponse();

  const res = await fetch(`${API_URL}/api/auth/signup/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: systemId }),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
