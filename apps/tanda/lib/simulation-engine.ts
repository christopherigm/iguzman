// ─── Math Engine ───────────────────────────────────────────────────────────────
//
// Pure, framework-free simulation math shared by the Simulator UI and the PDF
// export. Nothing in here touches React or next-intl - it only takes numbers and
// returns numbers (or plain result objects), so it can be unit-tested in
// isolation and reused anywhere.

/**
 * B. Fixed Monthly Payment (Delta Adjusted)
 *
 *   P = [Ḡ − (G × d)] / M     where  Ḡ = (1/M) · Σ_{m=1..M} G × (1 + δ)^(m/12)
 *
 * Ḡ is the *true compound average* of the asset price across the term, using the
 * same curve the payouts follow (G_m = G × (1+δ)^(m/12)). Net of the downpayment
 * it is spread evenly across the M months to lock in a fixed monthly contribution.
 * This matches the classic ROSCA where the group size equals the term (N = M):
 * one member is funded each month.
 *
 * Pricing off the compound average (rather than the linear δ·T/2 midpoint
 * approximation) makes the contributions collect exactly the appreciating value
 * of the payouts, so the uninvested treasury pool breaks even at term end instead
 * of ending in a small deficit.
 */
export function calcMonthlyPayment(
  G: number,
  M: number,
  delta: number,
  d: number,
) {
  let priceSum = 0;
  for (let m = 1; m <= M; m++) {
    priceSum += G * Math.pow(1 + delta, m / 12);
  }
  const avgAssetPrice = priceSum / M;
  return (avgAssetPrice - G * d) / M;
}

/**
 * A. Dynamic Price Adjustment (Delta Curve)
 * G_m = G × (1 + δ)^(m/12)
 */
export function calcAssetPriceAtMonth(G: number, delta: number, m: number) {
  return G * Math.pow(1 + delta, m / 12);
}

/**
 * Year-spaced month indices for charting: one point per year, plus the final
 * month if it isn't a year boundary. Short terms (≤ 12 months) sample monthly so
 * the curve isn't a single segment. Shared by every projection chart.
 */
export function sampleChartMonths(M: number): number[] {
  const out: number[] = [];
  if (M <= 12) {
    for (let m = 0; m <= M; m++) out.push(m);
  } else {
    for (let m = 0; m <= M; m += 12) out.push(m);
    if (out[out.length - 1] !== M) out.push(M);
  }
  return out;
}

/** X-axis label for a month index: `Ny` on year boundaries, else `Nm`. */
export function monthLabel(m: number): string {
  return m % 12 === 0 ? `${m / 12}y` : `${m}m`;
}

/**
 * C. Escrow Release Threshold (Tier 3)
 * Finds the first month m where: ΣP_k + (G × d) ≥ G_m × c
 */
export function findEscrowUnlockMonth(
  G: number,
  M: number,
  delta: number,
  d: number,
  threshold: number,
): number {
  const P = calcMonthlyPayment(G, M, delta, d);
  const downpayment = G * d;
  for (let m = 1; m <= M; m++) {
    const G_m = calcAssetPriceAtMonth(G, delta, m);
    if (P * m + downpayment >= G_m * threshold) return m;
  }
  return M;
}

export interface SimResult {
  P: number;
  N: number;
  downpayment: number;
  G_final: number;
  totalPaid: number;
  /** Months between consecutive payouts (M / N). One payout per month at N = M. */
  cadenceMonths: number;
}

export function simulate(
  G: number,
  M: number,
  delta: number,
  d: number,
): SimResult | null {
  if (G <= 0 || M <= 0) return null;
  const P = calcMonthlyPayment(G, M, delta, d);
  const downpayment = G * d;
  const G_final = calcAssetPriceAtMonth(G, delta, M);
  const totalPaid = P * M + downpayment;
  // Classic ROSCA: the group size equals the term, so one member is funded each
  // month and payouts run monthly.
  const N = M;
  const cadenceMonths = M / N;
  return { P, N, downpayment, G_final, totalPaid, cadenceMonths };
}

export interface BankResult {
  P: number;
  downpayment: number;
  principal: number;
  totalInterest: number;
  totalPaid: number;
  apr: number;
}

/**
 * Lender financing (standard amortized loan).
 * The asset is purchased today at price G; the lender finances (G − downpayment)
 * and charges the given annual rate over the same term.
 *
 * Two rate conventions are supported:
 *   - "apr": a US-style nominal annual rate compounded monthly → r = rate / 12.
 *   - "cat": Mexico's Costo Anual Total, an *effective* annual rate (an IRR), so
 *     the equivalent monthly rate is the 12th root: r = (1 + rate)^(1/12) − 1.
 *     Note CAT is an all-in figure (interest + fees + mandatory insurance) and,
 *     when quoted "sin IVA", excludes the 16% VAT on interest - so amortizing the
 *     principal at the CAT approximates the borrower's total outflow.
 *
 *   P = L × r / (1 − (1 + r)^−M)
 */
export function simulateBank(
  G: number,
  M: number,
  rate: number,
  d: number,
  rateKind: "apr" | "cat",
): BankResult | null {
  if (G <= 0 || M <= 0) return null;
  const downpayment = G * d;
  const principal = G - downpayment;
  const r = rateKind === "cat" ? Math.pow(1 + rate, 1 / 12) - 1 : rate / 12;
  const P = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -M)) : principal / M;
  const totalPaid = P * M + downpayment;
  const totalInterest = P * M - principal;
  return { P, downpayment, principal, totalInterest, totalPaid, apr: rate };
}

/** Yearly-sampled projection series for the cumulative-amount-paid line chart. */
export interface ChartData {
  labels: string[];
  tandaCumulative: number[];
  bankCumulative: number[];
  assetPrice: number[];
}

/** Yearly-sampled treasury-pool balances (CETES-invested vs uninvested). */
export interface TreasuryData {
  labels: string[];
  withYield: number[];
  noYield: number[];
  pool: number;
  monthlyInflow: number;
}
