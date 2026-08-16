import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import {
  getSystemId,
  setAuthCookies,
  unresolvedTenantResponse,
} from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  // ⚠ Refuse rather than guess. Django builds the username from `system_id`
  // (`build_username(system_id, email)`), so a substituted tenant signs the
  // caller in as a *different customer's* admin - see `getSystemId`.
  const systemId = await getSystemId();
  if (systemId === null) return unresolvedTenantResponse();

  const res = await fetch(`${API_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: systemId }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  await setAuthCookies(data.access as string, data.refresh as string);
  return NextResponse.json({ ok: true });
}
