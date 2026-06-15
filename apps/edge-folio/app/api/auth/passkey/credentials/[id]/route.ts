import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await apiFetch(`/api/auth/passkey/credentials/${id}/`, {
    method: "DELETE",
  });
  return new NextResponse(null, { status: res.status });
}
