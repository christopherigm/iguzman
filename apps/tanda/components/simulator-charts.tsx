import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Chart } from "@repo/ui/core-elements/chart";
import type { ChartData, TreasuryData } from "../lib/simulation-engine";
import type { Translate } from "../lib/simulation-pdf";

// Charts plot whole-currency amounts; decimals add visual noise without meaning
// at this scale, so every series is rounded to integers before it is drawn.
const toIntegers = (data: number[]) => data.map((v) => Math.round(v));

/**
 * Cumulative amount paid (TandaOmni vs lender) plotted against the asset-price
 * curve. All three series share a comparable currency scale.
 */
export function ProjectionChart({
  t,
  chartData,
  tandaMonthly,
  lenderMonthly,
  delta,
  fmtCents,
  lenderHeadingKey,
}: {
  t: Translate;
  chartData: ChartData;
  tandaMonthly: number;
  lenderMonthly: number;
  delta: number;
  fmtCents: Intl.NumberFormat;
  lenderHeadingKey: string;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={20}>
      <Typography
        as="h2"
        fontWeight={700}
        color="var(--foreground)"
        styles={{ textTransform: "uppercase", letterSpacing: 1 }}
      >
        {t("chartsHeading")}
      </Typography>

      <Card gap={12} padding={20}>
        <Typography color="var(--muted-foreground, #6b7280)">
          {t("combinedChartNote", {
            tanda: fmtCents.format(tandaMonthly),
            lender: fmtCents.format(lenderMonthly),
            pct: (delta * 100).toFixed(1),
          })}
        </Typography>
        <Chart
          type="line"
          labels={chartData.labels}
          series={[
            {
              label: t("tandaColumnHeading"),
              data: toIntegers(chartData.tandaCumulative),
              color: "#06b6d4",
            },
            {
              label: t(lenderHeadingKey),
              data: toIntegers(chartData.bankCumulative),
              color: "#6b7280",
            },
            {
              label: t("assetPriceSeriesLabel"),
              data: toIntegers(chartData.assetPrice),
              color: "#f59e0b",
            },
          ]}
          height={340}
          ariaLabel={t("chartsHeading")}
        />
      </Card>
    </Box>
  );
}

/**
 * Group treasury balance B_m over the term: invested in CETES vs uninvested.
 * The gap between the two lines is the value of investing the idle pool.
 */
export function TreasuryChart({
  t,
  treasuryData,
  cetesRate,
  fmtWhole,
}: {
  t: Translate;
  treasuryData: TreasuryData;
  cetesRate: number;
  fmtWhole: Intl.NumberFormat;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={20}>
      <Typography
        as="h2"
        fontWeight={700}
        color="var(--foreground)"
        styles={{ textTransform: "uppercase", letterSpacing: 1 }}
      >
        {t("treasuryHeading")}
      </Typography>

      <Card gap={12} padding={20}>
        <Typography color="var(--muted-foreground, #6b7280)">
          {t("treasuryChartNote", {
            pool: fmtWhole.format(treasuryData.pool),
            monthly: fmtWhole.format(treasuryData.monthlyInflow),
            rate: (cetesRate * 100).toFixed(1),
          })}
        </Typography>
        <Chart
          type="line"
          labels={treasuryData.labels}
          series={[
            {
              label: t("treasuryWithYieldLabel"),
              data: toIntegers(treasuryData.withYield),
              color: "#16a34a",
            },
            {
              label: t("treasuryNoYieldLabel"),
              data: toIntegers(treasuryData.noYield),
              color: "#6b7280",
            },
          ]}
          height={340}
          ariaLabel={t("treasuryHeading")}
        />
      </Card>
    </Box>
  );
}
