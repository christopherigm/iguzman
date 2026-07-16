/**
 * Price display helpers, shared by every surface that prints a catalog price -
 * the cards, the detail pages and the cart.
 *
 * Prices arrive from the API as strings (DRF renders DecimalField that way, so
 * no value is ever rounded in transit); these are the two places that turn one
 * into something a person reads.
 */

/** A price string plus its ISO currency, rendered in the visitor's locale. */
export function formatPrice(amount: string, currency: string): string {
  const num = parseFloat(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    // An unknown/invalid currency code makes Intl throw rather than degrade.
    return `${currency} ${num.toFixed(2)}`;
  }
}

/** Whole-percent discount, or 0 when the compare price is not actually higher. */
export function discountPercent(price: string, comparePrice: string): number {
  const p = parseFloat(price);
  const cp = parseFloat(comparePrice);
  if (cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}
