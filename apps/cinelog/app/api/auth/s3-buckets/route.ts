import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

// Lists the signed-in user's registered S3 buckets.
export async function GET() {
  const res = await apiFetch("/api/auth/s3-buckets/", { cache: "no-store" });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// Registers a new bucket (Django encrypts the secret access key before storing).
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/s3-buckets/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
