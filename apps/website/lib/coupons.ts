import { unstable_rethrow } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { getTenantHost } from "@/lib/resolve-site";
import type { PublicCoupon } from "@/lib/coupon-shared";
import logger from "@/lib/logger";

/**
 * The offer behind a scanned coupon QR, for the `/coupon/<code>` landing.
 *
 * `allowAnonymous` plus `X-Website-Host`, exactly like `getOrder`: the whole
 * point of a poster is that the person scanning it has never visited the site,
 * so there is no token and no profile to take the tenant from - Django falls
 * back to the host, the same resolution the public catalog uses.
 *
 * ⚠ **Not `cache()`d and never `next: { revalidate }`.** `valid` folds in
 * whether the coupon is exhausted, which moves on every checkout, so a cached
 * "still available" outliving the final redemption sends a customer to the cart
 * for an offer that has gone. Same reasoning that keeps `getOrder` uncached
 * while `getOrders` is cached.
 *
 * Returns null for an unknown code, which the page turns into a 404.
 */
export async function getCoupon(code: string): Promise<PublicCoupon | null> {
  try {
    const host = await getTenantHost();
    const res = await apiFetch(
      `/api/coupons/${encodeURIComponent(code)}/`,
      {
        cache: "no-store",
        allowAnonymous: true,
        headers: { "X-Website-Host": host },
      },
    );
    if (!res.ok) {
      if (res.status !== 404) {
        logger.warn(
          { status: res.status, code },
          "Coupon API returned non-OK status",
        );
      }
      return null;
    }
    return (await res.json()) as PublicCoupon;
  } catch (err) {
    unstable_rethrow(err);
    logger.error({ err, code }, "Failed to fetch coupon");
    return null;
  }
}
