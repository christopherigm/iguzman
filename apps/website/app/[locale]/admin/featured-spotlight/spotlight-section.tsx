"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  BilingualAssistGroup,
  type BilingualPair,
} from "@/components/admin/bilingual-assist-group";
import {
  CatalogRefPicker,
  useCatalogRefOptions,
} from "@/components/admin/catalog-ref-picker";
import type { SpotlightRef } from "@/lib/system";

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** The current tenant, so the picker lists only this site's catalog. */
  systemId: number;
};

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

  const options = useCatalogRefOptions(systemId);
  const items = (values.spotlight_items as SpotlightRef[] | undefined) ?? [];

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

      {/* Three slots, shared with the homepage flyers' pair - see
          `components/admin/catalog-ref-picker.tsx`. */}
      <CatalogRefPicker
        label={t("spotlightItemsLabel")}
        slots={3}
        value={items}
        onChange={(refs) => onChange("spotlight_items", refs)}
        options={options}
      />
    </Box>
  );
}
