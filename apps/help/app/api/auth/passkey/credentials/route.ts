import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET() {
  const res = await apiFetch("/api/auth/passkey/credentials/");
  if (!res.ok) return NextResponse.json({ count: 0, credentials: [] });
  const data: unknown = await res.json();
  return NextResponse.json(data);
}
