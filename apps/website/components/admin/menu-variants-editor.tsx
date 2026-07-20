"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Switch } from "@repo/ui/core-elements/switch";

/** The subset of a MenuItem the variants picker needs: a linkable identity and
 *  a thumbnail. The parent already excludes the item being edited from this
 *  list, so an item can never be offered as its own variant. */
export interface VariantOption {
  id: number;
  name: string | null;
  en_name: string | null;
  image: string | null;
}

interface Props {
  /** Currently selected variant (MenuItem) ids. */
  value: number[];
  onChange: (value: number[]) => void;
  /** Other menu items in the same system (self already excluded). */
  catalog: VariantOption[];
  locale: string;
}

/**
 * Multi-select section for a menu item's sibling variants (e.g. a vegan or
 * gluten-free version of the same dish). The relation is symmetrical on the
 * backend, so ticking an item here surfaces the pairing on that item's detail
 * page too. The parent page sends the selected ids as the `variants` field on
 * save.
 */
export function MenuVariantsEditor({ value, onChange, catalog, locale }: Props) {
  const t = useTranslations("Admin");
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(value), [value]);

  const nameOf = (o: VariantOption) =>
    (locale === "en" ? o.en_name : o.name) ?? o.name ?? o.en_name ?? `#${o.id}`;

  const toggle = (id: number, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id));

  // Selected rows float to the top, then alphabetical - so the current choices
  // stay visible even after the list is filtered or grows long.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((o) => !q || nameOf(o).toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = selected.has(a.id) ? 0 : 1;
        const sb = selected.has(b.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return nameOf(a).localeCompare(nameOf(b));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query, selected, locale]);

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Typography variant="h6">{t("variants")}</Typography>
      <Typography variant="caption" color="var(--muted, #6b7280)">
        {t("variantsHint")}
      </Typography>

      {catalog.length === 0 ? (
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("variantsEmpty")}
        </Typography>
      ) : (
        <>
          <TextInput
            value={query}
            onChange={setQuery}
            label={t("variantsSearch")}
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
            {rows.map((o) => {
              const isSel = selected.has(o.id);
              const name = nameOf(o);
              return (
                <Box
                  key={o.id}
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
                    onChange={(on) => toggle(o.id, on)}
                    aria-label={name}
                  />
                </Box>
              );
            })}
          </Box>
          {value.length > 0 && (
            <Typography variant="caption" color="var(--muted, #6b7280)">
              {t("variantsSelectedCount", { count: value.length })}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
