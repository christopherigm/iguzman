import { NextRequest } from "next/server";
import {
  getCreditsKey,
  requireCredits,
  creditsErrorResponse,
} from "@/lib/credits-middleware";
import logger from "@/lib/logger";

const log = logger.child({ module: "api/groq/chat" });

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";
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

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Groq API";
    log.warn({ err: message }, "Groq request failed");
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (upstream.status === 429) {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      log.warn("Groq rate limit hit and OPENROUTER_API_KEY not configured");
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    log.warn("Groq rate limit hit; falling back to OpenRouter");

    let openrouterBody = body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      openrouterBody = JSON.stringify({ ...parsed, model: OPENROUTER_MODEL });
    } catch {
      // body is not valid JSON; forward as-is to OpenRouter
    }

    try {
      upstream = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: openrouterBody,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach OpenRouter";
      log.warn({ err: message }, "OpenRouter fallback failed");
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    log.warn(
      { status: upstream.status, detail: text },
      "Upstream returned error",
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
