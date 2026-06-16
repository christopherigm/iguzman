import logger from "@/lib/logger";

const log = logger.child({ module: "lib/translate-srt" });

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";

/** Number of credits a single subtitle translation costs. */
export const TRANSLATION_CREDITS = 1;

/**
 * djb2 hash of the source SRT. Used (with the target language) to key the
 * cached translation on the task document so a reload, re-dispatch, or
 * retry-after-failure reuses the existing translation instead of re-running
 * (and re-charging) the LLM call.
 */
export function srtCacheKey(srtContent: string, langName: string): string {
  let hash = 5381;
  for (let i = 0; i < srtContent.length; i++) {
    hash = (hash * 33) ^ srtContent.charCodeAt(i);
  }
  return `${langName}:${(hash >>> 0).toString(36)}:${srtContent.length}`;
}

function buildTranslationPrompt(targetLangName: string): string {
  return `You are a professional subtitle translator. Translate the SRT subtitle content into ${targetLangName}.

STRICT RULES:
- Preserve the EXACT SRT format: block numbers, timestamp lines (e.g. "00:00:02,041 --> 00:00:03,401"), and text lines must remain in their correct positions
- Do NOT alter, add, or remove any timestamps
- Do NOT reorder, merge, or split subtitle blocks
- Translate ONLY the text lines; leave block numbers and timestamps completely untouched
- Maintain natural speech patterns, tone, and the speaker's intent
- When translating to Spanish, use Mexican Spanish vocabulary and expressions, not Spain Spanish
- Return ONLY the translated SRT content - no explanations, no markdown fences, no extra commentary`;
}

interface ChatCompletion {
  error?: unknown;
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

async function callCompletion(
  url: string,
  apiKey: string,
  model: string,
  srtContent: string,
  langName: string,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      seed: Math.floor(Math.random() * 9999) + 1,
      messages: [
        { role: "system", content: buildTranslationPrompt(langName) },
        { role: "user", content: srtContent },
      ],
    }),
  });
}

/**
 * Translates SRT subtitle content into the given language server-side, calling
 * Groq and falling back to OpenRouter on a 429 (rate limit) - mirroring the
 * `/api/groq/chat` proxy. Non-streaming: returns the full translated SRT.
 *
 * Throws when the upstream errors or returns no content so the caller can
 * fail the task (and refund credits) rather than burning an empty translation.
 */
export async function translateSrt(params: {
  srtContent: string;
  langName: string;
}): Promise<string> {
  const { srtContent, langName } = params;

  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

  let provider: "groq" | "openrouter" = "groq";
  let upstream = await callCompletion(
    GROQ_API_URL,
    GROQ_API_KEY,
    GROQ_MODEL,
    srtContent,
    langName,
  );

  if (upstream.status === 429) {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      throw new Error("Translation rate-limited and OpenRouter not configured");
    }
    provider = "openrouter";
    log.warn(
      { openrouterModel: OPENROUTER_MODEL },
      "Groq rate limit hit; falling back to OpenRouter for translation",
    );
    upstream = await callCompletion(
      OPENROUTER_API_URL,
      openrouterApiKey,
      OPENROUTER_MODEL,
      srtContent,
      langName,
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    log.warn(
      { provider, status: upstream.status, detail },
      "Translation upstream returned error",
    );
    throw new Error(`Translation provider error (${upstream.status})`);
  }

  const json = (await upstream.json()) as ChatCompletion;
  if (json.error != null) {
    const detail =
      typeof json.error === "string"
        ? json.error
        : ((json.error as { message?: string }).message ??
          JSON.stringify(json.error));
    throw new Error(`Translation provider error: ${detail}`);
  }

  const choice = json.choices?.[0];
  const content = choice?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error(
      `Translation returned no content${
        choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ""
      }`,
    );
  }

  log.info(
    { provider, contentLength: content.length },
    "Subtitle translation completed",
  );
  return content;
}
