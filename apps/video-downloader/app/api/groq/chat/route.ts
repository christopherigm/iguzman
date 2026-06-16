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

/**
 * Consumes a tee'd copy of the upstream SSE stream purely for observability.
 *
 * The upstream (Groq or OpenRouter) frequently returns HTTP 200 while embedding
 * an error object inside the stream, or finishes with no content at all (e.g.
 * the model spent its whole budget reasoning → `finish_reason: "length"`).
 * Those failures are invisible to the proxy unless we read the body, so this
 * runs in the background and emits the exact reason to the logs (k8s).
 *
 * It never throws into the request path and never touches the client's copy of
 * the stream.
 */
async function inspectStreamForLogging(
  stream: ReadableStream<Uint8Array>,
  ctx: Record<string, unknown>,
): Promise<void> {
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finishReason: string | null = null;
    let streamError: string | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip blanks, the [DONE] sentinel, and SSE comment keep-alives
        // (OpenRouter emits ": OPENROUTER PROCESSING").
        if (!trimmed || trimmed === "data: [DONE]" || trimmed.startsWith(":"))
          continue;
        const jsonStr = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed;
        let json: {
          error?: unknown;
          choices?: {
            delta?: { content?: string };
            message?: { content?: string };
            finish_reason?: string;
          }[];
        };
        try {
          json = JSON.parse(jsonStr);
        } catch {
          continue;
        }
        if (json.error != null) {
          streamError =
            typeof json.error === "string"
              ? json.error
              : ((json.error as { message?: string }).message ??
                JSON.stringify(json.error));
          continue;
        }
        const choice = json.choices?.[0];
        const token =
          choice?.delta?.content ?? choice?.message?.content ?? "";
        if (token) content += token;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    }

    if (streamError) {
      log.error(
        { ...ctx, streamError, finishReason, contentLength: content.length },
        "LLM stream returned an embedded error (HTTP 200)",
      );
    } else if (!content) {
      log.warn(
        { ...ctx, finishReason, contentLength: 0 },
        "LLM stream produced no content (HTTP 200)",
      );
    } else {
      log.info(
        { ...ctx, finishReason, contentLength: content.length },
        "LLM stream completed",
      );
    }
  } catch (err) {
    log.warn(
      { ...ctx, err: err instanceof Error ? err.message : String(err) },
      "Failed to inspect LLM stream",
    );
  }
}

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
  let provider: "groq" | "openrouter" = "groq";

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
    provider = "openrouter";
    log.warn(
      { openrouterModel: OPENROUTER_MODEL },
      "Groq rate limit hit; falling back to OpenRouter",
    );

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
      { provider, status: upstream.status, detail: text },
      "Upstream returned error",
    );
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  log.info(
    { provider, status: upstream.status, remaining: result.remaining },
    "LLM request proxied",
  );

  // Tee the body so we can stream one copy to the client and read the other in
  // the background to log the real outcome (embedded error / empty / finish
  // reason). Without this, a 200 that carries an in-stream failure is silent.
  if (upstream.body) {
    const [clientStream, logStream] = upstream.body.tee();
    void inspectStreamForLogging(logStream, {
      provider,
      remaining: result.remaining,
    });
    return new Response(clientStream, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "x-credits-remaining": String(result.remaining),
      },
    });
  }

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
