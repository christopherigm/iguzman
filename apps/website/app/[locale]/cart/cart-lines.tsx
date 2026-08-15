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
 * The signed-in customer's cart lines.
 *
 * Owns the writes `CartLine` calls back into: a row addressed by its own id, and
 * a `router.refresh()` afterwards to re-run the server components that hold the
 * real numbers (the summary and the navbar count). The guest half of this lives
 * in `guest-cart-view.tsx`; the row itself is the same component either way.
 */
export function CartLines({ lines, locale }: CartLinesProps) {
  const router = useRouter();

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
      {lines.map((line) => (
        <CartLine
          key={line.id}
          line={line}
          locale={locale}
          onQuantityChange={(quantity) =>
            write(line.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ quantity }),
            })
          }
          onRemove={() => write(line.id, { method: "DELETE" })}
        />
      ))}
    </Box>
  );
}
