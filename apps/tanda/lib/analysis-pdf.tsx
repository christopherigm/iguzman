// ─── Analysis PDF Export ─────────────────────────────────────────────────────
//
// Assembles the fully-localized, presentation-ready payload for the Product
// Analysis PDF and triggers the download. All strings are resolved here (the
// document in `components/analysis-pdf.tsx` stays a pure view) by iterating over
// the shared structural constants in `analysis-content.ts`, so the export tracks
// exactly what the page renders. The Infrastructure section deliberately omits
// the server photo - the PDF is a text Product Requirements Document.

import type { Translate } from "./simulation-pdf";
import type { AnalysisPdfProps, PdfSection } from "../components/analysis-pdf";

export type { Translate };
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
} from "./analysis-content";

export interface BuildAnalysisPdfParams {
  t: Translate;
  locale: string;
}

// The content constants store palette colors as CSS custom properties with a
// hex fallback (e.g. "var(--success, #16a34a)"). react-pdf has no concept of
// CSS variables, so collapse the value down to the plain hex it can render.
// Already-plain hex values (e.g. "#7c3aed") pass through untouched.
function pdfColor(value: string): string {
  const hex = value.match(/#[0-9a-fA-F]{3,8}/);
  return hex ? hex[0] : value;
}

export function buildAnalysisPdfData({
  t,
  locale,
}: BuildAnalysisPdfParams): AnalysisPdfProps {
  const sections: PdfSection[] = [
    // 1. Project Overview
    {
      id: "overview",
      heading: t("section.overview"),
      blocks: [
        {
          kind: "keyValue",
          rows: OVERVIEW_ROWS.map((r) => ({
            label: t(`overview.${r.labelKey}`),
            value: t(`overview.${r.valueKey}`),
          })),
        },
      ],
    },
    // 2. Stakeholder Profiles
    {
      id: "stakeholders",
      heading: t("section.stakeholders"),
      blocks: [
        {
          kind: "cards",
          columns: 2,
          cards: STAKEHOLDERS.map((s) => ({
            title: t(`stakeholders.${s.key}.name`),
            icon: s.icon,
            accent: pdfColor(s.accent),
            badge: t(
              s.category === "user"
                ? "stakeholders.categoryUser"
                : "stakeholders.categoryPlatform",
            ),
            rows: [
              {
                label: t("stakeholders.goalLabel"),
                value: t(`stakeholders.${s.key}.goal`),
              },
              {
                label: t("stakeholders.profileLabel"),
                value: t(`stakeholders.${s.key}.profile`),
              },
            ],
          })),
        },
      ],
    },
    // 3. Core Risk Verticals
    {
      id: "riskVerticals",
      heading: t("section.riskVerticals"),
      blocks: [
        {
          kind: "cards",
          columns: 1,
          cards: TIER_DEFS.map((td) => ({
            title: `${t("tierLabels.tierPrefix")} ${td.tier}: ${t(
              `tiers.${td.key}.name`,
            )}`,
            icon: td.icon,
            accent: pdfColor(td.color),
            rows: [
              { label: t("tierLabels.term"), value: t(`tiers.${td.key}.term`) },
              {
                label: t("tierLabels.delta"),
                value: t(`tiers.${td.key}.delta`),
              },
              {
                label: t("tierLabels.mitigation"),
                value: t(`tiers.${td.key}.mitigation`),
              },
            ],
          })),
        },
      ],
    },
    // 4. Mathematical Risk Models
    {
      id: "mathModels",
      heading: t("section.mathModels"),
      blocks: [
        { kind: "subheading", text: t("math.universalVarsLabel") },
        {
          kind: "varTable",
          rows: MATH_VARS.map((v) => ({
            symbol: MATH_VAR_SYMBOLS[v],
            description: t(`vars.${v}`),
          })),
        },
        ...FORMULAS.map(
          (f) =>
            ({
              kind: "formula",
              label: t(`formulas.${f.key}.label`),
              description: t(`formulas.${f.key}.description`),
              formula: f.formula,
            }) as const,
        ),
      ],
    },
    // 5. User Stories
    {
      id: "userStories",
      heading: t("section.userStories"),
      blocks: [
        {
          kind: "tasks",
          tasks: USER_STORY_KEYS.map((k) => ({
            id: taskDisplayId(k),
            component: t(`userStories.${k}.component`),
            directive: t(`userStories.${k}.directive`),
          })),
        },
      ],
    },
    // 6. Task Breakdown
    {
      id: "taskBreakdown",
      heading: t("section.taskBreakdown"),
      blocks: TASK_PHASES.flatMap((p) => [
        {
          kind: "subheading" as const,
          text: `${t("phasePrefix")} ${p.phase}: ${t(`phase.${p.labelKey}`)}`,
        },
        {
          kind: "tasks" as const,
          tasks: p.taskIds.map((id) => ({
            id: taskDisplayId(id),
            component: t(`tasks.${id}.component`),
            directive: t(`tasks.${id}.directive`),
          })),
        },
      ]),
    },
    // 7. Infrastructure & Deployment (no image - text-only PRD section)
    {
      id: "infrastructure",
      heading: t("section.infrastructure"),
      blocks: [
        { kind: "paragraph", text: t("infra.intro") },
        {
          kind: "tags",
          label: t("infra.techStackLabel"),
          tags: [...TECH_STACK],
        },
        { kind: "subheading", text: t("infra.deployLabel") },
        {
          kind: "keyValue",
          rows: INFRA_SPEC_KEYS.map((k) => ({
            label: t(`infra.specs.${k}Label`),
            value: t(`infra.specs.${k}`),
          })),
        },
      ],
    },
  ];

  return {
    title: t("heading"),
    subtitle: t("subtitle"),
    generatedOn: t("pdf.generatedOn", {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
        new Date(),
      ),
    }),
    sections,
    disclaimer: t("pdf.disclaimer"),
  };
}

/**
 * Renders the analysis PDF to a blob and triggers a browser download.
 * `@react-pdf/renderer` and the document component are imported dynamically so
 * they stay out of the initial bundle until the user actually exports.
 */
export async function downloadAnalysisPdf(
  data: AnalysisPdfProps,
  fileLabel: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { AnalysisDocument } = await import("../components/analysis-pdf");
  const blob = await pdf(<AnalysisDocument {...data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileLabel}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}
