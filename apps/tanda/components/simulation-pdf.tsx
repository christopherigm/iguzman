import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  G,
  Line,
  Polyline,
  Path,
  Circle,
  Text as SvgText,
  Link,
  Font,
} from "@react-pdf/renderer";
import { LogoMark } from "./logo-pdf";

// Helvetica cannot draw emoji glyphs (they surface as broken boxes). Registering
// an emoji source lets emojis in the AI analysis text render as Twemoji images
// instead. Fetched lazily from the CDN the first time the user exports, so it
// adds no weight to the initial bundle. Mirrors the analysis export.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
});

// Fixed attribution shown in the page footer. Not localized - it is a credit
// line identifying the project and author, mirroring the in-app footnote.
const FOOTER_TEXT =
  "TandaOmni - https://tanda.iguzman.com.mx - Diplomado de Desarrollo y Optimización de Sitios Web 1° - UNAM - Christopher Guzman";

const ACCENT = "#06b6d4";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const SUCCESS = "#16a34a";

export interface PdfRow {
  label: string;
  value: string;
  /** Render the value in the accent color / bold (key figures). */
  highlight?: boolean;
}

export interface PdfLineChart {
  heading: string;
  note: string;
  labels: string[];
  series: { label: string; color: string; data: number[] }[];
  /** Formats a y-axis value (e.g. as a whole-unit currency amount). */
  formatTick: (value: number) => string;
}

export interface PdfPieSlice {
  label: string;
  value: number;
  color: string;
}

export interface PdfPieChart {
  /** Column heading (e.g. the TandaOmni / lender name). */
  heading: string;
  slices: PdfPieSlice[];
  /** Formats a slice value (e.g. as a whole-unit currency amount). */
  formatValue: (value: number) => string;
}

export interface PdfPieSection {
  heading?: string;
  charts: PdfPieChart[];
  /** Footnote clarifying that legend percentages are shares of the total. */
  note?: string;
}

export interface PdfSource {
  title: string;
  url: string;
  snippet: string;
}

export interface SimulationPdfProps {
  title: string;
  subtitle: string;
  generatedOn: string;
  parameters: PdfRow[];
  tandaHeading: string;
  tandaRows: PdfRow[];
  bankHeading: string;
  bankRows: PdfRow[];
  savings?: PdfRow;
  pieSection?: PdfPieSection;
  charts: PdfLineChart[];
  analysisHeading?: string;
  analysisText?: string;
  sourcesHeading?: string;
  sources?: PdfSource[];
  queriesHeading?: string;
  queries?: string[];
  disclaimer: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 8,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11,
    color: "#374151",
    marginBottom: 2,
  },
  generatedOn: {
    fontSize: 9,
    color: MUTED,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingBottom: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  rowLabel: {
    fontSize: 10,
    color: "#374151",
    flex: 1,
    paddingRight: 8,
  },
  rowValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textAlign: "right",
  },
  rowValueHighlight: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    textAlign: "right",
  },
  twoCol: {
    flexDirection: "row",
    gap: 14,
  },
  panel: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 4,
    overflow: "hidden",
  },
  panelHeadingTanda: {
    backgroundColor: ACCENT,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  panelHeadingBank: {
    backgroundColor: MUTED,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  panelBody: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  savings: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: SUCCESS,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  savingsLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  savingsValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: SUCCESS,
  },
  chartNote: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 9,
    color: "#374151",
  },
  cardPie: {
    alignItems: "center",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },
  pieLegend: {
    width: "100%",
    marginTop: 8,
  },
  pieLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 3,
  },
  pieLegendLabel: {
    flex: 1,
    fontSize: 8,
    color: "#374151",
  },
  pieLegendValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  analysisHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.5,
    marginBottom: 4,
    textAlign: "justify",
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: ACCENT,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.5,
  },
  sourceRow: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  sourceTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  sourceLink: {
    fontSize: 8,
    color: ACCENT,
    textDecoration: "underline",
    marginTop: 1,
  },
  sourceSnippet: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.4,
    marginTop: 1,
  },
  queryRow: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 3,
  },
  disclaimer: {
    fontSize: 8,
    color: MUTED,
    fontStyle: "italic",
    marginTop: 12,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
  },
});

function ResultRows({ rows }: { rows: PdfRow[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text
            style={r.highlight ? styles.rowValueHighlight : styles.rowValue}
          >
            {r.value}
          </Text>
        </View>
      ))}
    </>
  );
}

// ── SVG line chart ──────────────────────────────────────────────────────────
// Hand-drawn with @react-pdf SVG primitives (the in-app Chart is canvas-based
// and cannot render into a PDF). Plots every series on a shared currency scale.

const CHART_W = 507;
const CHART_H = 200;
const PAD_L = 58;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 26;

function LineChart({ chart }: { chart: PdfLineChart }) {
  const { labels, series, formatTick } = chart;
  const allValues = series.flatMap((s) => s.data);
  const rawMax = Math.max(0, ...allValues);
  const max = rawMax === 0 ? 1 : rawMax;
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const n = labels.length;

  const xAt = (i: number) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD_T + plotH - (v / max) * plotH;

  // Four horizontal gridlines / y-axis ticks.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  // Show at most ~8 x labels to avoid crowding.
  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Gridlines + y labels */}
      {ticks.map((tv, i) => {
        const y = yAt(tv);
        return (
          <G key={`t${i}`}>
            <Line
              x1={PAD_L}
              y1={y}
              x2={CHART_W - PAD_R}
              y2={y}
              strokeWidth={0.5}
              stroke={BORDER}
            />
            <SvgText
              x={PAD_L - 4}
              y={y + 3}
              textAnchor="end"
              style={{ fontSize: 7, fill: MUTED }}
            >
              {formatTick(tv)}
            </SvgText>
          </G>
        );
      })}

      {/* X labels */}
      {labels.map((lab, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <SvgText
            key={`x${i}`}
            x={xAt(i)}
            y={CHART_H - PAD_B + 12}
            textAnchor="middle"
            style={{ fontSize: 7, fill: MUTED }}
          >
            {lab}
          </SvgText>
        ) : null,
      )}

      {/* Series polylines */}
      {series.map((s, si) => (
        <Polyline
          key={`s${si}`}
          points={s.data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

function ChartBlock({ chart }: { chart: PdfLineChart }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{chart.heading}</Text>
      <Text style={styles.chartNote}>{chart.note}</Text>
      <LineChart chart={chart} />
      <View style={styles.legendRow}>
        {chart.series.map((s, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── SVG pie chart ───────────────────────────────────────────────────────────
// Cost-breakdown donut-less pie, drawn with @react-pdf SVG arcs (mirrors the
// canvas-based in-app pie, which cannot render into a PDF). One slice per cost
// component; the slices of a card always sum to that card's total.

const PIE_SIZE = 88;

/** SVG arc path for a pie slice spanning [start, end] radians (clockwise). */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function PieChart({ chart }: { chart: PdfPieChart }) {
  const slices = chart.slices.filter((s) => s.value > 0);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = PIE_SIZE / 2;
  // Start at the top (12 o'clock) and sweep clockwise.
  let angle = -Math.PI / 2;

  return (
    <Svg width={PIE_SIZE} height={PIE_SIZE}>
      {slices.length === 1 || total <= 0 ? (
        // A single non-zero slice is a full circle (an arc from start==end
        // collapses to nothing), so draw it directly.
        <Circle cx={r} cy={r} r={r} fill={slices[0]?.color ?? BORDER} />
      ) : (
        slices.map((s, i) => {
          const sweep = (s.value / total) * Math.PI * 2;
          const path = arcPath(r, r, r, angle, angle + sweep);
          angle += sweep;
          return <Path key={i} d={path} fill={s.color} />;
        })
      )}
    </Svg>
  );
}

// Cost-breakdown pie rendered inside a comparison card, below its rows. The
// card's own heading labels it, so the pie's heading is intentionally omitted.
function CardPie({ chart }: { chart: PdfPieChart }) {
  const total = chart.slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <View style={styles.cardPie}>
      <PieChart chart={chart} />
      <View style={styles.pieLegend}>
        {chart.slices.map((s, i) => (
          <View key={i} style={styles.pieLegendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.pieLegendLabel}>
              {s.label}
              {total > 0 ? ` · ${Math.round((s.value / total) * 100)}%` : ""}
            </Text>
            <Text style={styles.pieLegendValue}>
              {chart.formatValue(s.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Markdown-ish renderer for the AI analysis text ──────────────────────────

// Emojis are left intact so the registered Twemoji source can render them as
// images; only markdown bold/code markers and runs of whitespace are stripped.
function stripInline(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function AnalysisBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((raw, i) => {
        const line = stripInline(raw.trim());
        if (!line) return <View key={i} style={{ height: 4 }} />;
        if (line.startsWith("#")) {
          return (
            <Text key={i} style={styles.analysisHeading}>
              {line.replace(/^#+\s*/, "")}
            </Text>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          return (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>
                {line.replace(/^[-*•]\s+/, "")}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.paragraph}>
            {line}
          </Text>
        );
      })}
    </>
  );
}

export function SimulationDocument({
  title,
  subtitle,
  generatedOn,
  parameters,
  tandaHeading,
  tandaRows,
  bankHeading,
  bankRows,
  savings,
  pieSection,
  charts,
  analysisHeading,
  analysisText,
  sourcesHeading,
  sources,
  queriesHeading,
  queries,
  disclaimer,
}: SimulationPdfProps) {
  return (
    <Document title={title}>
      {/* Page 1 - parameters, comparison and cost breakdown. Section titles for
          the parameters and comparison blocks are dropped to fit all three on a
          single page; the panel/cost-breakdown headings keep them identifiable. */}
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <LogoMark />
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <Text style={styles.generatedOn}>{generatedOn}</Text>
          </View>
        </View>

        {/* Parameters (title omitted to save space) */}
        <View style={styles.section}>
          <ResultRows rows={parameters} />
        </View>

        {/* Comparison (title omitted to save space). Each card carries its own
            cost-breakdown pie below its rows (charts[0] = TandaOmni,
            charts[1] = lender, ordered by the PDF builder). */}
        <View style={styles.section} wrap={false}>
          <View style={styles.twoCol}>
            <View style={styles.panel}>
              <Text style={styles.panelHeadingTanda}>{tandaHeading}</Text>
              <View style={styles.panelBody}>
                <ResultRows rows={tandaRows} />
                {pieSection?.charts[0] ? (
                  <CardPie chart={pieSection.charts[0]} />
                ) : null}
              </View>
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelHeadingBank}>{bankHeading}</Text>
              <View style={styles.panelBody}>
                <ResultRows rows={bankRows} />
                {pieSection?.charts[1] ? (
                  <CardPie chart={pieSection.charts[1]} />
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Savings advantage banner + share-% footnote, kept directly below the
            comparison cards now that the pies live inside them. */}
        {savings || pieSection?.note ? (
          <View style={styles.section} wrap={false}>
            {pieSection?.note ? (
              <Text
                style={[styles.chartNote, { marginTop: 8, marginBottom: 0 }]}
              >
                {pieSection.note}
              </Text>
            ) : null}
            {savings ? (
              <View style={[styles.savings, { marginTop: 0 }]}>
                <Text style={styles.savingsLabel}>{savings.label}</Text>
                <Text style={styles.savingsValue}>{savings.value}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {FOOTER_TEXT}
        </Text>
      </Page>

      {/* Page 2 - AI analysis. Rendered only when an analysis exists, so the
          export never carries a blank page. */}
      {analysisText && analysisHeading ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{analysisHeading}</Text>
            <AnalysisBody text={analysisText} />
          </View>

          <Text style={styles.footer} fixed>
            {FOOTER_TEXT}
          </Text>
        </Page>
      ) : null}

      {/* Sources page - the web sources consulted and the search queries run
          (when web search is on) get their own page, so the export is traceable
          to the pages and searches it was grounded on. Rendered only when there
          is something to show, so no blank page otherwise. */}
      {(sources && sources.length > 0 && sourcesHeading) ||
      (queries && queries.length > 0 && queriesHeading) ? (
        <Page size="LETTER" style={styles.page}>
          {sources && sources.length > 0 && sourcesHeading ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{sourcesHeading}</Text>
              {sources.map((s, i) => (
                <View key={i} style={styles.sourceRow} wrap={false}>
                  <Text style={styles.sourceTitle}>{s.title || s.url}</Text>
                  <Link src={s.url} style={styles.sourceLink}>
                    {s.url}
                  </Link>
                  {s.snippet ? (
                    <Text style={styles.sourceSnippet}>{s.snippet}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {queries && queries.length > 0 && queriesHeading ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{queriesHeading}</Text>
              {queries.map((q, i) => (
                <Text key={i} style={styles.queryRow} wrap={false}>
                  • {q}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.footer} fixed>
            {FOOTER_TEXT}
          </Text>
        </Page>
      ) : null}

      {/* Charts page - the cost/price + treasury projections get their own page.
          Each block carries its own heading (the combined chart's heading is the
          projection title), so no parent section title here. The disclaimer
          trails the charts so it stays last in the document. */}
      <Page size="LETTER" style={styles.page}>
        {charts.map((c, i) => (
          <ChartBlock key={i} chart={c} />
        ))}

        <Text style={styles.disclaimer}>{disclaimer}</Text>

        <Text style={styles.footer} fixed>
          {FOOTER_TEXT}
        </Text>
      </Page>
    </Document>
  );
}

export default SimulationDocument;
