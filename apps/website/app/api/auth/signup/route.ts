import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { getSystemId } from "@/lib/api-fetch";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const res = await fetch(`${API_URL}/api/auth/signup/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, system_id: await getSystemId() }),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
