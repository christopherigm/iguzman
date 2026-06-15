import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const res = await fetch(
    `${process.env.API_URL}/api/auth/passkey/authenticate/options/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
