import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export async function GET() {
  const res = await apiFetch("/api/auth/cart/", { cache: "no-store" });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await apiFetch("/api/auth/cart/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}

/** Empty the cart. Django answers 204 with no body. */
export async function DELETE() {
  const res = await apiFetch("/api/auth/cart/", { method: "DELETE" });

  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
