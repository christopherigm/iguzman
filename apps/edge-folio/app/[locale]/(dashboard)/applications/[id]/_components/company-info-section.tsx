"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Grid } from "@repo/ui/core-elements/grid";
import type {
  JobApplication,
  CompanyIntel,
  CompanyAnalysis,
} from "@/lib/applications";
import { IntelSwiperCard } from "./company-intel-card";
import { CompanyAnalysisPanel } from "./company-analysis-panel";
import { CompanySignalsPanel } from "./company-signals-panel";

interface Props {
  app: JobApplication;
  companyDescription: string;
  companyIntel: CompanyIntel | null;
  companyAnalysis: CompanyAnalysis | null;
}

/** Maps each intel bucket to its section title key so the grid stays flat. */
const INTEL_SECTIONS: Array<{ key: keyof CompanyIntel; titleKey: string }> = [
  { key: "company_news", titleKey: "companyNewsTitle" },
  { key: "hiring_news", titleKey: "companyHiringTitle" },
  { key: "layoff_news", titleKey: "companyLayoffsTitle" },
  { key: "reputation", titleKey: "companyReputationTitle" },
  { key: "funding_news", titleKey: "companyFundingTitle" },
  { key: "leadership_news", titleKey: "companyLeadershipTitle" },
  { key: "acquisition_news", titleKey: "companyAcquisitionsTitle" },
  { key: "engineering_culture", titleKey: "companyEngineeringCultureTitle" },
];

export function CompanyInfoSection({
  app,
  companyDescription,
  companyIntel,
  companyAnalysis,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");
  const gathering =
    app.company?.status === "pending" || app.company?.status === "processing";

  return (
    <Box marginBottom={28} marginTop={40}>
      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
        {t("companyInfoTitle")}
      </Typography>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={16}
      />

      {/* Gathering / failed / empty states */}
      {gathering && (
        <Box display="flex" alignItems="center" gap={8} marginBottom={14}>
          <Spinner size={16} label={t("gatheringCompanyData")} />
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("gatheringCompanyData")}
          </Typography>
        </Box>
      )}
      {app.company?.status === "failed" &&
        !companyDescription &&
        !companyIntel && (
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("companyDataUnavailable")}
          </Typography>
        )}
      {!app.company && (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("companyInfoEmpty")}
        </Typography>
      )}

      {/* Progressive data rendering */}
      {(companyDescription || companyIntel || companyAnalysis) && (
        <Box display="flex" flexDirection="column" gap={24}>
          {companyDescription && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Typography
                variant="body"
                fontWeight={600}
                color="var(--foreground)"
              >
                {t("companyAboutTitle")}
              </Typography>
              <Card gap={8}>
                <Typography
                  as="p"
                  variant="body"
                  styles={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    lineHeight: 1.6,
                  }}
                >
                  {companyDescription}
                </Typography>
              </Card>
            </Box>
          )}
          {companyAnalysis && (
            <Box display="flex" flexDirection="column" gap={16}>
              <Box display="flex" flexDirection="column" gap={8}>
                <Typography
                  variant="body"
                  fontWeight={600}
                  color="var(--foreground)"
                >
                  {t("companyAnalysisTitle")}
                </Typography>
                <CompanyAnalysisPanel analysis={companyAnalysis} />
              </Box>
              <CompanySignalsPanel
                analysis={companyAnalysis}
                intel={companyIntel}
              />
            </Box>
          )}
          {/* Fallback: intel arrived before the analysis (progressive load), so
              there are no signals to select yet - show the raw source swipers. */}
          {!companyAnalysis && companyIntel && (
            <Grid container spacing={2}>
              {INTEL_SECTIONS.map(({ key, titleKey }) => {
                const items = companyIntel[key];
                if (!items || items.length === 0) return null;
                return (
                  <Grid key={key} size={{ xs: 12, sm: 6 }}>
                    <IntelSwiperCard title={t(titleKey)} items={items} />
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      )}
    </Box>
  );
}
