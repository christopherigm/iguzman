"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Chart } from "@repo/ui/core-elements/chart";
import {
  AiAnalysis,
  type AnalysisContext,
  type AnalysisSource,
} from "./ai-analysis";
import { ExplainBtn, ResultRow } from "./simulator-fields";
import { ProjectionChart, TreasuryChart } from "./simulator-charts";
import {
  type TierKey,
  TIERS,
  TIER_I18N_KEY,
  makeFormatters,
  MITIGATION_BG,
  MITIGATION_ICON,
  VEHICLE_NEW_DELTA_STEPS,
  VEHICLE_USED_DELTA_STEPS,
  VEHICLE_NEW_DEFAULT_DELTA,
  VEHICLE_USED_DEFAULT_DELTA,
  VEHICLE_NEW_BANK_APR_STEPS,
  VEHICLE_USED_BANK_APR_STEPS,
  VEHICLE_NEW_BANK_APR_DEFAULT,
  VEHICLE_USED_BANK_APR_DEFAULT,
  CETES_STEPS,
  CETES_DEFAULT,
} from "../lib/tiers";
import {
  simulate,
  simulateBank,
  calcAssetPriceAtMonth,
  sampleChartMonths,
  monthLabel,
  findEscrowUnlockMonth,
} from "../lib/simulation-engine";
import {
  buildSimulationPdfData,
  downloadSimulationPdf,
  type Translate,
} from "../lib/simulation-pdf";
import "./simulator.css";

// Append each slice's share of the total to its legend label (e.g.
// "Downpayment · 32%"), mirroring the percentage shown beside each slice in the
// exported PDF (see lib/simulation-pdf.tsx → PieColumn). Labels and data are
// passed together so the percentage always matches the plotted value.
function withPiePercents(labels: string[], data: number[]): string[] {
  const total = data.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return labels;
  return labels.map(
    (label, i) => `${label} · ${Math.round(((data[i] ?? 0) / total) * 100)}%`,
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function Simulator() {
  const t = useTranslations("SimulatorPage");
  const locale = useLocale();
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
  const [cetesRate, setCetesRate] = useState<number>(CETES_DEFAULT);
  const [vehicleCondition, setVehicleCondition] = useState<"new" | "used">(
    "new",
  );
  const [explainModal, setExplainModal] = useState<{
    title: string;
    text: string;
  } | null>(null);
  // Latest AI analysis text, surfaced by the AiAnalysis panel so it can be
  // embedded in the exported PDF. Null until the user runs an analysis.
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  // Web sources the AiAnalysis panel consulted, embedded in the exported PDF.
  const [analysisSources, setAnalysisSources] = useState<AnalysisSource[]>([]);
  // Search queries the AiAnalysis enrichment ran, listed alongside the sources
  // in the exported PDF so the research path is traceable.
  const [analysisQueries, setAnalysisQueries] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

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

  // Yearly-sampled projection series for the line charts. Both monthly payments
  // are fixed, so the payment charts plot the *running total paid* (downpayment +
  // P × month), which curves; the price chart plots the delta-driven asset price.
  const chartData = useMemo(() => {
    if (!result || !bankResult || G <= 0) return null;
    const sample = sampleChartMonths(months);
    return {
      labels: sample.map(monthLabel),
      tandaCumulative: sample.map((m) => result.downpayment + result.P * m),
      bankCumulative: sample.map(
        (m) => bankResult.downpayment + bankResult.P * m,
      ),
      assetPrice: sample.map((m) => calcAssetPriceAtMonth(G, delta, m)),
    };
  }, [result, bankResult, G, months, delta]);

  // Treasury liquidity pool over the term (PRD formula D). On day one the group
  // collects every member's downpayment (N × downpayment). Each month it adds the
  // N × P contributions, earns CETES yield on the running balance, and funds one
  // member's asset (G_m). The "uninvested" series sets the yield to zero so the
  // gap between the two lines is the value of investing the idle pool. Insurance
  // premiums (I_m) are omitted - the PRD gives no premium figure to model them.
  const treasuryData = useMemo(() => {
    if (!result || G <= 0) return null;
    const M = months;
    const N = result.N;
    const inflow = N * result.P; // monthly contributions from the whole group
    const monthlyYield = cetesRate / 12;
    const pool = N * result.downpayment; // day-one balance B_0
    const withYield: number[] = [pool];
    const noYield: number[] = [pool];
    let by = pool;
    let ny = pool;
    for (let m = 1; m <= M; m++) {
      const payout = calcAssetPriceAtMonth(G, delta, m);
      by = by + inflow + by * monthlyYield - payout;
      ny = ny + inflow - payout;
      withYield.push(by);
      noYield.push(ny);
    }
    const sample = sampleChartMonths(M);
    return {
      labels: sample.map(monthLabel),
      withYield: sample.map((m) => withYield[m]!),
      noYield: sample.map((m) => noYield[m]!),
      pool,
      monthlyInflow: inflow,
    };
  }, [result, G, months, delta, cetesRate]);

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

  const cetesSliderSteps: SliderStep[] = CETES_STEPS.map((r) => ({
    value: r,
    label: `${(r * 100).toFixed(1)}%`,
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

  // Serialize the current simulation into the labelled summary the analysis model
  // reasons over. Returns null until the simulation is ready. Called by the
  // AiAnalysis panel each time the user runs an analysis so it reflects exactly
  // what the user is looking at.
  const buildAnalysisContext = (): AnalysisContext | null => {
    if (!result || !bankResult || G <= 0) return null;

    const assetTypeLabel = t(`tiers.${TIER_I18N_KEY[tier]}.label`);
    const rateConvention =
      rateKind === "cat" ? "CAT (effective annual)" : "APR";
    const lines = [
      `Asset type: ${assetTypeLabel}${
        tier === "vehicle" ? ` (${vehicleCondition})` : ""
      }`,
      `Currency: ${cfg.currency}`,
      `Target price (G): ${fmtWhole.format(G)}`,
      `Term: ${months} months (${T.toFixed(1)} years)`,
      `Annual price appreciation (δ): ${(delta * 100).toFixed(1)}%`,
      `Downpayment: ${(cfg.downpaymentPct * 100).toFixed(
        0,
      )}% = ${fmtWhole.format(result.downpayment)}`,
      "",
      "TandaOmni (interest-free savings circle):",
      `- Monthly payment: ${fmtCents.format(result.P)}`,
      `- Group size: ${result.N} members`,
      `- Payout cadence: ${cadenceLabel}`,
      `- Asset price at end of term: ${fmtWhole.format(result.G_final)}`,
      `- Total contributed: ${fmtWhole.format(result.totalPaid)}`,
      `- Interest charged: 0`,
      "",
      `Traditional lender (${rateConvention}):`,
      `- Lender rate: ${(bankResult.apr * 100).toFixed(2)}%`,
      `- Monthly payment: ${fmtCents.format(bankResult.P)}`,
      `- Amount financed: ${fmtWhole.format(bankResult.principal)}`,
      `- Total interest: ${fmtWhole.format(bankResult.totalInterest)}`,
      `- Total cost: ${fmtWhole.format(bankResult.totalPaid)}`,
    ];
    if (repayMultiple !== null) {
      lines.push(
        `- Total repaid as a multiple of the loan: ${repayMultiple.toFixed(1)}×`,
      );
    }
    if (savings !== null) {
      lines.push(
        "",
        `Savings vs lender (lender total − TandaOmni total): ${fmtWhole.format(
          savings,
        )}`,
      );
    }
    // Note: the CETES treasury yield is deliberately excluded from the analysis
    // context. It drives the platform's treasury pool, not the user's decision of
    // TandaOmni vs. a loan, so it should not influence the AI recommendation.
    if (escrowUnlockMonth !== null) {
      lines.push(
        "",
        `Escrow unlocks at month ${escrowUnlockMonth} of ${months}.`,
      );
    }

    return { summary: lines.join("\n"), assetTypeLabel, tier };
  };

  const handleExportPdf = async () => {
    const data = buildSimulationPdfData({
      t: t as Translate,
      locale,
      tier,
      cfg,
      vehicleCondition,
      G,
      months,
      delta,
      cetesRate,
      result,
      bankResult,
      escrowUnlockMonth,
      cadenceLabel,
      repayMultiple,
      savings,
      chartData,
      treasuryData,
      analysisText,
      analysisSources,
      analysisQueries,
      fmtWhole,
      fmtCents,
    });
    if (!data) return;
    setExporting(true);
    setExportError(false);
    try {
      await downloadSimulationPdf(
        data,
        t(`tiers.${TIER_I18N_KEY[tier]}.label`),
      );
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

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
          <TextInput
            value={priceStr}
            onChange={setPriceStr}
            type="text"
            format="currency"
          />
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

        {/* CETES Treasury yield slider (drives the treasury pool simulation) */}
        <Box display="flex" flexDirection="column" gap={6}>
          <Box display="flex" alignItems="center" gap={6}>
            <Typography
              as="label"
              fontWeight={600}
              color="var(--foreground, #1a1a1a)"
              styles={{ userSelect: "none" }}
            >
              {t("cetesLabel", { pct: (cetesRate * 100).toFixed(1) })}
            </Typography>
            <ExplainBtn
              onClick={() =>
                openExplain("explain.cetesTitle", "explain.cetesText")
              }
            />
          </Box>
          <Slider
            steps={cetesSliderSteps}
            value={cetesRate}
            onChange={(v) => setCetesRate(Number(v))}
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

              {/* Cost breakdown pie: downpayment + monthly payments sum to the
                  total contributed (zero interest, so no third slice). */}
              <Box
                display="flex"
                flexDirection="column"
                gap={8}
                padding="16px 20px"
                styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
              >
                <Typography fontWeight={600}>
                  {t("pieBreakdownHeading")}
                </Typography>
                <Chart
                  type="pie"
                  labels={withPiePercents(
                    [t("pieDownpayment"), t("pieMonthlyPayments")],
                    [result.downpayment, result.P * months],
                  )}
                  series={[
                    {
                      label: t("totalContributed"),
                      data: [result.downpayment, result.P * months],
                    },
                  ]}
                  height={240}
                  ariaLabel={t("tandaColumnHeading")}
                />
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("pieShareNote")}
                </Typography>
              </Box>

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

              {/* Cost breakdown pie: downpayment + amount financed + total
                  interest sum exactly to the total cost. */}
              <Box
                display="flex"
                flexDirection="column"
                gap={8}
                padding="16px 20px"
                styles={{ borderTop: "1px solid var(--border, #e5e7eb)" }}
              >
                <Typography fontWeight={600}>
                  {t("pieBreakdownHeading")}
                </Typography>
                <Chart
                  type="pie"
                  labels={withPiePercents(
                    [
                      t("pieDownpayment"),
                      t("bankFinancedAmount"),
                      t("bankTotalInterest"),
                    ],
                    [
                      bankResult.downpayment,
                      bankResult.principal,
                      bankResult.totalInterest,
                    ],
                  )}
                  series={[
                    {
                      label: t("bankTotalCost"),
                      data: [
                        bankResult.downpayment,
                        bankResult.principal,
                        bankResult.totalInterest,
                      ],
                    },
                  ]}
                  height={240}
                  ariaLabel={t(
                    (cfg.comparisonHeadingKey ??
                      "bankColumnHeading") as Parameters<typeof t>[0],
                  )}
                />
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t("pieShareNote")}
                </Typography>
              </Box>

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

          {/* ── AI Analysis ───────────────────────────────────── */}
          <AiAnalysis
            buildContext={buildAnalysisContext}
            onAnalysisChange={setAnalysisText}
            onSourcesChange={setAnalysisSources}
            onQueriesChange={setAnalysisQueries}
          />

          {/* ── Projection chart ──────────────────────────────── */}
          {chartData && (
            <ProjectionChart
              t={t as Translate}
              chartData={chartData}
              tandaMonthly={result.P}
              lenderMonthly={bankResult.P}
              delta={delta}
              fmtCents={fmtCents}
              lenderHeadingKey={cfg.comparisonHeadingKey ?? "bankColumnHeading"}
            />
          )}

          {/* ── Treasury liquidity pool chart ─────────────────── */}
          {treasuryData && (
            <TreasuryChart
              t={t as Translate}
              treasuryData={treasuryData}
              cetesRate={cetesRate}
              fmtWhole={fmtWhole}
            />
          )}

          {/* ── Export to PDF ─────────────────────────────────── */}
          <Card gap={12} padding={20}>
            <Box display="flex" flexDirection="column" gap={2}>
              <Typography fontWeight={700} color="var(--foreground)">
                {t("pdf.cardHeading")}
              </Typography>
              <Typography color="var(--muted-foreground, #6b7280)">
                {t("pdf.cardDescription")}
              </Typography>
            </Box>
            <Box justifyContent="center">
              <Button
                text={exporting ? t("pdf.exporting") : t("pdf.exportButton")}
                kind="primary"
                size="md"
                onClick={handleExportPdf}
                disabled={exporting}
                width={200}
              />
            </Box>
            {exportError && (
              <Typography color="var(--error, #dc2626)">
                {t("pdf.exportError")}
              </Typography>
            )}
          </Card>
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
