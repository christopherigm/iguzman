"use client";

import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import type { CartItem } from "@/lib/cart";
import { CartLine } from "./cart-line";

interface CartLinesProps {
  lines: CartItem[];
  locale: string;
}

/**
 * Oldest line first, so a freshly added item lands at the **end** of the list.
 *
 * The API sends the cart newest-first (`CartItem.Meta.ordering = ['-created_at']`),
 * which is right for a ledger and wrong for a basket: an add would push everything
 * the customer already chose down the page. A guest's cart is appended to in
 * `localStorage` and is therefore already in this order, so sorting here is also
 * what keeps the two carts reading the same way.
 *
 * `id` breaks the tie: two lines added in the same request (or by a clock with a
 * coarse resolution) share a `created_at`, and `Array.prototype.sort` is only
 * stable with respect to an input order that is itself arbitrary here.
 */
function oldestFirst(lines: CartItem[]): CartItem[] {
  return [...lines].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id,
  );
}

/**
 * The signed-in customer's cart lines.
 *
 * Owns the writes `CartLine` calls back into: a row addressed by its own id, and
 * a `router.refresh()` afterwards to re-run the server components that hold the
 * real numbers (the summary and the navbar count). The guest half of this lives
 * in `guest-cart-view.tsx`; the row itself is the same component either way.
 */
export function CartLines({ lines, locale }: CartLinesProps) {
  const router = useRouter();
  const ordered = oldestFirst(lines);

  const write = async (id: number, init: RequestInit): Promise<boolean> => {
    try {
      const res = await fetch(`/api/auth/cart/${id}`, init);
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Box flexDirection="column" gap={12}>
      {ordered.map((line) => (
        <CartLine
          key={line.id}
          line={line}
          locale={locale}
          isLoggedIn
          onQuantityChange={(quantity) =>
            write(line.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ quantity }),
            })
          }
          onRemove={() => write(line.id, { method: "DELETE" })}
          // The same endpoint as the quantity write, deliberately: it applies
          // only the fields it is sent, so re-configuring the dish leaves the
          // quantity alone and vice versa. The API re-resolves both against what
          // the dish actually offers, and folds the line into an identical one
          // already in the cart if this edit created one.
          onEditSelection={(selection) =>
            write(line.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(selection),
            })
          }
        />
      ))}
    </Box>
  );
}
