import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";

type Props = { params: Promise<{ locale: string }> };

export default async function AnalysisPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AnalysisPage");

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
            <Typography styles={{ lineHeight: 1.7 }} color="var(--foreground)">
              {t("overview.body")}
            </Typography>
            <Card display="flex" flexDirection="column">
              <InfoRow
                label={t("overview.objectiveLabel")}
                value={t("overview.objective")}
              />
              <InfoRow
                label={t("overview.stackLabel")}
                value={t("overview.stack")}
              />
              <InfoRow
                label={t("overview.courseLabel")}
                value={t("overview.courseValue")}
              />
              <InfoRow
                label={t("overview.studentLabel")}
                value={t("overview.studentValue")}
              />
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
            />
            <TierCard
              tier="2"
              name={t("tiers.t2.name")}
              term={t("tiers.t2.term")}
              delta={t("tiers.t2.delta")}
              mitigation={t("tiers.t2.mitigation")}
              color="var(--warning, #d97706)"
              icon="🚗"
            />
            <TierCard
              tier="3"
              name={t("tiers.t3.name")}
              term={t("tiers.t3.term")}
              delta={t("tiers.t3.delta")}
              mitigation={t("tiers.t3.mitigation")}
              color="var(--accent, #06b6d4)"
              icon="✈️"
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
              <Card padding={16} gap={4} styles={{ fontFamily: "monospace" }}>
                {[
                  "G  — Target Asset Price (Base Value)",
                  "N  — Number of participants in the group",
                  "d  — Downpayment percentage (varies by tier)",
                  "δ  — Annual Price Delta (+ inflation / − depreciation)",
                  "r  — Annual Treasury Yield (e.g., CETES at 0.065)",
                  "T  — Total term in years",
                  "M  — Total term in months (M = T × 12)",
                  "m  — Current month index",
                ].map((v) => (
                  <Typography
                    key={v}
                    styles={{ lineHeight: 1.8 }}
                    color="var(--foreground)"
                  >
                    {v}
                  </Typography>
                ))}
              </Card>
            </Box>

            <FormulaCard
              label="A. Dynamic Price Adjustment (Delta Curve)"
              description="Calculates the actual cost to purchase the asset at month m."
              formula="G_m = G × (1 + δ)^(m/12)"
            />
            <FormulaCard
              label="B. Fixed Monthly Payment (Delta Adjusted)"
              description="Averages the changing asset price over the term to lock in a fixed monthly payment."
              formula="P = [G × (1 + δ × T/2) − G × d] / M"
            />
            <FormulaCard
              label="C. Escrow Release Threshold (Tier 3)"
              description="Payout is locked until total paid contributions plus downpayment reach 60% of current asset cost."
              formula="ΣP_k + (G × d) ≥ G_m × c"
            />
            <FormulaCard
              label="D. Treasury Ledger & Monthly Balance"
              description="Total platform liquidity pool accounting for contributions, yield, payouts, and insurance premiums."
              formula="B_m = B_{m-1} + (N × P) + (B_{m-1} × r/12) − G_m − I_m"
            />
          </Section>

          {/* Section 4: Agentic Task Breakdown */}
          <Section title={t("section.taskBreakdown")}>
            {/* Phase 1 */}
            <PhaseHeader phase="1" label={t("phase.be")} />
            <TaskTable
              tasks={[
                {
                  id: "BE-01",
                  component: "Core DB & Ledger",
                  directive:
                    "Build User, Group, AssetCategory, and LedgerEntry models. AssetCategory fields: max_term, delta_rate, requires_insurance, escrow_threshold. LedgerEntry MUST be append-only. No updates/deletes.",
                },
                {
                  id: "BE-02",
                  component: "Multi-Vertical Simulator API",
                  directive:
                    "Build stateless endpoint /api/v1/simulate/. Inputs: G, T, d, category_id. Apply Delta Curve formulas to return N, P and mitigation string.",
                },
                {
                  id: "BE-03",
                  component: "Group Matching Algo",
                  directive:
                    'Build /api/v1/groups/match/. Group KYC-verified users by matching P within 5% variance. Create a Group instance when N target is met. Set status to "AWAITING_DOWNPAYMENT".',
                },
                {
                  id: "BE-04",
                  component: "Treasury Yield Worker",
                  directive:
                    "Celery task running nightly. Calculate yield for active groups: (balance × (r / 365)). Append YIELD ledger entry.",
                },
                {
                  id: "BE-05",
                  component: "Insurance & Fees Worker",
                  directive:
                    "Celery task running monthly. Check requires_insurance flag. If true, deduct premium and append INSURANCE_FEE ledger entry.",
                },
                {
                  id: "BE-06",
                  component: "Smart Payout Queue",
                  directive:
                    "Monthly Celery task. If B_m ≥ G_m, check category escrow rules. If threshold passed, execute PAYOUT ledger entry. Queue order determined by joined date and secure hash.",
                },
              ]}
            />

            {/* Phase 2 */}
            <PhaseHeader phase="2" label={t("phase.fe")} />
            <TaskTable
              tasks={[
                {
                  id: "FE-01",
                  component: "Omni-Simulator UI",
                  directive:
                    "Build Simulator.tsx client component. Use tabs for Asset Type (House, Car, Travel). Dynamically adjust slider limits per tier. Debounce calls to /api/v1/simulate/.",
                },
                {
                  id: "FE-02",
                  component: "Contract & Mitigation UI",
                  directive:
                    "Build dynamic warning rendering. Show mandatory insurance acknowledgment for Tier 2. Show visual 60% Escrow Unlock progress bar for Tier 3.",
                },
                {
                  id: "FE-03",
                  component: "Auth & KYC Flow",
                  directive:
                    "Implement NextAuth. Build onboarding wizard capturing ID. Integrate Stripe Elements to capture a pre-authorization hold for Tier 3.",
                },
                {
                  id: "FE-04",
                  component: "User Dashboard UI",
                  directive:
                    "Fetch user ledger data. Build modular Recharts components: QueueTimeline.tsx showing queue position, and TreasuryChart.tsx tracking group balance (B_m) and yield over time.",
                },
              ]}
            />

            {/* Phase 3 */}
            <PhaseHeader phase="3" label={t("phase.do")} />
            <TaskTable
              tasks={[
                {
                  id: "DO-01",
                  component: "Dockerization",
                  directive:
                    "Write multi-stage Dockerfiles for Next.js, Django, and Celery workers. Optimize for slim production images.",
                },
                {
                  id: "DO-02",
                  component: "K8s Manifests",
                  directive:
                    "Create deployment.yaml and service.yaml. Provision two distinct Celery deployments: worker-general and worker-financial-critical. Configure Liveness/Readiness probes.",
                },
                {
                  id: "DO-03",
                  component: "Ingress & TLS",
                  directive:
                    "Configure Ingress controller with routing rules (/api/* to backend, / to frontend). Configure cert-manager for automated Let's Encrypt certificates.",
                },
                {
                  id: "DO-04",
                  component: "Immutable DB Config",
                  directive:
                    "Deploy PostgreSQL StatefulSet with PersistentVolumeClaims (PVCs). Define ConfigMaps and Secrets for environment variables.",
                },
                {
                  id: "DO-05",
                  component: "Disaster Recovery",
                  directive:
                    "Configure a K8s CronJob to trigger pg_dump every 12 hours, piped directly to an encrypted object storage bucket.",
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      display="flex"
      flexDirection="row"
      gap={12}
      padding="8px 0"
      styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
    >
      <Typography
        fontWeight={600}
        styles={{ minWidth: 120 }}
        color="var(--muted-foreground, #6b7280)"
      >
        {label}
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
}: {
  tier: string;
  name: string;
  term: string;
  delta: string;
  mitigation: string;
  color: string;
  icon: string;
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
          backgroundColor: "var(--surface-2)",
        }}
      >
        <Typography>{icon}</Typography>
        <Typography fontWeight={700} color="var(--foreground)">
          Tier {tier}: {name}
        </Typography>
      </Box>
      <Box display="flex" flexDirection="column" gap={0}>
        <Box
          display="flex"
          padding="8px 16px"
          gap={8}
          styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        >
          <Typography
            styles={{ minWidth: 90 }}
            fontWeight={600}
            color="var(--muted-foreground)"
          >
            Term
          </Typography>
          <Typography
            styles={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
            color="var(--foreground)"
          >
            {term}
          </Typography>
        </Box>
        <Box
          display="flex"
          padding="8px 16px"
          gap={8}
          styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        >
          <Typography
            styles={{ minWidth: 90 }}
            fontWeight={600}
            color="var(--muted-foreground)"
          >
            Price Delta (δ)
          </Typography>
          <Typography
            styles={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
            color="var(--foreground)"
          >
            {delta}
          </Typography>
        </Box>
        <Box display="flex" padding="8px 16px" gap={8}>
          <Typography
            styles={{ minWidth: 90 }}
            fontWeight={600}
            color="var(--muted-foreground)"
          >
            Mitigation
          </Typography>
          <Typography
            styles={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
            color="var(--foreground)"
          >
            {mitigation}
          </Typography>
        </Box>
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
        styles={{ fontFamily: "monospace" }}
      >
        <Typography
          styles={{ fontFamily: "monospace", letterSpacing: 0.3 }}
          color="var(--accent, #06b6d4)"
        >
          {formula}
        </Typography>
      </Box>
    </Card>
  );
}

function PhaseHeader({ phase, label }: { phase: string; label: string }) {
  return (
    <Box
      padding="8px 14px"
      borderRadius={6}
      backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)"
    >
      <Typography fontWeight={700} color="var(--foreground)">
        Phase {phase}: {label}
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
