import { apiFetch } from "@/lib/api-fetch";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const res = await apiFetch("/api/auth/resume/", {
    method: "POST",
    body: formData as BodyInit,
  });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
