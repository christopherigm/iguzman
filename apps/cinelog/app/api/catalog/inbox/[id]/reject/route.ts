import { type NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await apiFetch(`/api/catalog/inbox/${id}/reject/`, {
    method: "POST",
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
