"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import { listProducts, listServices, listMenuItems } from "@/lib/admin-api";
import type { SpotlightRef } from "@/lib/system";

/**
 * The CMS control for hand-picking catalog items out of all three Buyable
 * families - a row of "None / Product · Espresso / Service · Haircut / …"
 * selects writing an ordered list of `{kind, id}` refs.
 *
 * Two CMS surfaces author that same relation with the same shape - the Featured
 * Spotlight's trio (`System.spotlight_items`) and a homepage flyer's pair
 * (`HomepageFlyer.items`) - so the fetch, the option labels and the
 * encode/decode live here rather than in whichever page needed them first. It
 * differs from `RecommendationsEditor` in what it is: that one is an unbounded,
 * order-as-you-select list grouped by family, this is a fixed number of slots
 * where slot 1 is the first card on the page.
 *
 * The catalog is fetched per tenant, which is why this is a component and not a
 * `FieldDef` on the flat admin form.
 */

/** `${kind}:${id}` keeps all three families in a single `Select`. */
const REF_SEPARATOR = ":";

/** Encode a ref for a Select value; "" is the "None" option. */
export function encodeRef(ref: SpotlightRef | undefined): string {
  return ref ? `${ref.kind}${REF_SEPARATOR}${ref.id}` : "";
}

/** Decode a Select value back to a ref, or null for the "None" option. */
export function decodeRef(value: string): SpotlightRef | null {
  if (!value) return null;
  const [kind, id] = value.split(REF_SEPARATOR);
  const numericId = Number(id);
  if (!kind || Number.isNaN(numericId)) return null;
  return { kind: kind as SpotlightRef["kind"], id: numericId };
}

/**
 * Replace the ref in slot `index`, then compact the list.
 *
 * Compacting matters: an emptied middle slot would otherwise leave a hole the
 * frontend skips over silently, so the operator would see two gaps where they
 * cleared one.
 */
export function setRefSlot(
  refs: SpotlightRef[],
  slots: number,
  index: number,
  value: string,
): SpotlightRef[] {
  const next: (SpotlightRef | null)[] = Array.from(
    { length: slots },
    (_, i) => refs[i] ?? null,
  );
  next[index] = decodeRef(value);
  return next.filter((ref): ref is SpotlightRef => ref !== null);
}

/** Build the option list for one family from an admin catalog listing. */
function toOptions(
  rows: Record<string, unknown>[],
  kind: SpotlightRef["kind"],
  prefix: string,
): SelectOption[] {
  return rows
    .map((row) => {
      const id = Number(row.id);
      if (Number.isNaN(id)) return null;
      const name = (row.name as string) || (row.en_name as string) || `#${id}`;
      return {
        value: `${kind}${REF_SEPARATOR}${id}`,
        label: `${prefix} · ${name}`,
      };
    })
    .filter((o): o is SelectOption => o !== null);
}

/**
 * Every product, service and menu item of one tenant, as `Select` options.
 *
 * A failed fetch leaves the list empty rather than raising: the rest of the form
 * still works, and any already-saved refs round-trip untouched because they live
 * in the form's values, not in these options.
 */
export function useCatalogRefOptions(systemId: number): SelectOption[] {
  const t = useTranslations("Admin");
  const [options, setOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    if (!systemId) return;
    let cancelled = false;
    Promise.all([
      listProducts(systemId),
      listServices(systemId),
      listMenuItems(systemId),
    ])
      .then(([products, services, menuItems]) => {
        if (cancelled) return;
        setOptions([
          ...toOptions(products, "product", t("spotlightKindProduct")),
          ...toOptions(services, "service", t("spotlightKindService")),
          ...toOptions(menuItems, "food", t("spotlightKindFood")),
        ]);
      })
      .catch(() => {
        /* see the hook's docstring */
      });
    return () => {
      cancelled = true;
    };
  }, [systemId, t]);

  return options;
}

type Props = {
  /** Heading above the row of selects. */
  label: string;
  /** How many slots to render - the model's own maximum. */
  slots: number;
  value: SpotlightRef[];
  onChange: (refs: SpotlightRef[]) => void;
  options: SelectOption[];
  /** Columns each slot claims from `sm` up; defaults to an even split. */
  size?: { xs: number; sm?: number; md?: number };
};

export function CatalogRefPicker({
  label,
  slots,
  value,
  onChange,
  options,
  size,
}: Props) {
  const t = useTranslations("Admin");
  const noneOption: SelectOption = { value: "", label: t("spotlightItemNone") };
  const span = size ?? { xs: 12, md: Math.max(1, Math.round(12 / slots)) };

  return (
    <Box flexDirection="column" gap={6}>
      <Typography
        as="span"
        variant="label"
        fontWeight={600}
        color="var(--foreground)"
      >
        {label}
      </Typography>
      <Grid container spacing={2}>
        {Array.from({ length: slots }, (_, index) => (
          <Grid key={index} size={span}>
            <Select
              label={`${t("spotlightItem")} ${index + 1}`}
              value={encodeRef(value[index])}
              onChange={(v) => onChange(setRefSlot(value, slots, index, v))}
              options={[noneOption, ...options]}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
