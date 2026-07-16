import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

/**
 * Streams an LLM completion from website-api back to the browser.
 *
 * All provider logic (Groq first, OpenRouter as fallback) and the API keys live in
 * Django - this handler only attaches the caller's bearer token via `apiFetch` and
 * pipes the SSE body straight through, so the stream is not buffered here.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const res = await apiFetch("/api/ai/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await req.text(),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { detail: detail || "The AI service is unavailable." },
      { status: res.ok ? 502 : res.status },
    );
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
