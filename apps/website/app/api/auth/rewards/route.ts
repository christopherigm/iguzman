import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The signed-in customer's points balance, tier and statement.
 *
 * A thin `apiFetch` pass-through like every other handler here - the browser
 * never holds a token, and `apiFetch` is what refreshes an expired one and
 * retries rather than surfacing a 401 as a logout.
 *
 * ⚠ `no-store`, and Django does not cache this either: a balance moves on every
 * checkout and is the number a customer is about to make a purchasing decision
 * on. A cached "you have 1200 points" that turns into a refusal at checkout is
 * the one wrong answer here.
 */
export async function GET() {
  const res = await apiFetch("/api/rewards/", { cache: "no-store" });
  const data: unknown = await res.json();
  return NextResponse.json(data, { status: res.status });
}
