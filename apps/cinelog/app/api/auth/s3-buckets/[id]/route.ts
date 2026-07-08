import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

type Params = { params: Promise<{ id: string }> };

// Updates a bucket (rename, rotate credentials). Omitting secret_access_key
// keeps the stored secret untouched.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body: unknown = await request.json();
  const res = await apiFetch(`/api/auth/s3-buckets/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// Removes a bucket. Any digital copies that referenced it stop resolving.
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await apiFetch(`/api/auth/s3-buckets/${id}/`, {
    method: "DELETE",
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
