"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { BilingualAssistGroup } from "@/components/admin/bilingual-assist-group";
import { CATALOG_KINDS, type CatalogKind } from "@/lib/kind-labels";

/**
 * What this tenant calls each kind of thing it sells.
 *
 * A pizzeria's "Food" section is *Pizzas*; a workshop's "Services" are *Lo que
 * hacemos*. Filling a field here renames that kind everywhere the storefront
 * names it - the navbar's menu dropdown, each listing page's title and hero, the
 * section headings on the full menu, the breadcrumbs and the browser tab.
 *
 * ⚠ **A rename changes a label and nothing else.** `/categories/food`,
 * `/food/<slug>` and the kind values behind them are structural and stay exactly
 * as they are, so a customer's bookmark and a search result keep working. That
 * is also why the CMS's own Kind dropdown keeps showing the built-in name with
 * the tenant's in parentheses - an operator filing an item is setting a
 * structural field, not choosing a heading.
 *
 * Two fields per kind, in this site's usual pair: the first is the Spanish copy
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

/** The translation key holding each kind's built-in name in the `Admin`
 *  namespace. The five menu kinds already have one from the menu-item form; the
 *  two families reuse the CMS nav's own labels. Kept as a map rather than built
 *  by concatenation so a rename of a key is a type error, not a blank heading. */
const KIND_NAME_KEYS: Record<CatalogKind, string> = {
  food: "kindFood",
  drink: "kindDrink",
  dessert: "kindDessert",
  side: "kindSide",
  appetizer: "kindAppetizer",
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
