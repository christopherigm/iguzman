import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await apiFetch(`/api/catalog/movies/${id}/`, {
    cache: "no-store",
    allowAnonymous: true,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: unknown = await request.json();
  const res = await apiFetch(`/api/catalog/movies/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Forward `?purge=true` so a staff user can hard-delete the shared movie
  // (Django gates the purge on `is_staff`); without it Django only drops the
  // requesting user's ownership.
  const purge = request.nextUrl.searchParams.get("purge") === "true";
  const res = await apiFetch(
    `/api/catalog/movies/${id}/${purge ? "?purge=true" : ""}`,
    {
      method: "DELETE",
    },
  );
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
