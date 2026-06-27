import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";
import { MathFormula } from "@repo/ui/core-elements/math-formula";
import { ServerImageToggle } from "@/components/server-image-toggle";

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
              {[
                {
                  label: t("overview.objectiveLabel"),
                  value: t("overview.objective"),
                },
                {
                  label: t("overview.stackLabel"),
                  value: t("overview.stack"),
                },
                {
                  label: t("overview.courseLabel"),
                  value: t("overview.courseValue"),
                },
                {
                  label: t("overview.studentLabel"),
                  value: t("overview.studentValue"),
                },
              ].map((row, idx, arr) => (
                <InfoRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  idx={idx}
                  last={idx === arr.length - 1}
                />
              ))}
            </Card>
          </Section>

          {/* Section 2: Core Risk Verticals */}
          <Section title={t("section.riskVerticals")}>
            <TierCard
              tier="1"
              name={t("tiers.t1.name")}
              term={t("tiers.t1.term")}
              delta={t("tiers.t1.delta")}
              mitigation={t("tiers.t1.mitigation")}
              color="var(--success, #16a34a)"
              icon="🏠"
              labels={tierLabels}
            />
            <TierCard
              tier="2"
              name={t("tiers.t2.name")}
              term={t("tiers.t2.term")}
              delta={t("tiers.t2.delta")}
              mitigation={t("tiers.t2.mitigation")}
              color="var(--warning, #d97706)"
              icon="🚗"
              labels={tierLabels}
            />
            <TierCard
              tier="3"
              name={t("tiers.t3.name")}
              term={t("tiers.t3.term")}
              delta={t("tiers.t3.delta")}
              mitigation={t("tiers.t3.mitigation")}
              color="var(--accent, #06b6d4)"
              icon="✈️"
              labels={tierLabels}
            />
          </Section>

          {/* Section 3: Math Models */}
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
                {[
                  { symbol: "G", description: t("vars.G") },
                  { symbol: "N", description: t("vars.N") },
                  { symbol: "d", description: t("vars.d") },
                  { symbol: "δ", description: t("vars.delta") },
                  { symbol: "r", description: t("vars.r") },
                  { symbol: "T", description: t("vars.T") },
                  { symbol: "M", description: t("vars.M") },
                  { symbol: "m", description: t("vars.m") },
                ].map((row, idx, arr) => (
                  <Box
                    key={row.symbol}
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
                      {row.symbol}
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
                      {row.description}
                    </Typography>
                  </Box>
                ))}
              </Card>
            </Box>

            <FormulaCard
              label={t("formulas.a.label")}
              description={t("formulas.a.description")}
              formula="G_m = G × (1 + δ)^(m/12)"
            />
            <FormulaCard
              label={t("formulas.b.label")}
              description={t("formulas.b.description")}
              formula="P = [(1/M) × Σ G × (1 + δ)^(m/12) − G × d] / M"
            />
            <FormulaCard
              label={t("formulas.c.label")}
              description={t("formulas.c.description")}
              formula="ΣP_k + (G × d) ≥ G_m × c"
            />
            <FormulaCard
              label={t("formulas.d.label")}
              description={t("formulas.d.description")}
              formula="B_m = B_{m-1} + (N × P) + (B_{m-1} × r/12) − G_m − I_m"
            />
          </Section>

          {/* Section 4: Task Breakdown */}
          <Section title={t("section.taskBreakdown")}>
            {/* Phase 1 */}
            <PhaseHeader
              phase="1"
              label={t("phase.be")}
              prefix={t("phasePrefix")}
            />
            <TaskTable
              tasks={[
                {
                  id: "BE-01",
                  component: t("tasks.be01.component"),
                  directive: t("tasks.be01.directive"),
                },
                {
                  id: "BE-02",
                  component: t("tasks.be02.component"),
                  directive: t("tasks.be02.directive"),
                },
                {
                  id: "BE-03",
                  component: t("tasks.be03.component"),
                  directive: t("tasks.be03.directive"),
                },
                {
                  id: "BE-04",
                  component: t("tasks.be04.component"),
                  directive: t("tasks.be04.directive"),
                },
                {
                  id: "BE-05",
                  component: t("tasks.be05.component"),
                  directive: t("tasks.be05.directive"),
                },
                {
                  id: "BE-06",
                  component: t("tasks.be06.component"),
                  directive: t("tasks.be06.directive"),
                },
              ]}
            />

            {/* Phase 2 */}
            <PhaseHeader
              phase="2"
              label={t("phase.fe")}
              prefix={t("phasePrefix")}
            />
            <TaskTable
              tasks={[
                {
                  id: "FE-01",
                  component: t("tasks.fe01.component"),
                  directive: t("tasks.fe01.directive"),
                },
                {
                  id: "FE-02",
                  component: t("tasks.fe02.component"),
                  directive: t("tasks.fe02.directive"),
                },
                {
                  id: "FE-03",
                  component: t("tasks.fe03.component"),
                  directive: t("tasks.fe03.directive"),
                },
                {
                  id: "FE-04",
                  component: t("tasks.fe04.component"),
                  directive: t("tasks.fe04.directive"),
                },
              ]}
            />

            {/* Phase 3 */}
            <PhaseHeader
              phase="3"
              label={t("phase.do")}
              prefix={t("phasePrefix")}
            />
            <TaskTable
              tasks={[
                {
                  id: "DO-01",
                  component: t("tasks.do01.component"),
                  directive: t("tasks.do01.directive"),
                },
                {
                  id: "DO-02",
                  component: t("tasks.do02.component"),
                  directive: t("tasks.do02.directive"),
                },
                {
                  id: "DO-03",
                  component: t("tasks.do03.component"),
                  directive: t("tasks.do03.directive"),
                },
                {
                  id: "DO-04",
                  component: t("tasks.do04.component"),
                  directive: t("tasks.do04.directive"),
                },
                {
                  id: "DO-05",
                  component: t("tasks.do05.component"),
                  directive: t("tasks.do05.directive"),
                },
              ]}
            />
          </Section>

          {/* Section 5: Infrastructure & Deployment */}
          <Section title={t("section.infrastructure")}>
            <DeploymentCard
              imageAlt={t("infra.imageAlt")}
              imageCaption={t("infra.imageCaption")}
              toggleLabel={t("infra.toggleLabel")}
              intro={t("infra.intro")}
              techStackLabel={t("infra.techStackLabel")}
              techStack={[
                "Next.js 16",
                "React 19",
                "next-intl",
                "Serwist (PWA)",
                "SimpleWebAuthn",
                "Django / DRF",
                "PostgreSQL",
                "Redis / Celery",
                "Kubernetes",
                "Cloudflare",
              ]}
              deployLabel={t("infra.deployLabel")}
              specs={[
                {
                  label: t("infra.specs.orchestrationLabel"),
                  value: t("infra.specs.orchestration"),
                },
                {
                  label: t("infra.specs.edgeLabel"),
                  value: t("infra.specs.edge"),
                },
                {
                  label: t("infra.specs.tlsLabel"),
                  value: t("infra.specs.tls"),
                },
                {
                  label: t("infra.specs.hostLabel"),
                  value: t("infra.specs.host"),
                },
                {
                  label: t("infra.specs.containerLabel"),
                  value: t("infra.specs.container"),
                },
                {
                  label: t("infra.specs.serviceLabel"),
                  value: t("infra.specs.service"),
                },
                {
                  label: t("infra.specs.replicasLabel"),
                  value: t("infra.specs.replicas"),
                },
                {
                  label: t("infra.specs.resourcesLabel"),
                  value: t("infra.specs.resources"),
                },
                {
                  label: t("infra.specs.probesLabel"),
                  value: t("infra.specs.probes"),
                },
              ]}
            />
          </Section>
        </Box>
      </Container>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Box
        padding="10px 0"
        styles={{ borderBottom: "2px solid var(--accent, #06b6d4)" }}
      >
        <Typography as="h2" fontWeight={700} color="var(--foreground)">
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function InfoRow({
  label,
  value,
  idx,
  last,
}: {
  label: string;
  value: string;
  idx: number;
  last: boolean;
}) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={6}
      padding="14px 16px"
      backgroundColor={idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"}
      styles={{
        borderBottom: last ? undefined : "1px solid var(--border, #e5e7eb)",
      }}
    >
      <Typography fontWeight={600}>{label}</Typography>
      <Typography
        styles={{
          lineHeight: 1.6,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
        color="var(--foreground)"
      >
        {value}
      </Typography>
    </Box>
  );
}

function TierCard({
  tier,
  name,
  term,
  delta,
  mitigation,
  color,
  icon,
  labels,
}: {
  tier: string;
  name: string;
  term: string;
  delta: string;
  mitigation: string;
  color: string;
  icon: string;
  labels: { tier: string; term: string; delta: string; mitigation: string };
}) {
  return (
    <Card padding={0} styles={{ overflow: "hidden" }}>
      <Box
        padding="10px 16px"
        display="flex"
        alignItems="center"
        gap={10}
        styles={{
          borderLeft: `4px solid ${color}`,
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        <Typography>{icon}</Typography>
        <Typography fontWeight={700} color="var(--foreground)">
          {labels.tier} {tier}: {name}
        </Typography>
      </Box>
      <Box display="flex" flexDirection="column" gap={0}>
        {[
          { label: labels.term, value: term },
          { label: labels.delta, value: delta },
          { label: labels.mitigation, value: mitigation },
        ].map((row, idx, arr) => (
          <Box
            key={row.label}
            display="flex"
            flexDirection="column"
            padding="14px 16px"
            gap={6}
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
            <Typography fontWeight={600} color="var(--muted-foreground)">
              {row.label}
            </Typography>
            <Typography
              styles={{ minWidth: 0, overflowWrap: "anywhere" }}
              color="var(--foreground)"
            >
              {row.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function FormulaCard({
  label,
  description,
  formula,
}: {
  label: string;
  description: string;
  formula: string;
}) {
  return (
    <Card padding={16} gap={8}>
      <Typography fontWeight={700} color="var(--foreground)">
        {label}
      </Typography>
      <Typography styles={{ lineHeight: 1.6 }} color="var(--muted-foreground)">
        {description}
      </Typography>
      <Box
        padding="10px 14px"
        borderRadius={6}
        backgroundColor="var(--surface-2)"
      >
        <MathFormula formula={formula} displayMode />
      </Box>
    </Card>
  );
}

function DeploymentCard({
  imageAlt,
  imageCaption,
  toggleLabel,
  intro,
  techStackLabel,
  techStack,
  deployLabel,
  specs,
}: {
  imageAlt: string;
  imageCaption: string;
  toggleLabel: string;
  intro: string;
  techStackLabel: string;
  techStack: string[];
  deployLabel: string;
  specs: { label: string; value: string }[];
}) {
  return (
    <Card padding={0} styles={{ overflow: "hidden" }}>
      {/* Server photo (Kubernetes node behind Cloudflare) - centered 4:3 frame.
          Click to swap between server.jpg and server-2.jpg. */}
      <ServerImageToggle imageAlt={imageAlt} toggleLabel={toggleLabel} />
      <Box
        padding="8px 16px"
        backgroundColor="var(--surface-2)"
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
      >
        <Typography variant="caption" color="var(--muted-foreground)">
          {imageCaption}
        </Typography>
      </Box>

      {/* Intro + tech stack */}
      <Box display="flex" flexDirection="column" gap={16} padding="16px">
        <Typography styles={{ lineHeight: 1.6 }} color="var(--foreground)">
          {intro}
        </Typography>

        <Box display="flex" flexDirection="column" gap={8}>
          <Typography fontWeight={600} color="var(--muted-foreground)">
            {techStackLabel}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={8}>
            {techStack.map((tech) => (
              <Badge key={tech} variant="subtle" color="var(--accent, #06b6d4)">
                {tech}
              </Badge>
            ))}
          </Box>
        </Box>

        <Typography fontWeight={600} color="var(--muted-foreground)">
          {deployLabel}
        </Typography>
      </Box>

      {/* Deployment specs */}
      <Box display="flex" flexDirection="column" gap={0}>
        {specs.map((row, idx, arr) => (
          <Box
            key={row.label}
            display="flex"
            flexDirection="column"
            gap={4}
            padding="12px 16px"
            backgroundColor={
              idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
            }
            styles={{
              borderTop: "1px solid var(--border, #e5e7eb)",
              borderBottom:
                idx === arr.length - 1
                  ? undefined
                  : "1px solid var(--border, #e5e7eb)",
            }}
          >
            <Typography
              fontWeight={700}
              color="var(--accent, #06b6d4)"
              styles={{ fontFamily: "monospace" }}
            >
              {row.label}
            </Typography>
            <Typography
              styles={{
                lineHeight: 1.6,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
              color="var(--foreground)"
            >
              {row.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function PhaseHeader({
  phase,
  label,
  prefix,
}: {
  phase: string;
  label: string;
  prefix: string;
}) {
  return (
    <Box
      padding="8px 14px"
      borderRadius={6}
      backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)"
    >
      <Typography fontWeight={700} color="var(--foreground)">
        {prefix} {phase}: {label}
      </Typography>
    </Box>
  );
}

function TaskTable({
  tasks,
}: {
  tasks: { id: string; component: string; directive: string }[];
}) {
  return (
    <Card
      display="flex"
      flexDirection="column"
      gap={0}
      padding={0}
      styles={{ overflow: "hidden" }}
    >
      {tasks.map((task, idx) => (
        <Box
          key={task.id}
          display="flex"
          flexDirection="column"
          gap={8}
          padding="14px 16px"
          backgroundColor={
            idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
          }
          styles={{
            borderBottom:
              idx < tasks.length - 1
                ? "1px solid var(--border, #e5e7eb)"
                : undefined,
          }}
        >
          <Box
            display="flex"
            flexDirection="row"
            alignItems="center"
            gap={10}
            styles={{ flexWrap: "wrap" }}
          >
            <Typography
              fontWeight={700}
              padding="2px 8px"
              borderRadius={4}
              backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 14%, transparent)"
              styles={{ fontFamily: "monospace", flexShrink: 0 }}
              color="var(--accent, #06b6d4)"
            >
              {task.id}
            </Typography>
            <Typography
              fontWeight={600}
              color="var(--foreground)"
              styles={{ minWidth: 0, overflowWrap: "anywhere" }}
            >
              {task.component}
            </Typography>
          </Box>
          <Typography
            styles={{ lineHeight: 1.6, overflowWrap: "anywhere" }}
            color="var(--muted-foreground)"
          >
            {task.directive}
          </Typography>
        </Box>
      ))}
    </Card>
  );
}
