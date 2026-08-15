"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { BilingualAssistGroup } from "@/components/admin/bilingual-assist-group";
import { CATALOG_KINDS, type CatalogKind } from "@/lib/kind-labels";

/**
 * What this tenant calls the two Buyable families it sells.
 *
 * A workshop's "Services" are *Lo que hacemos*. Filling a field here renames
 * that family everywhere the storefront names it - the navbar link, the listing
 * page's title and hero, the breadcrumbs and the browser tab.
 *
 * **A menu has no fields here.** Its sections are the tenant's own
 * `MenuCategory` rows, which are already their own copy, so renaming one is
 * editing the category. This section used to carry five more pairs (Food,
 * Drinks, Desserts, Sides, Appetizers) for the `MenuItem.kind` enum that has
 * since been removed.
 *
 * ⚠ **A rename changes a label and nothing else.** `/categories/products` and
 * `/products/<slug>` are structural and stay exactly as they are, so a
 * customer's bookmark and a search result keep working.
 *
 * Two fields per family, in this site's usual pair: the first is the Spanish copy
 * and the second the English one, each with the Translate button every other
 * bilingual pair in the CMS carries (via `BilingualAssistGroup`, so this section
 * cannot drift from the admin form's own field flow). They are `text` pairs, so
 * they get Translate only - Enhance rewrites prose into paragraphs, which is the
 * opposite of what a two-word section name wants.
 *
 * **Either left blank falls back to the site's own translation**, so a tenant
 * who fills only one language is still renamed on both - and clearing both
 * fields is how a rename is undone.
 */

/** Mirrors `System.kind_label_*`'s own `max_length`. */
const KIND_LABEL_MAX_LENGTH = 64;

/** The translation key holding each family's built-in name in the `Admin`
 *  namespace - the CMS nav's own labels. Kept as a map rather than built by
 *  concatenation so a rename of a key is a type error, not a blank heading. */
const KIND_NAME_KEYS: Record<CatalogKind, string> = {
  product: "products",
  service: "services",
};

interface KindLabelsSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function KindLabelsSection({
  values,
  onChange,
}: KindLabelsSectionProps) {
  const t = useTranslations("Admin");

  return (
    <Box flexDirection="column" gap={16}>
      <Typography as="h3" variant="h4" fontWeight={700}>
        {t("kindLabelsTitle")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("kindLabelsIntro")}
      </Typography>

      <BilingualAssistGroup
        values={values}
        onChange={onChange}
        pairs={CATALOG_KINDS.map((kind) => ({
          esKey: `kind_label_${kind}`,
          enKey: `en_kind_label_${kind}`,
          groupLabel: t(KIND_NAME_KEYS[kind]),
          type: "text" as const,
          maxLength: KIND_LABEL_MAX_LENGTH,
        }))}
      />

      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("kindLabelsHelp")}
      </Typography>
    </Box>
  );
}
