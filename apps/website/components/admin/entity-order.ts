/**
 * How a CMS entity list is *ordered on screen*, split out of
 * `admin-entity-list.tsx` so the detail pages' prev/next arrows can walk the
 * same sequence the table shows without importing the table itself.
 *
 * The three catalog lists (products, services, menu items) render one
 * collapsible section per category rather than one flat table, so "the next
 * record" is not "the next row the API returned" - it is the next one in the
 * flattened section order. That flattening lives here, in one place, for both
 * consumers.
 */

export interface EntityGroup {
  /** Matched against each row's `grouping.key` field. */
  id: number | string;
  label: string;
}

/**
 * The grouping without its heading - everything that decides *order*. It is
 * what a consumer that never renders a section header (the prev/next arrows)
 * needs, and what `EntityGrouping` adds a label to.
 */
export interface EntityOrdering {
  /** The row field holding the group's id (e.g. `"category"`). */
  key: string;
  /**
   * The groups, in the order their sections are rendered - i.e. the categories
   * in their own CMS order, which is what the list is expected to read as.
   * Groups with no rows are dropped rather than shown empty, as the storefront's
   * own category sections are.
   */
  groups: EntityGroup[];
}

export interface EntityGrouping extends EntityOrdering {
  /**
   * Heading for the trailing section holding every row whose group field is
   * empty - and any row pointing at a group that is not in `groups`, so that a
   * row can never fall off the list.
   */
  uncategorizedLabel: string;
}

/** A row together with its index in the list the drag handlers splice against. */
export interface IndexedRow {
  row: Record<string, unknown>;
  index: number;
}

export interface Section {
  key: string;
  label: string;
  rows: IndexedRow[];
}

/** The section key for a row with no group, and for the section holding them. */
export const UNGROUPED = "__ungrouped__";

export function groupKeyOf(
  row: Record<string, unknown> | undefined,
  grouping: EntityOrdering | undefined,
): string {
  if (!row || !grouping) return UNGROUPED;
  const raw = row[grouping.key];
  return raw === null || raw === undefined || raw === ""
    ? UNGROUPED
    : String(raw);
}

/**
 * Splits `rows` into the sections to render: one per group that has rows, in the
 * caller's group order, then everything left over under `uncategorizedLabel` -
 * rows with no group **and** rows pointing at a group the caller did not list, so
 * that no record can drop off the page. Ungrouped lists come back as one
 * section, which is what keeps the plain table on a single code path.
 */
export function buildSections(
  rows: Record<string, unknown>[],
  grouping: EntityGrouping | undefined,
): Section[] {
  const indexed: IndexedRow[] = rows.map((row, index) => ({ row, index }));
  if (!grouping) return [{ key: UNGROUPED, label: "", rows: indexed }];

  const known = new Set(grouping.groups.map((g) => String(g.id)));
  const byGroup = new Map<string, IndexedRow[]>();
  const leftover: IndexedRow[] = [];
  for (const entry of indexed) {
    const key = groupKeyOf(entry.row, grouping);
    if (!known.has(key)) {
      leftover.push(entry);
      continue;
    }
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(entry);
    else byGroup.set(key, [entry]);
  }

  const sections = grouping.groups
    .map((group) => ({
      key: String(group.id),
      label: group.label,
      rows: byGroup.get(String(group.id)) ?? [],
    }))
    .filter((section) => section.rows.length > 0);

  if (leftover.length > 0) {
    sections.push({
      key: UNGROUPED,
      label: grouping.uncategorizedLabel,
      rows: leftover,
    });
  }
  return sections;
}

/**
 * The rows in the order the list page actually reads - the flattened section
 * order for a grouped list, the API's own order for a plain one. The heading is
 * irrelevant here, so this takes an `EntityOrdering` rather than a full
 * `EntityGrouping`.
 */
export function listedRows(
  rows: Record<string, unknown>[],
  ordering?: EntityOrdering,
): Record<string, unknown>[] {
  const grouping = ordering
    ? { ...ordering, uncategorizedLabel: "" }
    : undefined;
  return buildSections(rows, grouping).flatMap((s) => s.rows.map((r) => r.row));
}
