import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Section } from "@/components/analysis/section";
import { InfoRow } from "@/components/analysis/info-row";
import { StakeholderCard } from "@/components/analysis/stakeholder-card";
import { TierCard } from "@/components/analysis/tier-card";
import { FormulaCard } from "@/components/analysis/formula-card";
import { DeploymentCard } from "@/components/analysis/deployment-card";
import { PhaseHeader, TaskTable } from "@/components/analysis/task-table";
import { AnalysisPdfExport } from "@/components/analysis-pdf-export";
import { buildAnalysisPdfData, type Translate } from "@/lib/analysis-pdf";
import {
  STAKEHOLDERS,
  TIER_DEFS,
  MATH_VARS,
  MATH_VAR_SYMBOLS,
  FORMULAS,
  USER_STORY_KEYS,
  TASK_PHASES,
  OVERVIEW_ROWS,
  TECH_STACK,
  INFRA_SPEC_KEYS,
  taskDisplayId,
} from "@/lib/analysis-content";

type Props = { params: Promise<{ locale: string }> };

export default async function AnalysisPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AnalysisPage");

  const tierLabels = {
    tier: t("tierLabels.tierPrefix"),
    term: t("tierLabels.term"),
    delta: t("tierLabels.delta"),
    mitigation: t("tierLabels.mitigation"),
  };

  // Build the fully-resolved PDF payload on the server (all strings localized),
  // then hand it to the client export card. `t` is cast to the loose Translate
  // shape because the builder composes keys dynamically.
  const pdfData = buildAnalysisPdfData({
    t: t as unknown as Translate,
    locale,
  });

  return (
    <>
      <NavbarSpacer />
      <Container
        display="flex"
        flexDirection="column"
        alignItems="center"
        styles={{ minHeight: "100vh", paddingTop: 12, paddingBottom: 64 }}
        size="lg"
        paddingX={12}
      >
        <Box
          display="flex"
          flexDirection="column"
          gap={32}
          width="100%"
          styles={{ maxWidth: "100%", minWidth: 0 }}
        >
          {/* Page Header */}
          <Box display="flex" flexDirection="column" gap={8}>
            <Typography as="h1" fontWeight={700} color="var(--foreground)">
              {t("heading")}
            </Typography>
            <Typography color="var(--muted-foreground, #6b7280)">
              {t("subtitle")}
            </Typography>
          </Box>

          {/* Section 1: Project Overview */}
          <Section title={t("section.overview")}>
            <Card
              display="flex"
              flexDirection="column"
              gap={0}
              padding={0}
              styles={{ overflow: "hidden" }}
            >
              {OVERVIEW_ROWS.map((row, idx, arr) => (
                <InfoRow
                  key={row.labelKey}
                  label={t(`overview.${row.labelKey}`)}
                  value={t(`overview.${row.valueKey}`)}
                  idx={idx}
                  last={idx === arr.length - 1}
                />
              ))}
            </Card>
          </Section>

          {/* Section 2: Stakeholder Profiles */}
          <Section title={t("section.stakeholders")}>
            <Grid container spacing={2}>
              {STAKEHOLDERS.map((s) => (
                <Grid key={s.key} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <StakeholderCard
                    icon={s.icon}
                    accent={s.accent}
                    name={t(`stakeholders.${s.key}.name`)}
                    category={t(
                      s.category === "user"
                        ? "stakeholders.categoryUser"
                        : "stakeholders.categoryPlatform",
                    )}
                    goalLabel={t("stakeholders.goalLabel")}
                    goal={t(`stakeholders.${s.key}.goal`)}
                    profileLabel={t("stakeholders.profileLabel")}
                    profile={t(`stakeholders.${s.key}.profile`)}
                  />
                </Grid>
              ))}
            </Grid>
          </Section>

          {/* Section 3: Core Risk Verticals */}
          <Section title={t("section.riskVerticals")}>
            {TIER_DEFS.map((td) => (
              <TierCard
                key={td.key}
                tier={td.tier}
                name={t(`tiers.${td.key}.name`)}
                term={t(`tiers.${td.key}.term`)}
                delta={t(`tiers.${td.key}.delta`)}
                mitigation={t(`tiers.${td.key}.mitigation`)}
                color={td.color}
                icon={td.icon}
                labels={tierLabels}
              />
            ))}
          </Section>

          {/* Section 4: Math Models */}
          <Section title={t("section.mathModels")}>
            <Box display="flex" flexDirection="column" gap={4}>
              <Typography
                styles={{ fontWeight: 600 }}
                color="var(--muted-foreground)"
              >
                {t("math.universalVarsLabel")}
              </Typography>
              <Card
                display="flex"
                flexDirection="column"
                gap={0}
                padding={0}
                styles={{ overflow: "hidden" }}
              >
                {MATH_VARS.map((v, idx, arr) => (
                  <Box
                    key={v}
                    display="flex"
                    flexDirection="row"
                    gap={12}
                    padding="14px 16px"
                    backgroundColor={
                      idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
                    }
                    styles={{
                      borderBottom:
                        idx < arr.length - 1
                          ? "1px solid var(--border, #e5e7eb)"
                          : undefined,
                    }}
                  >
                    <Typography
                      fontWeight={700}
                      styles={{ minWidth: 40, fontFamily: "monospace" }}
                      color="var(--accent, #06b6d4)"
                    >
                      {MATH_VAR_SYMBOLS[v]}
                    </Typography>
                    <Typography
                      styles={{
                        lineHeight: 1.6,
                        flex: 1,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                      }}
                      color="var(--foreground)"
                    >
                      {t(`vars.${v}`)}
                    </Typography>
                  </Box>
                ))}
              </Card>
            </Box>

            {FORMULAS.map((f) => (
              <FormulaCard
                key={f.key}
                label={t(`formulas.${f.key}.label`)}
                description={t(`formulas.${f.key}.description`)}
                formula={f.formula}
              />
            ))}
          </Section>

          {/* Section 5: User Stories */}
          <Section title={t("section.userStories")}>
            <TaskTable
              tasks={USER_STORY_KEYS.map((key) => ({
                id: taskDisplayId(key),
                component: t(`userStories.${key}.component`),
                directive: t(`userStories.${key}.directive`),
              }))}
            />
          </Section>

          {/* Section 6: Task Breakdown */}
          <Section title={t("section.taskBreakdown")}>
            {TASK_PHASES.map((phase) => (
              <Box
                key={phase.phase}
                display="flex"
                flexDirection="column"
                gap={16}
              >
                <PhaseHeader
                  phase={phase.phase}
                  label={t(`phase.${phase.labelKey}`)}
                  prefix={t("phasePrefix")}
                />
                <TaskTable
                  tasks={phase.taskIds.map((id) => ({
                    id: taskDisplayId(id),
                    component: t(`tasks.${id}.component`),
                    directive: t(`tasks.${id}.directive`),
                  }))}
                />
              </Box>
            ))}
          </Section>

          {/* Section 7: Infrastructure & Deployment */}
          <Section title={t("section.infrastructure")}>
            <DeploymentCard
              imageAlt={t("infra.imageAlt")}
              imageCaption={t("infra.imageCaption")}
              toggleLabel={t("infra.toggleLabel")}
              intro={t("infra.intro")}
              techStackLabel={t("infra.techStackLabel")}
              techStack={TECH_STACK}
              deployLabel={t("infra.deployLabel")}
              specs={INFRA_SPEC_KEYS.map((key) => ({
                label: t(`infra.specs.${key}Label`),
                value: t(`infra.specs.${key}`),
              }))}
            />
          </Section>

          {/* Export to PDF */}
          <AnalysisPdfExport
            data={pdfData}
            labels={{
              cardHeading: t("pdf.cardHeading"),
              cardDescription: t("pdf.cardDescription"),
              selectLabel: t("pdf.selectLabel"),
              exportButton: t("pdf.exportButton"),
              exporting: t("pdf.exporting"),
              exportError: t("pdf.exportError"),
              fileLabel: t("pdf.fileLabel"),
            }}
          />
        </Box>
      </Container>
    </>
  );
}
