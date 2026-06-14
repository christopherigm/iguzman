import { addCredits, deductCredits, getCreditKey } from '@/lib/credits-db';

export type CreditsError =
  | 'NO_CREDITS_KEY'
  | 'INVALID_CREDITS_KEY'
  | 'INSUFFICIENT_CREDITS';

export interface CreditsResult {
  ok: true;
  remaining: number;
}

export interface CreditsFailure {
  ok: false;
  error: CreditsError;
}

export function getCreditsKey(request: Request): string | null {
  const header = request.headers.get('x-credits-key');
  if (!header?.trim()) return null;
  return header.trim();
}

export async function requireCredits(
  key: string,
  amount: number,
): Promise<CreditsResult | CreditsFailure> {
  const doc = await getCreditKey(key);
  if (!doc) return { ok: false, error: 'INVALID_CREDITS_KEY' };
  if (doc.credits < amount) return { ok: false, error: 'INSUFFICIENT_CREDITS' };

  const remaining = await deductCredits(key, amount);
  if (remaining === null) {
    // Concurrent request may have consumed the credits between check and deduct
    return { ok: false, error: 'INSUFFICIENT_CREDITS' };
  }

  return { ok: true, remaining };
}

/**
 * Refund `amount` credits to a key after an operation that was charged
 * up-front fails (transient download/processing/diarization errors, timeouts).
 * Best-effort: a failed refund is logged by the caller but never throws.
 */
export async function refundCredits(key: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await addCredits(key, amount);
}

export async function getBalance(key: string): Promise<number | null> {
  const doc = await getCreditKey(key);
  return doc?.credits ?? null;
}

export function creditsErrorResponse(error: CreditsError): Response {
  const status = error === 'NO_CREDITS_KEY' ? 401 : 402;
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
