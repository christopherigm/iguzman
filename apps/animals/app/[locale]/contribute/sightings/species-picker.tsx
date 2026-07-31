"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { TextInput } from "@repo/ui/core-elements/text-input";
import type { Kind } from "@/lib/catalog";

/**
 * "What did you see?" - the cascade that names a sighting's species when the URL
 * did not.
 *
 * The sighting flow is normally entered from a page that already names its
 * subject (a species page, a sighting page), and then this component is not
 * rendered at all. It exists for the **category** page's FAB, which knows the
 * branch and the category but not which of that category's species was seen -
 * and for a bare `/contribute/sightings`, which knows none of the three.
 *
 * Three things worth knowing:
 *
 * - **It narrows, it does not fetch.** Every enabled species is already in
 *   `options` (see `getAllSpecies`), projected down to the five fields below, so
 *   changing the branch re-filters an array rather than making a request. That is
 *   what lets the three controls answer instantly on a phone, and it is why the
 *   page hands over a projection rather than the API's own species rows.
 * - **Each step is only revealed once the one above it is answered.** A category
 *   select over every category in the catalog, or a species field over every
 *   species, is a list nobody can use - the narrowing *is* the control. Arriving
 *   with `?category=` therefore lands on all three at once with the first two
 *   already answered, which is the common path.
 * - **The species field is a searchable `TextInput`, the other two are
 *   `Select`s.** Five branches and a handful of categories are where a phone's
 *   native picker wins; a category's species list is not (see `@repo/ui`'s
 *   CLAUDE.md → "When the list is long").
 */

/**
 * All the form needs of a species to file an entry against it: the id it submits,
 * the slug it links back to, and the localized name it prints. Deliberately not
 * the API's `Species` - the payload's galleries and descriptions have no business
 * crossing the wire, and the name pair is resolved for the locale by the page.
 *
 * Split from `SpeciesChoice` because the two arrive by different routes: a
 * species named in the URL is read from the catalog and is simply *the* subject,
 * while a species the picker offers also has to be filterable. Requiring the
 * branch and the category of both would make a catalog row with either missing
 * unfileable, for a pair of fields nothing in that path reads.
 */
export interface SpeciesSubject {
  id: number;
  slug: string;
  /** Localized common name. */
  name: string;
}

/** One species as the *picker* needs it: a subject, plus what narrows to it. */
export interface SpeciesChoice extends SpeciesSubject {
  kind: Kind;
  categorySlug: string;
  /** Localized category name - the middle step's label. */
  categoryName: string;
}

interface Props {
  /** Every species that can be filed against, sorted by category then name. */
  options: SpeciesChoice[];
  /** The branch the FAB's page was under, when it had one. */
  initialKind?: Kind | null;
  /** The category the FAB's page was, when it was one. */
  initialCategorySlug?: string | null;
  /** The chosen species' id, or `""` while nothing is chosen. */
  value: string;
  onChange: (choice: SpeciesChoice | null) => void;
}

export function SpeciesPicker({
  options,
  initialKind,
  initialCategorySlug,
  value,
  onChange,
}: Props) {
  const t = useTranslations("Contribute");
  const tKinds = useTranslations("Kinds");

  // Prefilled from the query params, and editable from there: a contributor who
  // pressed the FAB on the wrong page must be able to correct it here rather
  // than going back for a different one.
  const [kind, setKind] = useState<string>(initialKind ?? "");
  const [categorySlug, setCategorySlug] = useState<string>(
    initialCategorySlug ?? "",
  );

  /**
   * The branches that actually have something to file against. Derived from the
   * options rather than from `KINDS`: a site with no fungi catalogued yet would
   * otherwise offer a branch whose category select is empty, which reads as a
   * broken control rather than as an empty branch.
   */
  const branches: SelectOption[] = useMemo(() => {
    const seen = new Set<Kind>();
    for (const option of options) seen.add(option.kind);
    return [
      { value: "", label: t("pickBranch") },
      ...[...seen].map((value) => ({ value, label: tKinds(value) })),
    ];
  }, [options, t, tKinds]);

  /** The chosen branch's categories, in the order the page sorted them. */
  const categories: SelectOption[] = useMemo(() => {
    if (!kind) return [];
    const seen = new Map<string, string>();
    for (const option of options) {
      if (option.kind === kind)
        seen.set(option.categorySlug, option.categoryName);
    }
    return [
      { value: "", label: t("pickCategory") },
      ...[...seen].map(([slug, label]) => ({ value: slug, label })),
    ];
  }, [options, kind, t]);

  /** The chosen category's species, in the order the page sorted them. */
  const species: SelectOption[] = useMemo(() => {
    if (!categorySlug) return [];
    return options
      .filter((option) => option.categorySlug === categorySlug)
      .map((option) => ({ value: String(option.id), label: option.name }));
  }, [options, categorySlug]);

  return (
    <Box flexDirection="column" gap={16}>
      <Select
        label={t("branch")}
        value={kind}
        onChange={(next) => {
          setKind(next);
          // A branch change invalidates both answers below it - the old category
          // is not in the new branch, and the old species is not in the old
          // category any more either.
          setCategorySlug("");
          onChange(null);
        }}
        options={branches}
      />

      {kind !== "" && (
        <Select
          label={t("category")}
          value={categorySlug}
          onChange={(next) => {
            setCategorySlug(next);
            onChange(null);
          }}
          options={categories}
        />
      )}

      {categorySlug !== "" && (
        // A `TextInput` with `options` rather than a `Select`, exactly as the
        // place field below is: a well-stocked category runs past what a native
        // dropdown can be scrolled through, and typing a name is faster than
        // finding it either way.
        <TextInput
          label={t("species")}
          value={value}
          onChange={(next) =>
            onChange(
              options.find((option) => String(option.id) === next) ?? null,
            )
          }
          options={species}
          noOptionsLabel={t("noSpeciesMatches")}
          helperText={t("speciesHelp")}
        />
      )}
    </Box>
  );
}
