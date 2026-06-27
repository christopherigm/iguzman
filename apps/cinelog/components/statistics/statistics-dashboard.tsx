"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select } from "@repo/ui/core-elements/select";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Typography } from "@repo/ui/core-elements/typography";
import { useIsLoggedIn } from "@/lib/use-is-logged-in";
import {
  getStats,
  STAT_DEFAULT_CHART,
  STAT_DIMENSIONS,
  type MovieStats,
  type StatDimension,
  type StatsScope,
} from "@/lib/stats";
import { StatCard } from "./stat-card";

type Props = {
  /** Whole-catalog stats prefetched on the server; null when that failed. */
  initialStats: MovieStats | null;
};

/** A single headline number in the consolidated overview band. */
function KpiTile({ value, label }: { value: number; label: string }) {
  return (
    <Box display="flex" flexDirection="column" gap={2} minWidth={96}>
      <Typography as="span" variant="h2" fontWeight={700} color="var(--accent)">
        {value}
      </Typography>
      <Typography
        as="span"
        variant="label"
        color="var(--foreground-muted, #6b7280)"
      >
        {label}
      </Typography>
    </Box>
  );
}

/**
 * The Statistics page body: a consolidated overview band of headline numbers and
 * a hero chart, followed by one card per catalog dimension. Anonymous visitors
 * see whole-catalog numbers; a signed-in user gets a scope toggle to switch
 * between the whole catalog and just their own library (refetched on change).
 */
export function StatisticsDashboard({ initialStats }: Props) {
  const t = useTranslations("StatisticsPage");
  const isLoggedIn = useIsLoggedIn();

  const [scope, setScope] = useState<StatsScope>("catalog");
  const [stats, setStats] = useState<MovieStats | null>(initialStats);
  // Spinner shows immediately when the server prefetch was unavailable.
  const [loading, setLoading] = useState(initialStats === null);
  const [error, setError] = useState(false);
  // Monotonic id so a slow earlier fetch can't overwrite a newer scope's result.
  const reqId = useRef(0);

  // Fetch a scope's stats (or reuse a server-provided fallback). Called from the
  // scope picker (an event handler) and the mount effect below - never written
  // synchronously inside an effect body, so it doesn't cascade renders.
  const load = useCallback((next: StatsScope, fallback: MovieStats | null) => {
    if (fallback) {
      setStats(fallback);
      setError(false);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    getStats(next)
      .then((data) => {
        if (id === reqId.current) setStats(data);
      })
      .catch(() => {
        if (id === reqId.current) setError(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, []);

  // Only the catalog scope is prefetched on the server. When that prefetch
  // failed (initialStats === null), fetch it on mount. All state writes happen
  // inside the async callbacks, not synchronously in the effect body.
  useEffect(() => {
    if (initialStats) return;
    const id = ++reqId.current;
    getStats("catalog")
      .then((data) => {
        if (id === reqId.current) setStats(data);
      })
      .catch(() => {
        if (id === reqId.current) setError(true);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [initialStats]);

  const handleScopeChange = (next: StatsScope) => {
    setScope(next);
    // The catalog scope reuses the server prefetch; library always fetches (it
    // needs the user's auth, which the public server prefetch never carries).
    load(next, next === "catalog" ? initialStats : null);
  };

  const scopeOptions: { value: StatsScope; label: string }[] = [
    { value: "catalog", label: t("scope.catalog") },
    { value: "library", label: t("scope.library") },
  ];

  // Display order, title/description keys, and which dimension's buckets feed
  // each card. Titles/descriptions live under StatisticsPage.<dimension>.*.
  const seriesLabel = t("seriesLabel");

  return (
    <Box display="flex" flexDirection="column" gap={16} paddingY={16}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-end"
        gap={12}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2">
            {t("title")}
          </Typography>
          <Typography
            as="p"
            variant="body"
            color="var(--foreground-muted, #6b7280)"
          >
            {t("subtitle")}
          </Typography>
        </Box>
        {isLoggedIn && (
          <Select
            label={t("scopeLabel")}
            value={scope}
            onChange={(value) => handleScopeChange(value as StatsScope)}
            options={scopeOptions}
            width={200}
          />
        )}
      </Box>

      {error || !stats ? (
        <Card alignItems="center" justifyContent="center" minHeight={160}>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {t("error")}
          </Typography>
        </Card>
      ) : (
        <Box
          display="flex"
          flexDirection="column"
          gap={16}
          styles={{ opacity: loading ? 0.5 : 1, transition: "opacity 150ms" }}
        >
          {/* Consolidated overview: headline numbers, then a hero chart. */}
          <Card>
            <Box display="flex" gap={24} flexWrap="wrap">
              <KpiTile value={stats.total} label={t("kpi.movies")} />
              <KpiTile value={stats.genres.length} label={t("kpi.genres")} />
              <KpiTile value={stats.years.length} label={t("kpi.years")} />
              <KpiTile value={stats.formats.length} label={t("kpi.formats")} />
            </Box>
          </Card>

          <StatCard
            title={t("overview.title")}
            description={t("overview.description")}
            labels={stats.years.map((b) => b.label)}
            series={[
              { label: seriesLabel, data: stats.years.map((b) => b.count) },
            ]}
            emptyLabel={t("empty")}
          />

          <Grid container spacing={1}>
            {STAT_DIMENSIONS.map((dimension: StatDimension) => {
              const buckets = stats[dimension];
              return (
                <Grid key={dimension} size={{ xs: 12, md: 6 }}>
                  <StatCard
                    title={t(`${dimension}.title`)}
                    description={t(`${dimension}.description`)}
                    labels={buckets.map((b) => b.label)}
                    series={[
                      { label: seriesLabel, data: buckets.map((b) => b.count) },
                    ]}
                    defaultType={STAT_DEFAULT_CHART[dimension]}
                    emptyLabel={t("empty")}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" paddingY={8}>
          <Spinner label={t("loading")} />
        </Box>
      )}
    </Box>
  );
}
