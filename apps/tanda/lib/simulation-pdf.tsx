// ─── PDF Export ──────────────────────────────────────────────────────────────
//
// Assembles the fully-localized, presentation-ready payload for the simulation
// PDF and triggers the download. All labels/values are formatted here (the PDF
// document in `components/simulation-pdf.tsx` stays a pure view) so the export
// matches exactly what the user sees on screen.

import type {
  PdfRow,
  PdfLineChart,
  PdfPieSection,
  SimulationPdfProps,
} from "../components/simulation-pdf";
import type {
  SimResult,
  BankResult,
  ChartData,
  TreasuryData,
} from "./simulation-engine";
import { type TierConfig, type TierKey, TIER_I18N_KEY } from "./tiers";
import type { AnalysisSource } from "../components/ai-analysis";

/**
 * Loose translation-function shape. The Simulator passes its strict next-intl
 * `t`, but the PDF builder composes keys dynamically, so a plain string-keyed
 * signature keeps it free of per-call casts.
 */
export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface BuildPdfParams {
  t: Translate;
  locale: string;
  tier: TierKey;
  cfg: TierConfig;
  vehicleCondition: "new" | "used";
  G: number;
  months: number;
  delta: number;
  cetesRate: number;
  result: SimResult | null;
  bankResult: BankResult | null;
  escrowUnlockMonth: number | null;
  cadenceLabel: string;
  repayMultiple: number | null;
  savings: number | null;
  chartData: ChartData | null;
  treasuryData: TreasuryData | null;
  analysisText: string | null;
  analysisSources: AnalysisSource[];
  fmtWhole: Intl.NumberFormat;
  fmtCents: Intl.NumberFormat;
}

export function buildSimulationPdfData({
  t,
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
  fmtWhole,
  fmtCents,
}: BuildPdfParams): SimulationPdfProps | null {
  if (!result || !bankResult || G <= 0) return null;

  const T = months / 12;
  const rateKind = cfg.rateKind ?? "apr";
  const isCat = rateKind === "cat";
  const rateValueKey = isCat ? "catValue" : "bankAprValue";

  const assetTypeLabel = t(`tiers.${TIER_I18N_KEY[tier]}.label`);
  const assetLabel =
    tier === "vehicle"
      ? `${assetTypeLabel} (${t(`vehicleCondition.${vehicleCondition}`)})`
      : assetTypeLabel;

  const parameters: PdfRow[] = [
    { label: t("pdf.assetType"), value: assetLabel },
    { label: t("priceLabelG"), value: fmtWhole.format(G) },
    {
      label: t("pdf.term"),
      value: t("pdf.termValue", { months, years: T.toFixed(1) }),
    },
    {
      label: t("pdf.priceAppreciation"),
      value: `${(delta * 100).toFixed(1)}%`,
    },
    {
      label: t("pdf.downpayment"),
      value: `${(cfg.downpaymentPct * 100).toFixed(0)}% · ${fmtWhole.format(
        result.downpayment,
      )}`,
    },
    {
      label: t("pdf.lenderRate"),
      value: `${(bankResult.apr * 100).toFixed(2)}% ${isCat ? "CAT" : "APR"}`,
    },
  ];
  if (escrowUnlockMonth !== null) {
    parameters.push({
      label: t("pdf.escrow"),
      value: t("pdf.escrowValue", {
        month: escrowUnlockMonth,
        total: months,
      }),
    });
  }

  const tandaRows: PdfRow[] = [
    {
      label: t("monthlyPayment"),
      value: fmtCents.format(result.P),
      highlight: true,
    },
    {
      label: t("downpaymentRequired"),
      value: fmtWhole.format(result.downpayment),
    },
    { label: t("interestCharged"), value: t("zeroInterest") },
    {
      label: t("groupSize"),
      value: t("groupSizeValue", { n: result.N }),
    },
    { label: t("payoutCadence"), value: cadenceLabel },
    {
      label: t("assetPriceAtEnd", { years: T.toFixed(1) }),
      value: fmtWhole.format(result.G_final),
    },
    {
      label: t("totalContributed"),
      value: fmtWhole.format(result.totalPaid),
      highlight: true,
    },
  ];

  const bankRows: PdfRow[] = [
    {
      label: t("monthlyPayment"),
      value: fmtCents.format(bankResult.P),
      highlight: true,
    },
    {
      label: t("downpaymentRequired"),
      value: fmtWhole.format(bankResult.downpayment),
    },
    {
      label: t("interestCharged"),
      value: t(rateValueKey, {
        pct: (bankResult.apr * 100).toFixed(2),
      }),
    },
    {
      label: t("bankFinancedAmount"),
      value: fmtWhole.format(bankResult.principal),
    },
    {
      label: t("bankTotalInterest"),
      value: fmtWhole.format(bankResult.totalInterest),
    },
    {
      label: t("bankTotalCost"),
      value: fmtWhole.format(bankResult.totalPaid),
      highlight: true,
    },
  ];
  if (cfg.showRepayMultiple && repayMultiple !== null) {
    bankRows.push({
      label: t("repayMultiple"),
      value: t("repayMultipleValue", { multiple: repayMultiple.toFixed(1) }),
      highlight: true,
    });
  }

  const bankHeading = t(cfg.comparisonHeadingKey ?? "bankColumnHeading");

  // Cost-breakdown pies mirror the two in-app comparison cards: each card's
  // slices sum exactly to its total (TandaOmni is interest-free, so just
  // downpayment + monthly contributions; the lender adds a financed-amount and
  // total-interest slice).
  const fmtPieValue = (v: number) => fmtWhole.format(v);
  const pieSection: PdfPieSection = {
    charts: [
      {
        heading: t("tandaColumnHeading"),
        formatValue: fmtPieValue,
        slices: [
          {
            label: t("pieDownpayment"),
            value: result.downpayment,
            color: "#06b6d4",
          },
          {
            label: t("pieMonthlyPayments"),
            value: result.P * months,
            color: "#a5f3fc",
          },
        ],
      },
      {
        heading: bankHeading,
        formatValue: fmtPieValue,
        slices: [
          {
            label: t("pieDownpayment"),
            value: bankResult.downpayment,
            color: "#6b7280",
          },
          {
            label: t("bankFinancedAmount"),
            value: bankResult.principal,
            color: "#9ca3af",
          },
          {
            label: t("bankTotalInterest"),
            value: bankResult.totalInterest,
            color: "#d97706",
          },
        ],
      },
    ],
    note: t("pieShareNote"),
  };

  const charts: PdfLineChart[] = [];
  if (chartData) {
    charts.push({
      heading: t("chartsHeading"),
      note: t("combinedChartNote", {
        tanda: fmtCents.format(result.P),
        lender: fmtCents.format(bankResult.P),
        pct: (delta * 100).toFixed(1),
      }),
      labels: chartData.labels,
      formatTick: (v) => fmtWhole.format(v),
      series: [
        {
          label: t("tandaColumnHeading"),
          color: "#06b6d4",
          data: chartData.tandaCumulative,
        },
        {
          label: bankHeading,
          color: "#6b7280",
          data: chartData.bankCumulative,
        },
        {
          label: t("assetPriceSeriesLabel"),
          color: "#f59e0b",
          data: chartData.assetPrice,
        },
      ],
    });
  }
  if (treasuryData) {
    charts.push({
      heading: t("treasuryHeading"),
      note: t("treasuryChartNote", {
        pool: fmtWhole.format(treasuryData.pool),
        monthly: fmtWhole.format(treasuryData.monthlyInflow),
        rate: (cetesRate * 100).toFixed(1),
      }),
      labels: treasuryData.labels,
      formatTick: (v) => fmtWhole.format(v),
      series: [
        {
          label: t("treasuryWithYieldLabel"),
          color: "#16a34a",
          data: treasuryData.withYield,
        },
        {
          label: t("treasuryNoYieldLabel"),
          color: "#6b7280",
          data: treasuryData.noYield,
        },
      ],
    });
  }

  return {
    title: t("pdf.title"),
    subtitle: `${assetLabel} · ${fmtWhole.format(G)} · ${t("pdf.termValue", {
      months,
      years: T.toFixed(1),
    })}`,
    generatedOn: t("pdf.generatedOn", {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
        new Date(),
      ),
    }),
    parameters,
    tandaHeading: t("tandaColumnHeading"),
    tandaRows,
    bankHeading,
    bankRows,
    savings:
      savings !== null && savings > 0
        ? {
            label: t("savingsHeading"),
            value: t("savingsAmount", { amount: fmtWhole.format(savings) }),
          }
        : undefined,
    pieSection,
    charts,
    analysisHeading: analysisText ? t("aiAnalysis.heading") : undefined,
    analysisText: analysisText ?? undefined,
    sourcesHeading:
      analysisText && analysisSources.length > 0
        ? t("aiAnalysis.sourcesHeading")
        : undefined,
    sources:
      analysisText && analysisSources.length > 0 ? analysisSources : undefined,
    disclaimer: t("pdf.disclaimer"),
  };
}

/**
 * Renders the PDF document to a blob and triggers a browser download.
 * `@react-pdf/renderer` and the document component are imported dynamically so
 * they stay out of the initial bundle until the user actually exports.
 */
export async function downloadSimulationPdf(
  data: SimulationPdfProps,
  fileLabel: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { SimulationDocument } = await import("../components/simulation-pdf");
  const blob = await pdf(<SimulationDocument {...data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tandaomni-${fileLabel}-simulation.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}
