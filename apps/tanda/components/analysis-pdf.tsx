import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { LogoMark } from "./logo-pdf";

// Helvetica cannot draw emoji glyphs (they surface as broken boxes and are
// stripped from body text by `clean`). Registering an emoji source lets the
// card icons render as Twemoji images instead. Fetched lazily from the CDN the
// first time the user exports, so it adds no weight to the initial bundle.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
});

// Fixed attribution shown in the page footer. Mirrors the simulation export.
const FOOTER_TEXT =
  "TandaOmni - https://tanda.iguzman.com.mx - Diplomado de Desarrollo y Optimización de Sitios Web 1° - UNAM - Christopher Guzman";

const ACCENT = "#06b6d4";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

// ── Content model ────────────────────────────────────────────────────────────
// A section is a heading plus an ordered list of blocks. The block union covers
// every shape the Product Analysis renders (key/value rows, persona cards,
// variable tables, formulas, task lists, paragraphs, tag lists, subheadings),
// so the export reads as a Product Requirements Document.

export interface PdfKeyValue {
  label: string;
  value: string;
}

export interface PdfCard {
  title: string;
  badge?: string;
  /** Emoji icon shown beside the title (rendered via the Twemoji source). */
  icon?: string;
  /** Plain hex accent color for the card's left border and badge. */
  accent?: string;
  rows: PdfKeyValue[];
}

export interface PdfTask {
  id: string;
  component: string;
  directive: string;
}

export type PdfBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "keyValue"; rows: PdfKeyValue[] }
  | { kind: "tags"; label?: string; tags: string[] }
  | { kind: "cards"; cards: PdfCard[]; columns?: number }
  | { kind: "varTable"; rows: { symbol: string; description: string }[] }
  | { kind: "formula"; label: string; description: string; formula: string }
  | { kind: "tasks"; tasks: PdfTask[] };

export interface PdfSection {
  id: string;
  heading: string;
  blocks: PdfBlock[];
}

export interface AnalysisPdfProps {
  title: string;
  subtitle: string;
  generatedOn: string;
  sections: PdfSection[];
  disclaimer: string;
}

// Emoji / pictographic ranges Helvetica cannot render (they surface as broken
// boxes). Stripped from every string so the PDF stays clean. Mirrors the regex
// used by the simulation export.
const EMOJI_RE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu;

function clean(text: string): string {
  return text
    .replace(EMOJI_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 11,
    color: "#374151",
    marginBottom: 4,
    lineHeight: 1.4,
  },
  generatedOn: {
    fontSize: 9,
    color: MUTED,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: ACCENT,
    paddingBottom: 4,
  },
  subheading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 5,
  },
  paragraph: {
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.5,
    marginBottom: 6,
    textAlign: "justify",
  },
  // key/value rows (stacked label above value, like the on-screen InfoRow)
  kvRow: {
    marginBottom: 6,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  kvLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    marginBottom: 2,
  },
  kvValue: {
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.5,
  },
  // persona / tier cards - laid out three per row
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  card: {
    borderWidth: 0.5,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 7,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 5,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  cardIcon: {
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    flex: 1,
  },
  badge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 5,
    alignSelf: "flex-start",
  },
  cardRow: {
    marginBottom: 4,
  },
  cardRowLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    marginBottom: 1,
  },
  cardRowValue: {
    fontSize: 10,
    color: "#111827",
    lineHeight: 1.45,
  },
  // variable table
  varRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  varSymbol: {
    width: 36,
    fontSize: 10,
    fontFamily: "Courier-Bold",
    color: ACCENT,
  },
  varDesc: {
    flex: 1,
    fontSize: 10,
    color: "#111827",
  },
  // formula block
  formulaWrap: {
    marginBottom: 8,
  },
  formulaLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 2,
  },
  formulaDesc: {
    fontSize: 9,
    color: MUTED,
    marginBottom: 4,
    lineHeight: 1.45,
  },
  formulaBox: {
    backgroundColor: "#f9fafb",
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  formula: {
    fontFamily: "Courier",
    fontSize: 10,
    color: "#111827",
  },
  // task / user-story rows
  taskRow: {
    marginBottom: 7,
  },
  taskHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  taskId: {
    fontSize: 9,
    fontFamily: "Courier-Bold",
    color: ACCENT,
  },
  taskComponent: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    flex: 1,
  },
  taskDirective: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.45,
  },
  // tag list
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 4,
  },
  tag: {
    fontSize: 9,
    color: "#374151",
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 5,
    backgroundColor: "#f9fafb",
  },
  disclaimer: {
    fontSize: 8,
    color: MUTED,
    fontStyle: "italic",
    marginTop: 8,
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

function KeyValueRows({ rows }: { rows: PdfKeyValue[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <View key={i} style={styles.kvRow} wrap={false}>
          <Text style={styles.kvLabel}>{clean(r.label)}</Text>
          <Text style={styles.kvValue}>{clean(r.value)}</Text>
        </View>
      ))}
    </>
  );
}

function CardBlock({ card, width }: { card: PdfCard; width: string }) {
  return (
    <View
      style={[
        styles.card,
        { width },
        card.accent ? { borderLeftColor: card.accent } : {},
      ]}
      wrap={false}
    >
      <View style={styles.cardHeader}>
        {/* Rendered raw (not via `clean`) so the Twemoji source can draw it. */}
        {card.icon ? <Text style={styles.cardIcon}>{card.icon}</Text> : null}
        <Text style={styles.cardTitle}>{clean(card.title)}</Text>
      </View>
      {card.badge ? (
        <Text
          style={[styles.badge, card.accent ? { color: card.accent } : {}]}
        >
          {clean(card.badge)}
        </Text>
      ) : null}
      {card.rows.map((r, i) => (
        <View key={i} style={styles.cardRow}>
          <Text style={styles.cardRowLabel}>{clean(r.label)}</Text>
          <Text style={styles.cardRowValue}>{clean(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function Block({ block }: { block: PdfBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <Text style={styles.paragraph}>{clean(block.text)}</Text>;
    case "subheading":
      return <Text style={styles.subheading}>{clean(block.text)}</Text>;
    case "keyValue":
      return <KeyValueRows rows={block.rows} />;
    case "tags":
      return (
        <View wrap={false}>
          {block.label ? (
            <Text style={styles.subheading}>{clean(block.label)}</Text>
          ) : null}
          <View style={styles.tagsRow}>
            {block.tags.map((tag, i) => (
              <Text key={i} style={styles.tag}>
                {clean(tag)}
              </Text>
            ))}
          </View>
        </View>
      );
    case "cards": {
      // Per-card width derived from the requested column count (defaults to 3).
      // The 2%-shy widths leave room for the 6pt grid gap between cards.
      const columns = block.columns ?? 3;
      const width =
        columns <= 1 ? "100%" : columns === 2 ? "48%" : "32%";
      return (
        <View style={styles.cardsGrid}>
          {block.cards.map((c, i) => (
            <CardBlock key={i} card={c} width={width} />
          ))}
        </View>
      );
    }
    case "varTable":
      return (
        <View wrap={false}>
          {block.rows.map((r, i) => (
            <View key={i} style={styles.varRow}>
              <Text style={styles.varSymbol}>{r.symbol}</Text>
              <Text style={styles.varDesc}>{clean(r.description)}</Text>
            </View>
          ))}
        </View>
      );
    case "formula":
      return (
        <View style={styles.formulaWrap} wrap={false}>
          <Text style={styles.formulaLabel}>{clean(block.label)}</Text>
          <Text style={styles.formulaDesc}>{clean(block.description)}</Text>
          <View style={styles.formulaBox}>
            <Text style={styles.formula}>{block.formula}</Text>
          </View>
        </View>
      );
    case "tasks":
      return (
        <>
          {block.tasks.map((task, i) => (
            <View key={i} style={styles.taskRow} wrap={false}>
              <View style={styles.taskHead}>
                <Text style={styles.taskId}>{task.id}</Text>
                <Text style={styles.taskComponent}>
                  {clean(task.component)}
                </Text>
              </View>
              <Text style={styles.taskDirective}>{clean(task.directive)}</Text>
            </View>
          ))}
        </>
      );
    default:
      return null;
  }
}

function SectionBlock({
  section,
  breakBefore,
}: {
  section: PdfSection;
  breakBefore: boolean;
}) {
  return (
    <View style={styles.section} break={breakBefore}>
      <Text style={styles.sectionTitle}>{clean(section.heading)}</Text>
      {section.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </View>
  );
}

export function AnalysisDocument({
  title,
  subtitle,
  generatedOn,
  sections,
  disclaimer,
}: AnalysisPdfProps) {
  return (
    <Document title={title}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <LogoMark />
          <View style={styles.headerText}>
            <Text style={styles.title}>{clean(title)}</Text>
            <Text style={styles.subtitle}>{clean(subtitle)}</Text>
            <Text style={styles.generatedOn}>{generatedOn}</Text>
          </View>
        </View>

        {sections.map((section, i) => (
          <SectionBlock
            key={section.id}
            section={section}
            breakBefore={i > 0}
          />
        ))}

        <Text style={styles.disclaimer}>{clean(disclaimer)}</Text>

        <Text style={styles.footer} fixed>
          {FOOTER_TEXT}
        </Text>
      </Page>
    </Document>
  );
}

export default AnalysisDocument;
