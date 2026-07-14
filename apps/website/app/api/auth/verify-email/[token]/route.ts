import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const res = await fetch(`${API_URL}/api/auth/verify-email/${token}/`);
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
