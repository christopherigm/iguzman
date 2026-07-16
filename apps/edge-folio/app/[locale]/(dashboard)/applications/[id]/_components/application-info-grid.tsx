"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import type { JobApplication } from "@/lib/applications";
import { MatchMetrics, type MatchMetricItem } from "@/components/match-metrics";
import { InfoField, InfoCard } from "./detail-primitives";
import { formatSalary } from "../detail-constants";

interface Props {
  app: JobApplication;
  onExplain: (item: MatchMetricItem) => void;
}

export function ApplicationInfoGrid({ app, onExplain }: Props) {
  const t = useTranslations("ApplicationDetailPage");

  const hasMetrics =
    app.overall_match != null ||
    app.technical_match != null ||
    app.nafta_tn_likelihood != null;

  const metricItems: MatchMetricItem[] = [
    ...(app.overall_match != null
      ? [
          {
            label: t("overallMatch"),
            value: app.overall_match,
            explanation: app.overall_match_explanation,
          },
        ]
      : []),
    ...(app.technical_match != null
      ? [
          {
            label: t("technicalMatch"),
            value: app.technical_match,
            explanation: app.technical_match_explanation,
          },
        ]
      : []),
    ...(app.nafta_tn_likelihood != null
      ? [
          {
            label: t("naftaLikelihood"),
            value: app.nafta_tn_likelihood,
            explanation: app.nafta_tn_likelihood_explanation,
          },
        ]
      : []),
  ];

  return (
    <Box marginBottom={24}>
      <Grid container spacing={2}>
        {hasMetrics && (
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card gap={10}>
              <MatchMetrics
                explainAriaLabel={t("metricExplain")}
                onExplain={onExplain}
                items={metricItems}
              />
            </Card>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Card gap={10}>
            <InfoField
              label={t("locationLabel")}
              value={app.location || t("notSpecified")}
            />
            <InfoField
              label={t("workTypeLabel")}
              value={
                app.work_type && app.work_type.length > 0
                  ? app.work_type.map((wt) => t(`workTypes.${wt}`)).join(", ")
                  : t("notSpecified")
              }
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <InfoCard
            label={t("salaryLabel")}
            value={formatSalary(
              app.salary_min,
              app.salary_max,
              app.salary_currency,
              t("notSpecified"),
            )}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <InfoCard
            label={t("usCitizenOrPrLabel")}
            value={t(
              app.us_citizen_or_pr_required == null
                ? "usCitizenOrPr.null"
                : app.us_citizen_or_pr_required
                  ? "usCitizenOrPr.true"
                  : "usCitizenOrPr.false",
            )}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
