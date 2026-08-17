"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Switch } from "@repo/ui/core-elements/switch";

/** The three buyable families a recommendation can point at - the same `kind`
 *  strings the cart and favorites endpoints speak. */
export type RecommendationKind = "product" | "service" | "menu_item";

/** What the API takes, and all it takes: a cross-family reference. An id alone
 *  cannot say which of the three tables it is in, which is why this is not a
 *  plain number list the way `variants` is. */
export interface RecommendationRef {
  kind: RecommendationKind;
  id: number;
}

/** One pickable buyable: a linkable identity and a thumbnail. The parent
 *  excludes the record being edited, so nothing can recommend itself. */
export interface RecommendationOption extends RecommendationRef {
  name: string | null;
  en_name: string | null;
  image: string | null;
}

interface Props {
  /** The selected refs, **in display order** - the API stores the position as
   *  each row's `sort_order`, so this list is the arrangement of the strip. */
  value: RecommendationRef[];
  onChange: (value: RecommendationRef[]) => void;
  /** Every buyable in this system, all three families (self already excluded). */
  catalog: RecommendationOption[];
  locale: string;
  /**
   * Which side of the inherit/override rule this form is on.
   *
   * `category` defines the list every item in it offers; `item` **overrides**
   * that list, and an empty selection there means "inherit" rather than
   * "recommend nothing". The two need different copy, which is the whole reason
   * this prop exists.
   */
  scope: "item" | "category";
  /**
   * What an `item` scope inherits while its own selection is empty, for display
   * only.
   *
   * ⚠ Without this the editor would say "nothing selected" to an operator whose
   * dish *does* offer extras, and send them off to re-tick rows the category
   * already defines - the mistake `menu-sizes-editor.tsx` is shaped around.
   */
  inherited?: RecommendationOption[];
}

const GROUPS: { kind: RecommendationKind; labelKey: string }[] = [
  { kind: "menu_item", labelKey: "menuItems" },
  { kind: "product", labelKey: "products" },
  { kind: "service", labelKey: "services" },
];

/**
 * Multi-select section for a source's checkout recommendations - the "don't
 * forget these" strip a customer is offered under their cart lines.
 *
 * Used by all six admin forms (product, service, menu item, and their three
 * categories), because all six author the same relation. It differs from
 * `VariantsEditor` in the two ways the relation itself differs:
 *
 * * **Cross-family.** The list is grouped by family and a selection is a
 *   `{kind, id}` ref, so a pizza can recommend a soda *and* a branded mug.
 * * **One-way.** Ticking a soda here does not make the pizza show up under the
 *   soda, unlike a symmetrical variant pairing - so there is no "this also
 *   appears on the other item" caveat to give.
 *
 * The parent page sends `value` as the `recommendations` field on save, which
 * replaces the source's rows wholesale.
 */
export function RecommendationsEditor({
  value,
  onChange,
  catalog,
  locale,
  scope,
  inherited,
}: Props) {
  const t = useTranslations("Admin");
  const [query, setQuery] = useState("");

  // Keyed by `kind:id`, since an id is only unique within its own family.
  const refKey = (ref: RecommendationRef) => `${ref.kind}:${ref.id}`;
  const selected = useMemo(
    () => new Set(value.map((ref) => `${ref.kind}:${ref.id}`)),
    [value],
  );

  const nameOf = (o: RecommendationOption) =>
    (locale === "en" ? o.en_name : o.name) ?? o.name ?? o.en_name ?? `#${o.id}`;

  // Appending on select is what makes the picker an ordering control too: the
  // API stores each ref's position as its `sort_order`.
  const toggle = (option: RecommendationOption, on: boolean) =>
    onChange(
      on
        ? [...value, { kind: option.kind, id: option.id }]
        : value.filter((ref) => refKey(ref) !== refKey(option)),
    );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUPS.map(({ kind, labelKey }) => ({
      kind,
      labelKey,
      rows: catalog
        .filter((o) => o.kind === kind)
        .filter((o) => !q || nameOf(o).toLowerCase().includes(q))
        // Selected rows float to the top of their family, then alphabetical, so
        // the current choices stay visible once the list is filtered or long.
        .sort((a, b) => {
          const sa = selected.has(refKey(a)) ? 0 : 1;
          const sb = selected.has(refKey(b)) ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return nameOf(a).localeCompare(nameOf(b));
        }),
    })).filter((group) => group.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query, selected, locale]);

  // Only meaningful on an item, and only while it has overridden nothing.
  const showInherited =
    scope === "item" && value.length === 0 && (inherited?.length ?? 0) > 0;

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Typography variant="h6">{t("recommendations")}</Typography>
      <Typography variant="caption" color="var(--muted, #6b7280)">
        {scope === "item"
          ? t("recommendationsHintItem")
          : t("recommendationsHintCategory")}
      </Typography>

      {showInherited && (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("recommendationsInherited", {
            items: inherited!.map(nameOf).join(", "),
          })}
        </Typography>
      )}

      {catalog.length === 0 ? (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("recommendationsEmpty")}
        </Typography>
      ) : (
        <>
          <TextInput
            value={query}
            onChange={setQuery}
            label={t("recommendationsSearch")}
            minWidth={0}
          />
          <Box
            display="flex"
            flexDirection="column"
            gap="2px"
            styles={{
              maxHeight: "320px",
              overflowY: "auto",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: "10px",
              padding: "6px",
            }}
          >
            {groups.map((group) => (
              <Box
                key={group.kind}
                display="flex"
                flexDirection="column"
                gap="2px"
              >
                {/* One heading per family, so a name that exists in two of them
                    is never ambiguous. */}
                <Typography
                  variant="label"
                  color="var(--muted, #6b7280)"
                  styles={{ padding: "6px 6px 2px" }}
                >
                  {t(group.labelKey)}
                </Typography>
                {group.rows.map((o) => {
                  const isSel = selected.has(refKey(o));
                  const name = nameOf(o);
                  return (
                    <Box
                      key={refKey(o)}
                      display="flex"
                      alignItems="center"
                      gap="10px"
                      padding="6px"
                      borderRadius={8}
                      backgroundColor={
                        isSel ? "var(--surface-2, #f3f4f6)" : "transparent"
                      }
                    >
                      <Box
                        width={36}
                        height={36}
                        borderRadius={6}
                        backgroundColor="var(--surface-3, #e5e7eb)"
                        alignItems="center"
                        justifyContent="center"
                        styles={{
                          position: "relative",
                          overflow: "hidden",
                          flex: "0 0 auto",
                        }}
                      >
                        {o.image ? (
                          <Image
                            fill
                            src={o.image}
                            alt={name}
                            sizes="36px"
                            style={{ objectFit: "cover" }}
                          />
                        ) : (
                          <Typography as="span" variant="caption">
                            {name.charAt(0).toUpperCase()}
                          </Typography>
                        )}
                      </Box>
                      <Typography
                        variant="body"
                        color="var(--foreground)"
                        styles={{ flex: "1 1 auto", minWidth: 0 }}
                      >
                        {name}
                      </Typography>
                      <Switch
                        checked={isSel}
                        onChange={(on) => toggle(o, on)}
                        aria-label={name}
                      />
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
          {value.length > 0 && (
            <Typography variant="caption" color="var(--muted, #6b7280)">
              {t("recommendationsSelectedCount", { count: value.length })}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
