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
  Text as SvgText,
} from "@react-pdf/renderer";

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

export interface SimulationPdfProps {
  title: string;
  subtitle: string;
  generatedOn: string;
  parametersHeading: string;
  parameters: PdfRow[];
  comparisonHeading: string;
  tandaHeading: string;
  tandaRows: PdfRow[];
  bankHeading: string;
  bankRows: PdfRow[];
  savings?: PdfRow;
  charts: PdfLineChart[];
  analysisHeading?: string;
  analysisText?: string;
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
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
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
    marginBottom: 16,
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
    paddingVertical: 10,
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

// ── Markdown-ish renderer for the AI analysis text ──────────────────────────

// Emoji / pictographic ranges that Helvetica cannot render (they surface as
// broken boxes overlapping the text). Covers emoticons, misc symbols &
// pictographs, transport, supplemental & extended pictographs, dingbats, misc
// technical/symbols, plus the variation selectors and ZWJ that join them.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

function stripInline(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(EMOJI_RE, "")
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
  parametersHeading,
  parameters,
  comparisonHeading,
  tandaHeading,
  tandaRows,
  bankHeading,
  bankRows,
  savings,
  charts,
  analysisHeading,
  analysisText,
  disclaimer,
}: SimulationPdfProps) {
  return (
    <Document title={title}>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.generatedOn}>{generatedOn}</Text>
        </View>

        {/* Parameters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{parametersHeading}</Text>
          <ResultRows rows={parameters} />
        </View>

        {/* Comparison */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>{comparisonHeading}</Text>
          <View style={styles.twoCol}>
            <View style={styles.panel}>
              <Text style={styles.panelHeadingTanda}>{tandaHeading}</Text>
              <View style={styles.panelBody}>
                <ResultRows rows={tandaRows} />
              </View>
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelHeadingBank}>{bankHeading}</Text>
              <View style={styles.panelBody}>
                <ResultRows rows={bankRows} />
              </View>
            </View>
          </View>

          {savings ? (
            <View style={styles.savings}>
              <Text style={styles.savingsLabel}>{savings.label}</Text>
              <Text style={styles.savingsValue}>{savings.value}</Text>
            </View>
          ) : null}
        </View>

        {/* AI Analysis (placed above the charts in the export per request) */}
        {analysisText && analysisHeading ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{analysisHeading}</Text>
            <AnalysisBody text={analysisText} />
          </View>
        ) : null}

        {/* Charts - each block carries its own heading (the combined chart's
            heading is the projection title), so no parent section title here. */}
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
