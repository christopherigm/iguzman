import { apiFetch } from "@/lib/api-fetch";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// Persist manual edits to the AI-tailored resume content (professional summary,
// tailored bullets / work experiences / projects) back to Django.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.text();
  const res = await apiFetch(`/api/applications/${id}/tailored/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : { detail: "Service unavailable" };
  return NextResponse.json(data, { status: res.status });
}
