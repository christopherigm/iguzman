"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import type { CompanyAnalysis } from "@/lib/applications";
import { SIGNAL_COLORS } from "../detail-constants";

const SIGNAL_KEYS: Array<{
  key: keyof Omit<CompanyAnalysis, "summary">;
  tKey: string;
}> = [
  { key: "job_security", tKey: "signals.job_security" },
  { key: "financial_health", tKey: "signals.financial_health" },
  { key: "leadership_stability", tKey: "signals.leadership_stability" },
  { key: "work_culture", tKey: "signals.work_culture" },
  { key: "growth_trajectory", tKey: "signals.growth_trajectory" },
];

export function CompanyAnalysisPanel({
  analysis,
}: {
  analysis: CompanyAnalysis;
}) {
  const t = useTranslations("ApplicationDetailPage");
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Card gap={8}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t("companyAnalysisSummaryTitle")}
        </Typography>
        <Typography
          as="p"
          variant="body"
          styles={{ lineHeight: 1.6, wordBreak: "break-word" }}
        >
          {analysis.summary}
        </Typography>
      </Card>
      <Box display="flex" flexDirection="column" gap={10}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {t("companyAnalysisSignalsTitle")}
        </Typography>
        <Grid container spacing={2}>
          {SIGNAL_KEYS.map(({ key, tKey }) => {
            const signal = analysis[key];
            return (
              <Grid key={key} size={{ xs: 12, sm: 6 }}>
                <Card gap={8} padding={12}>
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
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
}
