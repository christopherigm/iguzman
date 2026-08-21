/**
 * The signed-in customer's points balance, tier and statement.
 *
 * The reasoning here is `lib/cart.ts`'s and the two must stay in step: it reads
 * through `apiFetch`, is safe to call from a server component because
 * `createAuthProxy` has already refreshed an expired access token earlier in the
 * same request, and degrades to the "off" shape rather than a 500 when the API
 * is unreachable.
 *
 * ⚠ **Not `cache()`d, and not cached in Django either.** A balance moves on
 * every checkout and every redemption, and it is the number a customer is about
 * to make a purchasing decision on - the same exception `getOrder` carries while
 * `getOrders` is cached. A stale "you have 1200 points" that turns into a
 * refusal at checkout is the one wrong answer here.
 *
 * The catch must call `unstable_rethrow` first: Next signals "this route read
 * cookies, so it cannot be prerendered" by *throwing*, and swallowing that bakes
 * an empty balance into a static page forever.
 */
import { unstable_rethrow } from "next/navigation";
import { getSession } from "@repo/auth/session";
import { apiFetch } from "./api-fetch";
import logger from "./logger";

/** One rung of the tenant's ladder. */
export interface RewardTier {
  id: number;
  name: string;
  en_name: string;
  /**
   * Points that must have been **earned** inside `period_months` to reach *and
   * keep* this rung. One number for both, deliberately: a separate "maintain"
   * figure could only disagree with the "reach" one.
   */
  threshold: number;
  period_months: number;
  /** Whole percent applied to what a purchase earns. 100 means no change. */
  earn_multiplier: number;
  /** Blank falls back to the tenant's accent. */
  color: string;
  enabled: boolean;
}

/** One line of the customer's points statement. */
export interface PointsTransaction {
  id: number;
  kind: "earn" | "spend" | "release" | "revoke" | "adjust";
  /** **Signed** - an earn is positive, a spend negative. */
  points: number;
  note: string;
  /** The order's public handle, or null for a movement with no order behind it. */
  order_id: string | null;
  created_at: string;
}

export interface RewardsSummary {
  /** The tenant's global switch. False means render nothing at all. */
  enabled: boolean;
  balance: number;
  /** The rung the customer holds, or null on a tenant with no ladder. */
  tier: RewardTier | null;
  /** The rung above it, or null when they are at the top. */
  next_tier: RewardTier | null;
  tiers: RewardTier[];
  transactions: PointsTransaction[];
}

const OFF: RewardsSummary = {
  enabled: false,
  balance: 0,
  tier: null,
  next_tier: null,
  tiers: [],
  transactions: [],
};

export async function getRewards(): Promise<RewardsSummary> {
  if ((await getSession()) === null) return OFF;

  try {
    const res = await apiFetch("/api/rewards/", { cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 401) {
        logger.warn({ status: res.status }, "Rewards API returned non-OK status");
      }
      return OFF;
    }
    return (await res.json()) as RewardsSummary;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err }, "Failed to fetch rewards");
    return OFF;
  }
}

/**
 * The tier's name for this locale, on the rule every other tenant-authored label
 * on this site follows: English reads `en_name` and falls back to the primary
 * copy, every other locale reads the primary copy and falls back to English - so
 * a tenant who fills one language is named everywhere rather than on half the
 * site.
 */
export function tierName(tier: RewardTier, locale: string): string {
  return (
    (locale === "en" ? tier.en_name || tier.name : tier.name || tier.en_name) ||
    ""
  );
}
