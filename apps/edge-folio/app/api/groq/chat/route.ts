import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshAccessToken } from "@/lib/api-fetch";

export const dynamic = "force-dynamic";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.API_URL}/api/auth/token/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface GroqProxyBody {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  temperature?: number;
  seed?: number;
  [key: string]: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 },
    );
  }

  let valid = await verifyToken(token);
  if (!valid) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return NextResponse.json(
        { detail: "Invalid or expired token." },
        { status: 401 },
      );
    }
    valid = true;
  }

  const parsed = (await req.json()) as GroqProxyBody;

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    return NextResponse.json(
      { detail: "Groq API key not configured." },
      { status: 500 },
    );
  }

  let groqRes: globalThis.Response;
  try {
    groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(parsed),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Groq API";
    return NextResponse.json({ detail: message }, { status: 502 });
  }

  let upstream = groqRes;

  if (groqRes.status === 429) {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      return NextResponse.json(
        {
          detail:
            "Groq rate limit reached and OpenRouter API key not configured.",
        },
        { status: 429 },
      );
    }
    console.warn("[groq/chat] Groq rate limit hit; falling back to OpenRouter");
    const openrouterBody = { ...parsed, model: OPENROUTER_MODEL };
    try {
      upstream = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterApiKey}`,
        },
        body: JSON.stringify(openrouterBody),
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to reach OpenRouter fallback";
      return NextResponse.json({ detail: message }, { status: 502 });
    }
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const responseHeaders = new Headers();
  const STRIP_HEADERS = new Set([
    "transfer-encoding",
    "content-encoding",
    "content-length",
  ]);
  upstream.headers.forEach((value, key) => {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
