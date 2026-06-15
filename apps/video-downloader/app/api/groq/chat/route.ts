import { NextRequest } from "next/server";
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from "@/lib/credits-middleware";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/groq/chat" });

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const CREDITS_PER_TRANSLATION = 1;

export async function POST(req: NextRequest) {
  const key = getCreditsKey(req);
  if (!key) return creditsErrorResponse("NO_CREDITS_KEY");

  const result = await requireCredits(key, CREDITS_PER_TRANSLATION);
  if (!result.ok) return creditsErrorResponse(result.error);

  if (!GROQ_API_KEY) {
    log.error("GROQ_API_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await req.text();

  const upstream = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    },
  );

  if (!upstream.ok) {
    const text = await upstream.text();
    log.warn(
      { status: upstream.status, detail: text },
      "Groq upstream returned error",
    );
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  log.info(
    { status: upstream.status, remaining: result.remaining },
    "Groq request proxied",
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      "x-credits-remaining": String(result.remaining),
    },
  });
}
