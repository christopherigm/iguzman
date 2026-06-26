"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  LineController,
  PieController,
  RadarController,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Chart as ReactChart } from "react-chartjs-2";
import { Box } from "./box";
import type { UIComponentProps } from "./utils";
import "./chart.css";

// Register the controllers/elements/scales the three supported chart types need
// (tree-shaking keeps the bundle lean). Done once at module load. The generic
// react-chartjs-2 <Chart> does not auto-register controllers the way the typed
// <Line>/<Pie>/<Radar> wrappers do, so the controllers must be registered here.
ChartJS.register(
  LineController,
  PieController,
  RadarController,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
);

export type ChartType = "line" | "pie" | "radar";

/** One plotted series: a label and a value per chart category (`labels`). */
export interface ChartSeries {
  label: string;
  data: number[];
  /** Base color override; falls back to the shared categorical palette. */
  color?: string;
}

export interface ChartProps extends UIComponentProps {
  /** Chart style. `line` and `radar` plot per-series; `pie` plots one series. */
  type: ChartType;
  /** Category labels shared by every series (x-axis / slices / radar spokes). */
  labels: string[];
  series: ChartSeries[];
  /** Accessible description of the chart for screen readers. */
  ariaLabel?: string;
  /** Hide the legend (useful for single-series pies that label each slice). */
  hideLegend?: boolean;
}

/**
 * Distinct, theme-neutral categorical palette. Pie slices and line/radar series
 * cycle through it when no explicit `color` is given. Chosen for contrast in
 * both light and dark themes.
 */
const PALETTE = [
  "#e11d48", // rose (matches the app accent)
  "#2563eb", // blue
  "#16a34a", // green
  "#f59e0b", // amber
  "#9333ea", // violet
  "#0891b2", // cyan
  "#dc2626", // red
  "#65a30d", // lime
  "#db2777", // pink
  "#475569", // slate
  "#ea580c", // orange
  "#0d9488", // teal
];

/** Convert a `#rrggbb` hex to an `rgba()` string at the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generic Chart.js wrapper supporting line / pie / radar via a single `type`
 * prop, so any app can render the same data under different styles. Tick, grid,
 * and legend colors track the current theme by reading `--foreground` at runtime
 * (the canvas can't consume CSS variables directly). Sizes to its container, so
 * set a `height` (defaults to 280px).
 *
 * @example
 * <Chart
 *   type="line"
 *   labels={["2020", "2021", "2022"]}
 *   series={[{ label: "Movies", data: [3, 7, 5] }]}
 *   height={300}
 * />
 */
export function Chart({
  type,
  labels,
  series,
  ariaLabel,
  hideLegend = false,
  height = 280,
  ...rest
}: ChartProps) {
  // Foreground color drives axis ticks, grid lines, and legend text. Read from
  // the resolved theme on mount and whenever the theme attribute flips. The app
  // sets palette vars (incl. --foreground) on <body>, so read from there.
  const [foreground, setForeground] = useState("#1f2937");

  useEffect(() => {
    const readColor = () => {
      const value = getComputedStyle(document.body)
        .getPropertyValue("--foreground")
        .trim();
      if (value) setForeground(value);
    };
    readColor();
    // Re-read on theme changes. The app toggles `data-theme` on <html>, but the
    // palette vars (incl. --foreground) are written to <body>'s inline style by
    // PaletteProvider - and that happens on a later tick than the <html> flip.
    // Watch both: in `system` mode on a fresh load the <html> attribute settles
    // before <body>'s vars do, so observing <html> alone latches a stale color.
    const observer = new MutationObserver(readColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => observer.disconnect();
  }, []);

  const data: ChartData<ChartType> = useMemo(() => {
    if (type === "pie") {
      // A pie shows one series; each slice (category) gets its own palette color.
      const single = series[0];
      const values = single?.data ?? [];
      const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]!);
      return {
        labels,
        datasets: [
          {
            label: single?.label ?? "",
            data: values,
            backgroundColor: colors.map((c) => withAlpha(c, 0.85)),
            borderColor: colors,
            borderWidth: 1,
          },
        ],
      };
    }

    return {
      labels,
      datasets: series.map((s, i) => {
        const base = s.color ?? PALETTE[i % PALETTE.length]!;
        return {
          label: s.label,
          data: s.data,
          borderColor: base,
          backgroundColor: withAlpha(base, type === "radar" ? 0.2 : 0.15),
          pointBackgroundColor: base,
          borderWidth: 2,
          fill: type === "radar",
          tension: 0.3,
        };
      }),
    };
  }, [type, labels, series]);

  const options: ChartOptions<ChartType> = useMemo(() => {
    const gridColor = withAlpha(
      foreground.startsWith("#") ? foreground : "#888888",
      0.12,
    );
    const tickColor = foreground || "#888888";
    const isCartesian = type === "line";
    const isRadar = type === "radar";

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: !hideLegend,
          position: "bottom",
          labels: { color: tickColor, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          callbacks: {},
        },
      },
      scales: isCartesian
        ? {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: {
              beginAtZero: true,
              ticks: { color: tickColor, precision: 0 },
              grid: { color: gridColor },
            },
          }
        : isRadar
          ? {
              r: {
                beginAtZero: true,
                angleLines: { color: gridColor },
                grid: { color: gridColor },
                pointLabels: { color: tickColor },
                ticks: {
                  color: tickColor,
                  backdropColor: "transparent",
                  precision: 0,
                },
              },
            }
          : undefined,
    };
  }, [type, foreground, hideLegend]);

  return (
    <Box
      display="block"
      width="100%"
      height={height}
      styles={{ position: "relative" }}
      {...rest}
    >
      <ReactChart
        type={type}
        data={data}
        options={options}
        aria-label={ariaLabel}
        role="img"
        className="ui-chart-canvas"
      />
    </Box>
  );
}

export default Chart;
