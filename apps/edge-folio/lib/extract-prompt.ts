import type { ChatMessage } from './edge-worker-types';

const SYSTEM = `You are a privacy-preserving technical achievement extractor for software engineers.

Analyze the provided code sample and output ONLY a JSON object — no prose, no markdown fences.

Rules:
- INCLUDE: languages, frameworks, libraries, architectural patterns, data structures, performance characteristics, problem domains solved
- EXCLUDE: variable names, function names, class names, proprietary business logic, algorithm implementations, company/product names, customer data

Output format (JSON only):
{
  "bullets": [
    {
      "text": "<achievement in STAR format, max 150 chars, active voice>",
      "category": "technical" | "impact" | "leadership" | "collaboration" | "other",
      "skills": ["<Technology>"]
    }
  ]
}

Generate 3–8 bullet points based on evidence in the code. If nothing extractable is found, return {"bullets":[]}.`;

export interface ExtractedBullet {
  text: string;
  category: 'technical' | 'impact' | 'leadership' | 'collaboration' | 'other';
  skills: string[];
}

export function buildExtractionMessages(codeText: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Code sample:\n\n${codeText}` },
  ];
}

function tryParse(text: string): ExtractedBullet[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).bullets)
    ) {
      return null;
    }
    return ((parsed as Record<string, unknown>).bullets as unknown[])
      .filter(
        (b): b is { text: string; category: string; skills?: unknown[] } =>
          typeof b === 'object' &&
          b !== null &&
          typeof (b as Record<string, unknown>).text === 'string' &&
          typeof (b as Record<string, unknown>).category === 'string',
      )
      .map((b) => ({
        text: b.text,
        category: b.category as ExtractedBullet['category'],
        skills: Array.isArray(b.skills)
          ? (b.skills as unknown[]).filter((s): s is string => typeof s === 'string')
          : [],
      }));
  } catch {
    return null;
  }
}

export function parseExtractionOutput(raw: string): ExtractedBullet[] {
  const direct = tryParse(raw.trim());
  if (direct !== null) return direct;

  // Strip markdown fences or leading/trailing text and try again
  const match = raw.match(/\{[\s\S]*"bullets"[\s\S]*\}/);
  if (match) {
    const fromBlock = tryParse(match[0]);
    if (fromBlock !== null) return fromBlock;
  }

  return [];
}
