"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  BilingualAssistGroup,
  type BilingualPair,
} from "@/components/admin/bilingual-assist-group";
import { listProducts, listServices, listMenuItems } from "@/lib/admin-api";
import type { SpotlightRef } from "@/lib/system";

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** The current tenant, so the picker lists only this site's catalog. */
  systemId: number;
};

/** One family's items are keyed `${kind}:${id}` so a single Select can mix all
 *  three families. `food` is the MenuItem family (the frontend's kind name). */
type SpotlightKind = SpotlightRef["kind"];

const REF_SEPARATOR = ":";

/** The four bilingual copy pairs, in render order. `labelKey` is the `Admin`
 *  namespace key for the pair's section header; only Text is multi-line (so it
 *  alone gets Speech + Enhance - the rest get Translate). */
const COPY_PAIRS: (Omit<BilingualPair, "groupLabel"> & { labelKey: string })[] =
  [
    {
      esKey: "spotlight_label",
      enKey: "en_spotlight_label",
      type: "text",
      labelKey: "spotlightFieldLabel",
    },
    {
      esKey: "spotlight_title",
      enKey: "en_spotlight_title",
      type: "text",
      labelKey: "spotlightFieldTitle",
    },
    {
      esKey: "spotlight_text",
      enKey: "en_spotlight_text",
      type: "textarea",
      rows: 3,
      labelKey: "spotlightFieldText",
    },
    {
      esKey: "spotlight_button_label",
      enKey: "en_spotlight_button_label",
      type: "text",
      labelKey: "spotlightFieldButton",
    },
  ];

/** Encode a ref for a Select value; "" is the "None" option. */
function encodeRef(ref: SpotlightRef | undefined): string {
  return ref ? `${ref.kind}${REF_SEPARATOR}${ref.id}` : "";
}

/** Decode a Select value back to a ref, or null for the "None" option. */
function decodeRef(value: string): SpotlightRef | null {
  if (!value) return null;
  const [kind, id] = value.split(REF_SEPARATOR);
  const numericId = Number(id);
  if (!kind || Number.isNaN(numericId)) return null;
  return { kind: kind as SpotlightKind, id: numericId };
}

/** Build the option list for one family from an admin catalog listing. */
function toOptions(
  rows: Record<string, unknown>[],
  kind: SpotlightKind,
  prefix: string,
): SelectOption[] {
  return rows
    .map((row) => {
      const id = Number(row.id);
      if (Number.isNaN(id)) return null;
      const name =
        (row.name as string) || (row.en_name as string) || `#${id}`;
      return {
        value: `${kind}${REF_SEPARATOR}${id}`,
        label: `${prefix} · ${name}`,
      };
    })
    .filter((o): o is SelectOption => o !== null);
}

/**
 * "Featured Spotlight" - the tenant's promo panel (bilingual label / title /
 * text / button) plus the three catalog items it showcases. The three item
 * pickers each choose one product, service or food item from this site's
 * catalog; the frontend `Spotlight` block resolves them to live cards.
 *
 * One component rather than plain `FieldDef`s because the item pickers need the
 * catalog fetched by tenant, which the flat admin form has no place for. It is
 * the entire body of /admin/featured-spotlight - it used to be one section of
 * the (much longer) /admin/system form.
 */
export function SpotlightSection({ values, onChange, systemId }: Props) {
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
        // A failed catalog fetch just leaves the pickers empty; the copy fields
        // still work, and any already-saved refs round-trip untouched.
      });
    return () => {
      cancelled = true;
    };
  }, [systemId, t]);

  const items = (values.spotlight_items as SpotlightRef[] | undefined) ?? [];

  // Replace the ref at slot `index`, then compact so an emptied middle slot does
  // not leave a hole the frontend would skip over silently.
  const setSlot = (index: number, value: string) => {
    const next: (SpotlightRef | null)[] = [items[0], items[1], items[2]].map(
      (ref) => ref ?? null,
    );
    next[index] = decodeRef(value);
    onChange(
      "spotlight_items",
      next.filter((ref): ref is SpotlightRef => ref !== null),
    );
  };

  const noneOption: SelectOption = { value: "", label: t("spotlightItemNone") };

  // The master switch: default on, so a tenant with a configured spotlight keeps
  // rendering it. When off the whole block is hidden on the site, regardless of
  // the copy and items below.
  const enabled = values.spotlight_enabled !== false;

  return (
    // No section header: this is the whole of /admin/featured-spotlight, and the
    // page's own <h1> already carries the title.
    <Box flexDirection="column" gap={16}>
      <Typography variant="body" margin={0}>
        {t("spotlightIntro")}
      </Typography>

      {/* Master switch for the whole block - off hides it on the site even when
          the copy and items below are filled in. */}
      <Box display="flex" alignItems="center" gap={10}>
        <Switch
          checked={enabled}
          onChange={(v) => onChange("spotlight_enabled", v)}
        />
        <Typography
          as="span"
          variant="body"
          fontWeight={500}
          color="var(--foreground)"
        >
          {t("spotlightEnabled")}
        </Typography>
      </Box>

      {/* The bilingual copy - each pair carries a Translate button (Text also
          gets Speech + Enhance), exactly like the rest of the admin form. */}
      <BilingualAssistGroup
        values={values}
        onChange={onChange}
        pairs={COPY_PAIRS.map(({ labelKey, ...rest }) => ({
          ...rest,
          groupLabel: t(labelKey),
        }))}
      />

      <TextInput
        label={t("spotlightButtonLink")}
        helperText={t("spotlightButtonLinkHelp")}
        value={String(values.spotlight_button_link ?? "")}
        onChange={(v) => onChange("spotlight_button_link", v)}
        placeholder="/mayoreo"
      />

      <Box flexDirection="column" gap={6}>
        <Typography
          as="span"
          variant="label"
          fontWeight={600}
          color="var(--foreground)"
        >
          {t("spotlightItemsLabel")}
        </Typography>
        <Grid container spacing={2}>
          {[0, 1, 2].map((index) => (
            <Grid key={index} size={{ xs: 12, md: 4 }}>
              <Select
                label={`${t("spotlightItem")} ${index + 1}`}
                value={encodeRef(items[index])}
                onChange={(v) => setSlot(index, v)}
                options={[noneOption, ...options]}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
