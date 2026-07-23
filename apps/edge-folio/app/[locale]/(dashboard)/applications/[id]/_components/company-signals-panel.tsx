"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import type { CompanyAnalysis, CompanyIntel } from "@/lib/applications";
import {
  SIGNAL_COLORS,
  SIGNAL_KEYS,
  SIGNAL_SOURCE_MAP,
  INTEL_TITLE_KEYS,
  type SignalKey,
} from "../detail-constants";
import { IntelSwiperCard } from "./company-intel-card";
import "./company-signals-panel.css";

interface Props {
  analysis: CompanyAnalysis;
  intel: CompanyIntel | null;
}

/**
 * Company Signals panel: a two-column layout (one column on xs/sm, two on md+).
 * The left column lists the five signals as a selectable list; the right column
 * renders the source swipers mapped to the selected signal (empty-state when
 * that signal has no source data).
 */
export function CompanySignalsPanel({ analysis, intel }: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const [selected, setSelected] = useState<SignalKey>(SIGNAL_KEYS[0]!.key);

  // Source swipers for the selected signal: its mapped buckets that hold items.
  const sources = SIGNAL_SOURCE_MAP[selected].filter(
    (key) => (intel?.[key]?.length ?? 0) > 0,
  );

  return (
    <Box display="flex" flexDirection="column" gap={10}>
      <Typography variant="body" fontWeight={600} color="var(--foreground)">
        {t("companyAnalysisSignalsTitle")}
      </Typography>
      <Grid container spacing={2}>
        {/* Left: selectable signal list, stacked. */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box display="flex" flexDirection="column" gap={8}>
            {SIGNAL_KEYS.map(({ key, tKey }) => {
              const signal = analysis[key];
              const isSelected = key === selected;
              return (
                <Card
                  key={key}
                  className="company-signal-item"
                  role="button"
                  tabIndex={0}
                  aria-label={t(tKey)}
                  onClick={() => setSelected(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(key);
                    }
                  }}
                  gap={8}
                  padding={12}
                  border={
                    isSelected
                      ? "1px solid var(--primary, #06b6d4)"
                      : "1px solid var(--border, #e5e7eb)"
                  }
                >
                  <Box display="flex" alignItems="center" gap={8}>
                    <span
                      className={`detail__signal-dot detail__signal-dot--${signal.level}`}
                      aria-hidden="true"
                    />
                    <Typography
                      variant="body"
                      fontWeight={600}
                      styles={{ flex: 1 }}
                    >
                      {t(tKey)}
                    </Typography>
                    <Typography
                      variant="body"
                      fontWeight={600}
                      color={SIGNAL_COLORS[signal.level]}
                    >
                      {t(`signalLevels.${signal.level}`)}
                    </Typography>
                  </Box>
                  <Typography variant="body" styles={{ lineHeight: 1.5 }}>
                    {signal.explanation}
                  </Typography>
                </Card>
              );
            })}
          </Box>
        </Grid>

        {/* Right: source swipers for the selected signal, stacked. */}
        <Grid size={{ xs: 12, sm: 6 }}>
          {sources.length > 0 ? (
            <Box display="flex" flexDirection="column" gap={16}>
              {sources.map((key) => (
                <IntelSwiperCard
                  key={key}
                  title={t(INTEL_TITLE_KEYS[key])}
                  items={intel![key]}
                />
              ))}
            </Box>
          ) : (
            <Card
              alignItems="center"
              justifyContent="center"
              padding={24}
              height="100%"
            >
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
                textAlign="center"
              >
                {t("companySignalsNoSources")}
              </Typography>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
