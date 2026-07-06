"use client";

import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { CompanyAnalysis } from "@/lib/applications";

export function CompanyAnalysisPanel({
  analysis,
}: {
  analysis: CompanyAnalysis;
}) {
  const t = useTranslations("ApplicationDetailPage");
  return (
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
  );
}
