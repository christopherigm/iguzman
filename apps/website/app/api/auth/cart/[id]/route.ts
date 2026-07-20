import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * A cart line is addressed by its own row id, not by the catalog item's - a menu
 * line is identified by item *and* ingredient selection, so the catalog id alone
 * cannot name it.
 * (This is where the cart parts ways with `/api/auth/favorites/[kind]/[id]`.)
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: unknown = await request.json();

  const res = await apiFetch(`/api/auth/cart/${encodeURIComponent(id)}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const res = await apiFetch(`/api/auth/cart/${encodeURIComponent(id)}/`, {
    method: "DELETE",
  });

  // Django answers 204 with no body; parsing it as JSON would throw.
  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
