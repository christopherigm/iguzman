"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Select } from "@repo/ui/core-elements/select";
import {
  Chart,
  type ChartSeries,
  type ChartType,
} from "@repo/ui/core-elements/chart";

const CHART_TYPES: ChartType[] = ["line", "pie", "radar"];

type Props = {
  title: string;
  description: string;
  /** Category labels for the chart (x-axis / slices / radar spokes). */
  labels: string[];
  series: ChartSeries[];
  /** Initial chart style; the per-card Select lets the user switch. */
  defaultType?: ChartType;
  /** Shown in place of the chart when the dimension has no data yet. */
  emptyLabel: string;
};

/**
 * A single statistics card: the metric title and a chart-style picker sit inline
 * on one row, a short explanation sits beneath them, and the chart fills the rest
 * of the card. Each card owns its own selected chart style (default `line`).
 */
export function StatCard({
  title,
  description,
  labels,
  series,
  defaultType = "line",
  emptyLabel,
}: Props) {
  const t = useTranslations("StatisticsPage");
  const [type, setType] = useState<ChartType>(defaultType);

  const styleOptions = CHART_TYPES.map((value) => ({
    value,
    label: t(`chartStyle.${value}`),
  }));

  const isEmpty = labels.length === 0;

  return (
    <Card gap={10} height="100%">
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        gap={12}
        flexWrap="wrap"
      >
        <Typography as="h3" variant="h3">
          {title}
        </Typography>
        <Select
          label={t("chartStyleLabel")}
          value={type}
          onChange={(value) => setType(value as ChartType)}
          options={styleOptions}
          width={140}
        />
      </Box>

      <Typography
        as="p"
        variant="body"
        color="var(--foreground-muted, #6b7280)"
      >
        {description}
      </Typography>

      {isEmpty ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          height={200}
        >
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {emptyLabel}
          </Typography>
        </Box>
      ) : (
        <Chart type={type} labels={labels} series={series} ariaLabel={title} />
      )}
    </Card>
  );
}
