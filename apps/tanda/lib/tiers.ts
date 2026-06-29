// ─── Tier Configuration ────────────────────────────────────────────────────────
//
// Static, data-only configuration for the three financing tiers (real estate,
// vehicle, travel) plus the per-tier currency formatters and mitigation-notice
// styling. Kept separate from the Simulator UI so the numbers/copy can be tuned
// without touching component logic.

export type TierKey = "real_estate" | "vehicle" | "travel" | "small_purchases";

export interface TierConfig {
  icon: string;
  monthSteps: number[];
  deltaSteps: number[];
  defaultMonths: number;
  defaultDelta: number;
  downpaymentPct: number;
  defaultPrice: number;
  /** ISO currency code the amounts in this tier are denominated in. */
  currency: "USD" | "MXN";
  mitigationKind: "success" | "warning" | "info";
  escrowThreshold?: number;
  requiresInsurance?: boolean;
  /**
   * How the rate-slider values are interpreted: "apr" = US-style nominal annual
   * rate (÷12); "cat" = Mexico's effective Costo Anual Total. Defaults to "apr".
   */
  rateKind?: "apr" | "cat";
  /** Lender rate slider steps (annual rate, interpreted per rateKind). */
  bankAprSteps: number[];
  /** Default selected lender rate for this tier. */
  bankAprDefault: number;
  /** i18n key for the comparison column heading. Defaults to "bankColumnHeading". */
  comparisonHeadingKey?: string;
  /** i18n key for the comparison notice. Defaults to "bankInterestNotice". */
  comparisonNoticeKey?: string;
  /** Show the "X× the loan" total-repayment-multiple row in the comparison panel. */
  showRepayMultiple?: boolean;
}

/** Maps TierKey → next-intl nested key for tier translations. */
export const TIER_I18N_KEY: Record<
  TierKey,
  "realEstate" | "vehicle" | "travel" | "smallPurchases"
> = {
  real_estate: "realEstate",
  vehicle: "vehicle",
  travel: "travel",
  small_purchases: "smallPurchases",
};

// ─── Vehicle Condition Config ─────────────────────────────────────────────────

export const VEHICLE_NEW_DELTA_STEPS = [0.03, 0.035, 0.04, 0.045, 0.05, 0.06];
export const VEHICLE_USED_DELTA_STEPS = [-0.1, -0.08, -0.07, -0.06, -0.05];
export const VEHICLE_NEW_DEFAULT_DELTA = 0.035;
export const VEHICLE_USED_DEFAULT_DELTA = -0.07;

// Mexican auto-loan CAT steps per vehicle condition (effective annual cost, sin IVA).
// Sourced from June 2026 published CATs: new-car CATs run ~16–29% (BBVA, Banorte
// "CAT promedio" 22.4%, Santander up to 20.49%, HSBC Inmediauto 29.0%); used/seminuevo
// runs a few points higher. Defaults sit at the high end (HSBC-tier) per spec.
export const VEHICLE_NEW_BANK_APR_STEPS = [
  0.14, 0.16, 0.18, 0.2, 0.224, 0.25, 0.29, 0.32,
];
export const VEHICLE_USED_BANK_APR_STEPS = [0.2, 0.224, 0.25, 0.29, 0.32, 0.36];
export const VEHICLE_NEW_BANK_APR_DEFAULT = 0.29;
export const VEHICLE_USED_BANK_APR_DEFAULT = 0.32;

// CETES (Mexican government treasury bills) annual yield steps for the treasury
// simulation. Default 6.5% matches the PRD's r = 0.065.
export const CETES_STEPS = [0.05, 0.06, 0.065, 0.07, 0.08, 0.09, 0.1, 0.11];
export const CETES_DEFAULT = 0.065;

export const TIERS: Record<TierKey, TierConfig> = {
  real_estate: {
    icon: "🏠",
    // Mexican mortgages amortize up to 30 years (BBVA/Banorte headline term).
    monthSteps: [60, 84, 108, 120, 180, 240, 360],
    deltaSteps: [0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06],
    defaultMonths: 240,
    defaultDelta: 0.035,
    downpaymentPct: 0.15,
    // Denominated in MXN: the realistic alternative is a Mexican bank mortgage.
    defaultPrice: 2000000,
    currency: "MXN",
    mitigationKind: "success",
    // Mexican bank mortgages are advertised as a CAT (effective annual cost, sin IVA),
    // not a nominal APR. Steps are real June 2026 published CATs for a good credit
    // profile: Inbursa 12.10%, BBVA 12.80%, Banorte 13.10%, Scotiabank 13.20%,
    // Santander 13.50%, HSBC 13.90%. Default sits at the high end (HSBC) per spec.
    rateKind: "cat",
    bankAprSteps: [0.121, 0.128, 0.131, 0.132, 0.135, 0.139, 0.14],
    bankAprDefault: 0.139,
  },
  vehicle: {
    icon: "🚗",
    // Mexican auto loans cap at 72 months (BBVA/Banorte/Santander).
    monthSteps: [12, 24, 36, 48, 60, 72],
    deltaSteps: VEHICLE_NEW_DELTA_STEPS,
    defaultMonths: 48,
    defaultDelta: VEHICLE_NEW_DEFAULT_DELTA,
    downpaymentPct: 0.2,
    // Denominated in MXN: the realistic alternative is a Mexican bank auto loan.
    defaultPrice: 250000,
    currency: "MXN",
    mitigationKind: "warning",
    requiresInsurance: true,
    // Mexican auto loans are advertised as a CAT (effective annual cost, sin IVA),
    // not a nominal APR. See the per-condition CAT steps above.
    rateKind: "cat",
    bankAprSteps: VEHICLE_NEW_BANK_APR_STEPS,
    bankAprDefault: VEHICLE_NEW_BANK_APR_DEFAULT,
  },
  travel: {
    icon: "✈️",
    // Mexican consumer lenders typically amortize over multi-year terms.
    monthSteps: [6, 12, 24, 36, 48, 72],
    deltaSteps: [0.02, 0.025, 0.03, 0.035, 0.04, 0.05, 0.06],
    defaultMonths: 24,
    defaultDelta: 0.03,
    downpaymentPct: 0.1,
    // Denominated in MXN: the realistic alternative is a Mexican consumer loan.
    defaultPrice: 50000,
    currency: "MXN",
    mitigationKind: "info",
    escrowThreshold: 0.6,
    // Travel here is financed via a Mexican consumer/payday lender, not a bank,
    // so the rate is a CAT (effective annual cost), not a nominal APR. Steps are
    // real published CATs: Kubo 55–78.1%, Provident 388.20%, CrediLikeMe 456%.
    // The default (Provident's 388.20%) compounds steeply over the multi-year
    // terms Mexican consumer lenders typically offer.
    rateKind: "cat",
    bankAprSteps: [0.55, 0.781, 1.5, 2.5, 3.882, 4.56],
    bankAprDefault: 1.5,
    comparisonHeadingKey: "consumerLenderColumnHeading",
    comparisonNoticeKey: "consumerLenderNotice",
    showRepayMultiple: true,
  },
  small_purchases: {
    icon: "📱",
    // Small consumer goods (phones, cameras, appliances): short terms only,
    // from 3 months up to 2 years.
    monthSteps: [3, 6, 9, 12, 18, 24],
    // Same appreciation (δ) band as the travel tier per spec.
    deltaSteps: [0.02, 0.025, 0.03, 0.035, 0.04, 0.05, 0.06],
    defaultMonths: 12,
    defaultDelta: 0.03,
    downpaymentPct: 0.1,
    // Denominated in MXN: the realistic alternative is store credit / a Mexican
    // consumer lender, like the travel tier.
    defaultPrice: 15000,
    currency: "MXN",
    mitigationKind: "warning",
    // Same CAT band as the travel tier per spec: financed via store credit or a
    // Mexican consumer/payday lender, advertised as a CAT (not a nominal APR).
    rateKind: "cat",
    bankAprSteps: [0.55, 0.781, 1.5, 2.5, 3.882, 4.56],
    bankAprDefault: 2.5,
    comparisonHeadingKey: "consumerLenderColumnHeading",
    comparisonNoticeKey: "consumerLenderNotice",
    showRepayMultiple: true,
  },
};

// ─── Formatters ────────────────────────────────────────────────────────────────

const CURRENCY_LOCALE: Record<TierConfig["currency"], string> = {
  USD: "en-US",
  MXN: "es-MX",
};

/** Builds whole-unit and 2-decimal currency formatters for a tier currency. */
export function makeFormatters(currency: TierConfig["currency"]) {
  const locale = CURRENCY_LOCALE[currency];
  return {
    whole: new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }),
    cents: new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  };
}

// ─── Mitigation notice styling ──────────────────────────────────────────────────

export const MITIGATION_BG: Record<TierConfig["mitigationKind"], string> = {
  success: "color-mix(in srgb, var(--success, #16a34a) 12%, transparent)",
  warning: "color-mix(in srgb, var(--warning, #d97706) 12%, transparent)",
  info: "color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)",
};

export const MITIGATION_ICON: Record<TierConfig["mitigationKind"], string> = {
  success: "🔒",
  warning: "⚠️",
  info: "🔐",
};
