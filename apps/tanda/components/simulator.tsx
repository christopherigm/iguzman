"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import "./simulator.css";

// ─── Tier Configuration ────────────────────────────────────────────────────────

type TierKey = "real_estate" | "vehicle" | "travel";

interface TierConfig {
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
const TIER_I18N_KEY: Record<TierKey, "realEstate" | "vehicle" | "travel"> = {
  real_estate: "realEstate",
  vehicle: "vehicle",
  travel: "travel",
};

// ─── Vehicle Condition Config ─────────────────────────────────────────────────

const VEHICLE_NEW_DELTA_STEPS = [0.03, 0.035, 0.04, 0.045, 0.05, 0.06];
const VEHICLE_USED_DELTA_STEPS = [-0.1, -0.08, -0.07, -0.06, -0.05];
const VEHICLE_NEW_DEFAULT_DELTA = 0.04;
const VEHICLE_USED_DEFAULT_DELTA = -0.07;

// Traditional-bank APR steps per vehicle condition.
// Defaults sourced from US June 2026 averages: new auto ~7%, used auto ~12%.
const VEHICLE_NEW_BANK_APR_STEPS = [
  0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.14, 0.15,
];
const VEHICLE_USED_BANK_APR_STEPS = [0.08, 0.1, 0.12, 0.14, 0.16];
const VEHICLE_NEW_BANK_APR_DEFAULT = 0.14;
const VEHICLE_USED_BANK_APR_DEFAULT = 0.12;

const TIERS: Record<TierKey, TierConfig> = {
  real_estate: {
    icon: "🏠",
    monthSteps: [60, 72, 84, 96, 108, 120, 240, 360],
    deltaSteps: [0.04, 0.045, 0.05, 0.055, 0.06],
    defaultMonths: 120,
    defaultDelta: 0.05,
    downpaymentPct: 0.15,
    defaultPrice: 2500000,
    currency: "USD",
    mitigationKind: "success",
    // US June 2026 avg 30-yr mortgage APR ~6.5%.
    bankAprSteps: [0.05, 0.0575, 0.065, 0.0725, 0.08, 0.1, 0.12, 0.13, 0.14],
    bankAprDefault: 0.12,
  },
  vehicle: {
    icon: "🚗",
    monthSteps: [6, 12, 18, 24, 30, 36, 48, 72, 84, 96],
    deltaSteps: VEHICLE_NEW_DELTA_STEPS,
    defaultMonths: 48,
    defaultDelta: VEHICLE_NEW_DEFAULT_DELTA,
    downpaymentPct: 0.2,
    defaultPrice: 350000,
    currency: "USD",
    mitigationKind: "warning",
    requiresInsurance: true,
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
};

// ─── Math Engine ───────────────────────────────────────────────────────────────

/**
 * B. Fixed Monthly Payment (Delta Adjusted)
 *
 *   P = [G × (1 + δ × T/2) - (G × d)] / M          (T = M/12)
 *
 * The changing asset price is delta-averaged over the term and, net of the
 * downpayment, spread evenly across the M months to lock in a fixed monthly
 * contribution. This matches the classic ROSCA where the group size equals the
 * term (N = M): one member is funded each month.
 */
function calcMonthlyPayment(G: number, M: number, delta: number, d: number) {
  const T = M / 12;
  return (G * (1 + delta * (T / 2)) - G * d) / M;
}

/**
 * A. Dynamic Price Adjustment (Delta Curve)
 * G_m = G × (1 + δ)^(m/12)
 */
function calcAssetPriceAtMonth(G: number, delta: number, m: number) {
  return G * Math.pow(1 + delta, m / 12);
}

/**
 * C. Escrow Release Threshold (Tier 3)
 * Finds the first month m where: ΣP_k + (G × d) ≥ G_m × c
 */
function findEscrowUnlockMonth(
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

interface SimResult {
  P: number;
  N: number;
  downpayment: number;
  G_final: number;
  totalPaid: number;
  /** Months between consecutive payouts (M / N). One payout per month at N = M. */
  cadenceMonths: number;
}

function simulate(
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

interface BankResult {
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
 *     when quoted "sin IVA", excludes the 16% VAT on interest — so amortizing the
 *     principal at the CAT approximates the borrower's total outflow.
 *
 *   P = L × r / (1 − (1 + r)^−M)
 */
function simulateBank(
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

// ─── Formatters ────────────────────────────────────────────────────────────────

const CURRENCY_LOCALE: Record<TierConfig["currency"], string> = {
  USD: "en-US",
  MXN: "es-MX",
};

/** Builds whole-unit and 2-decimal currency formatters for a tier currency. */
function makeFormatters(currency: TierConfig["currency"]) {
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function ExplainBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label="Learn more"
      className="simulator__explain-btn"
    >
      ?
    </Button>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  shaded,
  onExplain,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  shaded?: boolean;
  onExplain?: () => void;
}) {
  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      padding="12px 20px"
      backgroundColor={shaded ? "var(--surface-2)" : "var(--surface-1)"}
    >
      <Box display="flex" alignItems="center" gap={6}>
        <Typography>{label}</Typography>
        {onExplain && <ExplainBtn onClick={onExplain} />}
      </Box>
      <Typography
        fontWeight={highlight ? 700 : 500}
        color={highlight ? "var(--accent, #06b6d4)" : "var(--foreground)"}
        styles={{ fontSize: highlight ? 20 : undefined }}
        textAlign="right"
        minWidth={130}
      >
        {value}
      </Typography>
    </Box>
  );
}

const MITIGATION_BG: Record<TierConfig["mitigationKind"], string> = {
  success: "color-mix(in srgb, var(--success, #16a34a) 12%, transparent)",
  warning: "color-mix(in srgb, var(--warning, #d97706) 12%, transparent)",
  info: "color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)",
};

const MITIGATION_ICON: Record<TierConfig["mitigationKind"], string> = {
  success: "🔒",
  warning: "⚠️",
  info: "🔐",
};

// ─── Main Component ────────────────────────────────────────────────────────────

export function Simulator() {
  const t = useTranslations("SimulatorPage");
  const [tier, setTier] = useState<TierKey>("real_estate");
  const cfg = TIERS[tier];

  const { whole: fmtWhole, cents: fmtCents } = useMemo(
    () => makeFormatters(cfg.currency),
    [cfg.currency],
  );

  const [priceStr, setPriceStr] = useState<string>(String(cfg.defaultPrice));
  const [months, setMonths] = useState<number>(cfg.defaultMonths);
  const [delta, setDelta] = useState<number>(cfg.defaultDelta);
  const [bankApr, setBankApr] = useState<number>(cfg.bankAprDefault);
  const [vehicleCondition, setVehicleCondition] = useState<"new" | "used">(
    "new",
  );
  const [explainModal, setExplainModal] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const openExplain = (titleKey: string, textKey: string) =>
    setExplainModal({
      title: t(titleKey as Parameters<typeof t>[0]),
      text: t(textKey as Parameters<typeof t>[0]),
    });

  const G = useMemo(
    () => parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0,
    [priceStr],
  );

  const result = useMemo(
    () => simulate(G, months, delta, cfg.downpaymentPct),
    [G, months, delta, cfg.downpaymentPct],
  );

  const rateKind = cfg.rateKind ?? "apr";

  const bankResult = useMemo(
    () => simulateBank(G, months, bankApr, cfg.downpaymentPct, rateKind),
    [G, months, bankApr, cfg.downpaymentPct, rateKind],
  );

  // Savings: total cost via bank minus total cost via TandaOmni.
  const savings =
    result && bankResult ? bankResult.totalPaid - result.totalPaid : null;

  // How many times the borrowed amount the lender is repaid (payments / principal).
  const repayMultiple =
    bankResult && bankResult.principal > 0
      ? (bankResult.P * months) / bankResult.principal
      : null;

  // i18n keys for the lender rate differ by convention (nominal APR vs Mexican CAT).
  const isCat = rateKind === "cat";
  const rateLabelKey = isCat ? "catLabel" : "bankAprLabel";
  const rateValueKey = isCat ? "catValue" : "bankAprValue";
  const rateExplainTitleKey = isCat
    ? "explain.catTitle"
    : "explain.bankAprTitle";
  const rateExplainTextKey = isCat ? "explain.catText" : "explain.bankAprText";

  const escrowUnlockMonth = useMemo(() => {
    if (!cfg.escrowThreshold || G <= 0) return null;
    return findEscrowUnlockMonth(
      G,
      months,
      delta,
      cfg.downpaymentPct,
      cfg.escrowThreshold,
    );
  }, [G, months, delta, cfg]);

  const monthSliderSteps: SliderStep[] = cfg.monthSteps.map((m) => ({
    value: m,
    label: m >= 12 && m % 12 === 0 ? `${m / 12}y` : `${m}m`,
  }));

  const effectiveDeltaSteps =
    tier === "vehicle"
      ? vehicleCondition === "new"
        ? VEHICLE_NEW_DELTA_STEPS
        : VEHICLE_USED_DELTA_STEPS
      : cfg.deltaSteps;

  const deltaSliderSteps: SliderStep[] = effectiveDeltaSteps.map((d) => ({
    value: d,
    label: `${(d * 100).toFixed(1)}%`,
  }));

  const effectiveBankAprSteps =
    tier === "vehicle"
      ? vehicleCondition === "new"
        ? VEHICLE_NEW_BANK_APR_STEPS
        : VEHICLE_USED_BANK_APR_STEPS
      : cfg.bankAprSteps;

  const bankAprSliderSteps: SliderStep[] = effectiveBankAprSteps.map((a) => ({
    value: a,
    label: `${(a * 100).toFixed(1)}%`,
  }));

  const handleVehicleConditionSwitch = (condition: "new" | "used") => {
    setVehicleCondition(condition);
    setDelta(
      condition === "new"
        ? VEHICLE_NEW_DEFAULT_DELTA
        : VEHICLE_USED_DEFAULT_DELTA,
    );
    setBankApr(
      condition === "new"
        ? VEHICLE_NEW_BANK_APR_DEFAULT
        : VEHICLE_USED_BANK_APR_DEFAULT,
    );
  };

  const handleTierSwitch = (next: TierKey) => {
    const nextCfg = TIERS[next];
    setTier(next);
    setMonths(nextCfg.defaultMonths);
    if (next === "vehicle") {
      setVehicleCondition("new");
      setDelta(VEHICLE_NEW_DEFAULT_DELTA);
      setBankApr(VEHICLE_NEW_BANK_APR_DEFAULT);
    } else {
      setDelta(nextCfg.defaultDelta);
      setBankApr(nextCfg.bankAprDefault);
    }
    setPriceStr(String(nextCfg.defaultPrice));
  };

  const T = months / 12;
  const escrowPct = escrowUnlockMonth
    ? Math.round((escrowUnlockMonth / months) * 100)
    : null;

  // Human-readable payout cadence driven by group size (N).
  const cadenceLabel = (() => {
    if (!result) return "";
    const c = result.cadenceMonths; // months between payouts (M / N)
    if (c >= 1) {
      const rounded = Math.round(c * 10) / 10;
      if (rounded <= 1) return t("payoutCadenceMonthly");
      const value = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(1);
      return t("payoutCadenceEvery", { months: value });
    }
    // N > M: more than one member is funded per month.
    const perMonth = Math.max(1, Math.round(1 / c));
    return t("payoutCadencePerMonth", { count: perMonth });
  })();

  return (
    <Box display="flex" flexDirection="column" gap={24} width="100%">
      {/* Header */}
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h1" fontWeight={700} color="var(--foreground)">
          {t("heading")}
        </Typography>
        <Typography color="var(--muted-foreground, #6b7280)">
          {t("subtitle")}
        </Typography>
      </Box>

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}

      {/* Tier Tabs */}
      <Box display="flex" gap={8} styles={{ flexWrap: "wrap" }}>
        {(Object.keys(TIERS) as TierKey[]).map((tierKey) => (
          <Button
            key={tierKey}
            text={`${TIERS[tierKey].icon}  ${t(`tiers.${TIER_I18N_KEY[tierKey]}.label`)}`}
            kind={tier === tierKey ? "primary" : undefined}
            size="md"
            onClick={() => handleTierSwitch(tierKey)}
          />
        ))}
      </Box>

      {/* Vehicle New / Used Toggle */}
      {tier === "vehicle" && (
        <Box
          display="flex"
          alignItems="center"
          gap={12}
          styles={{ flexWrap: "wrap" }}
        >
          <Typography fontWeight={600}>{t("vehicleConditionLabel")}</Typography>
          <Box display="flex" gap={8}>
            <Button
              text={t("vehicleCondition.new")}
              kind={vehicleCondition === "new" ? "primary" : undefined}
              size="md"
              onClick={() => handleVehicleConditionSwitch("new")}
            />
            <Button
              text={t("vehicleCondition.used")}
              kind={vehicleCondition === "used" ? "primary" : undefined}
              size="md"
              onClick={() => handleVehicleConditionSwitch("used")}
            />
          </Box>
        </Box>
      )}

      {/* Input Card */}
      <Card gap={20} padding={20}>
        {/* Target Asset Price */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: "none" }}
            >
              {t("priceLabelG")}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain(
                  "explain.priceLabelGTitle",
                  "explain.priceLabelGText",
                )
              }
            />
          </Box>
          <TextInput value={priceStr} onChange={setPriceStr} type="text" />
        </Box>

        {/* Term Slider */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: "none" }}
            >
              {t("termLabel", { months, years: T.toFixed(1) })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain("explain.termTitle", "explain.termText")
              }
            />
          </Box>
          <Slider
            steps={monthSliderSteps}
            value={months}
            onChange={(v) => setMonths(Number(v))}
          />
        </Box>

        {/* Delta Slider */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: "none" }}
            >
              {t("deltaLabel", { pct: (Number(delta) * 100).toFixed(1) })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain("explain.deltaTitle", "explain.deltaText")
              }
            />
          </Box>
          <Slider
            steps={deltaSliderSteps}
            value={delta}
            onChange={(v) => setDelta(Number(v))}
          />
        </Box>

        {/* Lender rate slider (nominal APR, or CAT for the travel tier) */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: "none" }}
            >
              {t(rateLabelKey as Parameters<typeof t>[0], {
                pct: (Number(bankApr) * 100).toFixed(2),
              })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain(rateExplainTitleKey, rateExplainTextKey)
              }
            />
          </Box>
          <Slider
            steps={bankAprSliderSteps}
            value={bankApr}
            onChange={(v) => setBankApr(Number(v))}
          />
        </Box>

        {/* Downpayment row */}
        <Box
          display="flex"
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          padding="10px 14px"
          borderRadius={6}
          backgroundColor="var(--surface-2)"
        >
          <Box display="flex" alignItems="center">
            <Typography color="var(--muted-foreground, #6b7280)">
              {t("downpaymentLabel")}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain(
                  "explain.downpaymentTitle",
                  "explain.downpaymentText",
                )
              }
            />
          </Box>
          <Typography fontWeight={600} minWidth={120} textAlign="right">
            {(cfg.downpaymentPct * 100).toFixed(0)}%
            {G > 0 ? `  ·  ${fmtWhole.format(G * cfg.downpaymentPct)}` : ""}
          </Typography>
        </Box>
      </Card>

      {/* Comparison */}
      {result && bankResult && G > 0 ? (
        <Box display="flex" flexDirection="column" gap={20}>
          <Typography
            as="h2"
            fontWeight={700}
            color="var(--foreground)"
            styles={{ textTransform: "uppercase", letterSpacing: 1 }}
          >
            {t("comparisonHeading")}
          </Typography>

          {/* Savings banner */}
          {savings !== null && savings > 0 && (
            <Card
              padding="16px 20px"
              backgroundColor="color-mix(in srgb, var(--success, #16a34a) 14%, transparent)"
              styles={{ border: "1px solid var(--success, #16a34a)" }}
            >
              <Box
                display="flex"
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                gap={12}
                styles={{ flexWrap: "wrap" }}
              >
                <Box display="flex" flexDirection="column" gap={2}>
                  <Typography fontWeight={700} color="var(--foreground)">
                    💸 {t("savingsHeading")}
                  </Typography>
                  <Typography color="var(--muted-foreground, #6b7280)">
                    {t("savingsNote")}
                  </Typography>
                </Box>
                <Typography
                  fontWeight={700}
                  color="var(--success, #16a34a)"
                  styles={{ fontSize: 26 }}
                >
                  {t("savingsAmount", { amount: fmtWhole.format(savings) })}
                </Typography>
              </Box>
            </Card>
          )}

          {/* Side-by-side panels */}
          <Box className="simulator__compare-grid">
            {/* ── TandaOmni panel ───────────────────────────────── */}
            <Card padding={0} styles={{ overflow: "hidden" }}>
              <Box padding="12px 20px" backgroundColor="var(--accent, #06b6d4)">
                <Typography
                  fontWeight={700}
                  color="var(--accent-foreground, #fff)"
                  styles={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  {t("tandaColumnHeading")}
                </Typography>
              </Box>

              <ResultRow
                label={t("monthlyPayment")}
                value={fmtCents.format(result.P)}
                highlight
                onExplain={() =>
                  openExplain(
                    "explain.monthlyPaymentTitle",
                    "explain.monthlyPaymentText",
                  )
                }
              />
              <ResultRow
                label={t("downpaymentRequired")}
                value={fmtWhole.format(result.downpayment)}
                shaded
                onExplain={() =>
                  openExplain(
                    "explain.downpaymentRequiredTitle",
                    "explain.downpaymentRequiredText",
                  )
                }
              />
              <ResultRow
                label={t("interestCharged")}
                value={t("zeroInterest")}
              />
              <ResultRow
                label={t("groupSize")}
                value={t("groupSizeValue", { n: result.N })}
                shaded
                onExplain={() =>
                  openExplain("explain.groupSizeTitle", "explain.groupSizeText")
                }
              />
              <ResultRow
                label={t("payoutCadence")}
                value={cadenceLabel}
                onExplain={() =>
                  openExplain(
                    "explain.payoutCadenceTitle",
                    "explain.payoutCadenceText",
                  )
                }
              />
              <ResultRow
                label={t("assetPriceAtEnd", { years: T.toFixed(1) })}
                value={fmtWhole.format(result.G_final)}
                shaded
                onExplain={() =>
                  openExplain(
                    "explain.assetPriceAtEndTitle",
                    "explain.assetPriceAtEndText",
                  )
                }
              />
              <ResultRow
                label={t("totalContributed")}
                value={fmtWhole.format(result.totalPaid)}
                highlight
                onExplain={() =>
                  openExplain(
                    "explain.totalContributedTitle",
                    "explain.totalContributedText",
                  )
                }
              />

              {/* Escrow progress bar (Tier 3 only) */}
              {cfg.escrowThreshold &&
                escrowUnlockMonth &&
                escrowPct !== null && (
                  <Box
                    display="flex"
                    flexDirection="column"
                    gap={8}
                    padding="16px 20px"
                    styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
                  >
                    <Box
                      display="flex"
                      flexDirection="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box display="flex" alignItems="center" gap={6}>
                        <Typography fontWeight={600}>
                          {t("escrowHeading")}
                        </Typography>
                        <ExplainBtn
                          onClick={() =>
                            openExplain(
                              "explain.escrowTitle",
                              "explain.escrowText",
                            )
                          }
                        />
                      </Box>
                      <Typography color="var(--muted-foreground, #6b7280)">
                        {t("escrowUnlocks", {
                          month: escrowUnlockMonth,
                          total: months,
                        })}
                      </Typography>
                    </Box>
                    <ProgressBar
                      value={escrowPct}
                      size={8}
                      label={t("escrowHeading")}
                    />
                    <Typography color="var(--muted-foreground, #6b7280)">
                      {t("escrowNote")}
                    </Typography>
                  </Box>
                )}

              {/* Mitigation notice */}
              <Box
                padding="12px 20px"
                backgroundColor={MITIGATION_BG[cfg.mitigationKind]}
                styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
              >
                <Typography color="var(--foreground)">
                  {MITIGATION_ICON[cfg.mitigationKind]}{" "}
                  {t(`tiers.${TIER_I18N_KEY[tier]}.mitigation`)}
                </Typography>
              </Box>
            </Card>

            {/* ── Traditional Bank panel ────────────────────────── */}
            <Card padding={0} styles={{ overflow: "hidden" }}>
              <Box
                padding="12px 20px"
                backgroundColor="var(--muted-foreground, #6b7280)"
              >
                <Typography
                  fontWeight={700}
                  color="#ffffff"
                  styles={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  {t(
                    (cfg.comparisonHeadingKey ??
                      "bankColumnHeading") as Parameters<typeof t>[0],
                  )}
                </Typography>
              </Box>

              <ResultRow
                label={t("monthlyPayment")}
                value={fmtCents.format(bankResult.P)}
                highlight
                onExplain={() =>
                  openExplain(
                    "explain.monthlyPaymentTitle",
                    "explain.monthlyPaymentText",
                  )
                }
              />
              <ResultRow
                label={t("downpaymentRequired")}
                value={fmtWhole.format(bankResult.downpayment)}
                shaded
                onExplain={() =>
                  openExplain(
                    "explain.downpaymentRequiredTitle",
                    "explain.downpaymentRequiredText",
                  )
                }
              />
              <ResultRow
                label={t("interestCharged")}
                value={t(rateValueKey as Parameters<typeof t>[0], {
                  pct: (bankResult.apr * 100).toFixed(2),
                })}
                onExplain={() =>
                  openExplain(rateExplainTitleKey, rateExplainTextKey)
                }
              />
              <ResultRow
                label={t("bankFinancedAmount")}
                value={fmtWhole.format(bankResult.principal)}
                shaded
                onExplain={() =>
                  openExplain(
                    "explain.bankFinancedTitle",
                    "explain.bankFinancedText",
                  )
                }
              />
              <ResultRow
                label={t("bankTotalInterest")}
                value={fmtWhole.format(bankResult.totalInterest)}
                onExplain={() =>
                  openExplain(
                    "explain.bankTotalInterestTitle",
                    "explain.bankTotalInterestText",
                  )
                }
              />
              <ResultRow
                label={t("bankTotalCost")}
                value={fmtWhole.format(bankResult.totalPaid)}
                highlight
                shaded
                onExplain={() =>
                  openExplain(
                    "explain.bankTotalCostTitle",
                    "explain.bankTotalCostText",
                  )
                }
              />
              {cfg.showRepayMultiple && repayMultiple !== null && (
                <ResultRow
                  label={t("repayMultiple")}
                  value={t("repayMultipleValue", {
                    multiple: repayMultiple.toFixed(1),
                  })}
                  highlight
                />
              )}

              {/* Lender interest notice */}
              <Box
                padding="12px 20px"
                backgroundColor="color-mix(in srgb, var(--warning, #d97706) 12%, transparent)"
                styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
              >
                <Typography color="var(--foreground)">
                  🏦{" "}
                  {t(
                    (cfg.comparisonNoticeKey ??
                      "bankInterestNotice") as Parameters<typeof t>[0],
                  )}
                </Typography>
              </Box>
            </Card>
          </Box>
        </Box>
      ) : (
        <Card
          padding={32}
          alignItems="center"
          justifyContent="center"
          styles={{ textAlign: "center" }}
        >
          <Typography color="var(--muted-foreground, #6b7280)">
            {t("emptyState")}
          </Typography>
        </Card>
      )}
    </Box>
  );
}
