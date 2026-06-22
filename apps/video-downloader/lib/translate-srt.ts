import logger from "@/lib/logger";

const log = logger.child({ module: "lib/translate-srt" });

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";

/**
 * How many subtitle blocks to translate per LLM call. Translating the whole
 * SRT in one shot is what caused long videos to come back truncated (the model
 * hits its output-token cap and silently stops, so only the first minute or so
 * was translated). Keeping each request to a bounded number of blocks keeps the
 * output well under any cap and makes per-chunk completeness verifiable.
 */
const CHUNK_SIZE = 40;

/**
 * Upper bound on output tokens per call. Groq counts the `max_tokens`
 * reservation against the per-minute token budget (TPM), so an over-large value
 * alone can exceed a tier limit before a single prompt token is sent: reserving
 * 8000 output tokens on the free-tier 8000-TPM `gpt-oss-120b` left no room for
 * the prompt and got rejected with HTTP 413 ("Request too large"). A 40-block
 * chunk needs well under 2000 output tokens, so 3000 gives ample headroom while
 * keeping the whole request comfortably under the limit.
 */
const MAX_OUTPUT_TOKENS = 3000;

/**
 * Max characters of whole-video transcript context to send per call. The
 * transcript counts against the same TPM budget as everything else, so for long
 * videos it has to be bounded or the request is rejected (HTTP 413). When the
 * full transcript exceeds this budget we send a window of blocks centered on the
 * chunk being translated - the nearest context matters most for consistency.
 * ~8000 chars ≈ 2000 tokens, leaving room for the prompt and output reservation.
 */
const MAX_TRANSCRIPT_CHARS = 8000;

/** Re-attempts for a single chunk that comes back incomplete/malformed. */
const MAX_CHUNK_ATTEMPTS = 3;

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

interface SrtBlock {
  /** Original block number line (kept verbatim - never translated). */
  number: string;
  /** Original timestamp line, e.g. "00:00:02,041 --> 00:00:03,401". */
  timestamp: string;
  /** Text line(s) to translate (may span multiple lines). */
  text: string;
}

/**
 * Tolerant SRT parser: splits on blank lines and locates the timestamp by the
 * "-->" marker, so it survives missing block numbers, CRLF endings, and stray
 * whitespace. Blocks without a timestamp line are skipped.
 */
function parseSrt(srt: string): SrtBlock[] {
  const normalized = srt.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const blocks: SrtBlock[] = [];
  for (const raw of normalized.split(/\n{2,}/)) {
    const lines = raw.split("\n");
    const tsIndex = lines.findIndex((l) => l.includes("-->"));
    if (tsIndex === -1) continue;
    blocks.push({
      number: lines.slice(0, tsIndex).join(" ").trim(),
      timestamp: lines[tsIndex]!.trim(),
      text: lines
        .slice(tsIndex + 1)
        .join("\n")
        .trim(),
    });
  }
  return blocks;
}

/** Serialize blocks back into canonical SRT (number / timestamp / text). */
function serializeBlocks(blocks: SrtBlock[]): string {
  return blocks
    .map((b) => [b.number, b.timestamp, b.text].filter(Boolean).join("\n"))
    .join("\n\n");
}

/**
 * Plain-text transcript used as whole-video context for a chunk. Returns the
 * full transcript when it fits the budget; otherwise grows a window of blocks
 * outward from the focused chunk ([focusStart, focusEnd], 1-based inclusive)
 * until the char budget is reached, so the input stays bounded regardless of
 * video length while keeping the most relevant surrounding context.
 */
function buildTranscript(
  blocks: SrtBlock[],
  focusStart: number,
  focusEnd: number,
): string {
  const lines = blocks.map(
    (b, i) => `${i + 1}. ${b.text.replace(/\s*\n\s*/g, " ")}`,
  );
  const full = lines.join("\n");
  if (full.length <= MAX_TRANSCRIPT_CHARS) return full;

  let lo = focusStart - 1; // 0-based inclusive
  let hi = focusEnd - 1;
  let size = lines.slice(lo, hi + 1).join("\n").length;
  while (size < MAX_TRANSCRIPT_CHARS && (lo > 0 || hi < lines.length - 1)) {
    if (lo > 0) {
      lo--;
      size += lines[lo]!.length + 1;
    }
    if (hi < lines.length - 1 && size < MAX_TRANSCRIPT_CHARS) {
      hi++;
      size += lines[hi]!.length + 1;
    }
  }
  return lines.slice(lo, hi + 1).join("\n");
}

/** Strip an accidental ```srt ... ``` markdown fence from a model reply. */
function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:srt|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function buildSystemPrompt(targetLangName: string): string {
  return `You are a professional subtitle translator. Translate SRT subtitle blocks into ${targetLangName}.

CONTEXT-FIRST APPROACH:
- You are given the FULL transcript of the video first, for context ONLY.
- Read and understand the ENTIRE conversation before translating any block, so that word choices, names, pronouns, gender, formality (tú/usted), running jokes, and continuity stay consistent across the whole video.
- Even though you read the whole conversation, you translate the blocks independently and return them with their exact original timestamps so subtitle timing stays aligned.

STRICT RULES:
- You MUST translate EVERY block you are given. Never skip, drop, omit, merge, summarize, or leave blank a single block. The number of blocks you return MUST be EXACTLY equal to the number you receive.
- Preserve the EXACT SRT format: block numbers, timestamp lines (e.g. "00:00:02,041 --> 00:00:03,401"), and the translated text, each on their correct lines.
- Do NOT alter, add, or remove any timestamps or block numbers - copy them verbatim.
- Do NOT reorder blocks. Return them in the same order you received them.
- Translate ONLY the text lines; leave block numbers and timestamps completely untouched.
- Maintain natural speech patterns, tone, and the speaker's intent.
- When translating to Spanish, use Mexican Spanish vocabulary and expressions, not Spain Spanish.
- Return ONLY the translated SRT blocks - no explanations, no markdown fences, no extra commentary.`;
}

function buildUserPrompt(
  transcript: string,
  chunk: SrtBlock[],
  chunkStart: number,
  total: number,
): string {
  const chunkEnd = chunkStart + chunk.length - 1;
  return `FULL VIDEO TRANSCRIPT (context only - do NOT translate or include this in your reply):
"""
${transcript}
"""

Now translate the following ${chunk.length} subtitle blocks (blocks ${chunkStart}-${chunkEnd} of ${total}). Return all ${chunk.length} blocks, each with its original number and timestamp unchanged:

${serializeBlocks(chunk)}`;
}

interface ChatCompletion {
  error?: unknown;
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

async function callCompletion(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
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
      max_tokens: MAX_OUTPUT_TOKENS,
      seed: Math.floor(Math.random() * 9999) + 1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
}

/**
 * Runs one chat completion through Groq, falling back to OpenRouter on a 429
 * (rate limit) - mirroring the `/api/groq/chat` proxy. Returns the raw content
 * plus the finish_reason so the caller can detect output truncation.
 */
async function complete(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; finishReason?: string; provider: string }> {
  let provider: "groq" | "openrouter" = "groq";
  let upstream = await callCompletion(
    GROQ_API_URL,
    GROQ_API_KEY,
    GROQ_MODEL,
    systemPrompt,
    userPrompt,
  );

  // Groq returns 429 when the per-minute budget is exhausted and 413 ("Request
  // too large") when a single request exceeds the tier's TPM limit; both are
  // token-rate failures recoverable on the larger OpenRouter model.
  if (upstream.status === 429 || upstream.status === 413) {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      throw new Error(
        `Translation rate-limited (${upstream.status}) and OpenRouter not configured`,
      );
    }
    provider = "openrouter";
    log.warn(
      { openrouterModel: OPENROUTER_MODEL, groqStatus: upstream.status },
      "Groq rate limit hit; falling back to OpenRouter for translation",
    );
    upstream = await callCompletion(
      OPENROUTER_API_URL,
      openrouterApiKey,
      OPENROUTER_MODEL,
      systemPrompt,
      userPrompt,
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
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason,
    provider,
  };
}

/**
 * Translates one chunk of blocks and verifies completeness: the reply must
 * parse into exactly the same number of non-empty blocks. The translated text
 * is re-attached to the ORIGINAL numbers/timestamps so timing can never drift,
 * regardless of what the model echoes back. Retries a few times, then throws so
 * the task fails (and refunds) rather than burning an incomplete translation.
 */
async function translateChunk(
  transcript: string,
  chunk: SrtBlock[],
  chunkStart: number,
  total: number,
  langName: string,
): Promise<SrtBlock[]> {
  const systemPrompt = buildSystemPrompt(langName);
  const userPrompt = buildUserPrompt(transcript, chunk, chunkStart, total);

  let lastReason = "";
  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
    const { content, finishReason, provider } = await complete(
      systemPrompt,
      userPrompt,
    );

    if (finishReason === "length") {
      lastReason = "output truncated (finish_reason: length)";
      log.warn(
        { provider, chunkStart, attempt },
        "Translation chunk truncated; retrying",
      );
      continue;
    }

    const out = parseSrt(stripFences(content));

    if (out.length !== chunk.length || out.some((b) => !b.text.trim())) {
      lastReason = `expected ${chunk.length} blocks, got ${out.length}${
        out.some((b) => !b.text.trim()) ? " (some empty)" : ""
      }`;
      log.warn(
        {
          provider,
          chunkStart,
          attempt,
          expected: chunk.length,
          got: out.length,
        },
        "Translation chunk incomplete; retrying",
      );
      continue;
    }

    // Re-attach translated text to original numbers/timestamps so timing is
    // guaranteed identical to the source even if the model altered them.
    return chunk.map((orig, i) => ({
      number: orig.number,
      timestamp: orig.timestamp,
      text: out[i]!.text,
    }));
  }

  throw new Error(
    `Translation incomplete for blocks ${chunkStart}-${
      chunkStart + chunk.length - 1
    } after ${MAX_CHUNK_ATTEMPTS} attempts: ${lastReason}`,
  );
}

/**
 * Translates SRT subtitle content into the given language server-side. The SRT
 * is split into bounded chunks of blocks; each chunk is translated with the
 * FULL transcript supplied as context (so the whole conversation informs every
 * segment) and verified for completeness before being reassembled. This avoids
 * the output-token truncation that left long videos only partially translated,
 * and guarantees no subtitle fragment is dropped.
 *
 * Throws when the upstream errors, a chunk can't be completed, or there is no
 * parseable content - so the caller fails the task (and refunds credits) rather
 * than burning an empty/partial translation.
 */
export async function translateSrt(params: {
  srtContent: string;
  langName: string;
}): Promise<string> {
  const { srtContent, langName } = params;

  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

  const blocks = parseSrt(srtContent);
  if (blocks.length === 0) {
    throw new Error("No parseable SRT blocks to translate");
  }

  const translated: SrtBlock[] = [];

  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    const chunk = blocks.slice(i, i + CHUNK_SIZE);
    const transcript = buildTranscript(blocks, i + 1, i + chunk.length);
    const result = await translateChunk(
      transcript,
      chunk,
      i + 1,
      blocks.length,
      langName,
    );
    translated.push(...result);
  }

  if (translated.length !== blocks.length) {
    // Defensive: should never happen given per-chunk validation above.
    throw new Error(
      `Translation block count mismatch: expected ${blocks.length}, got ${translated.length}`,
    );
  }

  const content = serializeBlocks(translated);
  log.info(
    {
      blocks: blocks.length,
      chunks: Math.ceil(blocks.length / CHUNK_SIZE),
      contentLength: content.length,
    },
    "Subtitle translation completed",
  );
  return content;
}
