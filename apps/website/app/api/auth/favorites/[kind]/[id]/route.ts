import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;

  if (kind !== "product" && kind !== "service" && kind !== "menu_item") {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const res = await apiFetch(
    `/api/auth/favorites/${kind}/${encodeURIComponent(id)}/`,
    { method: "DELETE" },
  );

  // Django answers 204 with no body; parsing it as JSON would throw.
  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
