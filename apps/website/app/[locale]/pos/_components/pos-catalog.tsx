"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { formatPrice } from "@/lib/price";
import type { PosCatalogItem, PosKind } from "@/lib/pos";

interface Props {
  items: PosCatalogItem[];
  onSelect: (item: PosCatalogItem) => void;
}

/** `All` plus whichever families the tenant actually sells. */
type KindFilter = PosKind | "all";

const KIND_ORDER: PosKind[] = ["product", "service", "menu_item"];

/**
 * The sellable grid: what the associate taps.
 *
 * Two filters, in the order a till is actually used. Search first, because
 * typing three letters beats hunting a grid when there is a queue; the kind tabs
 * and category chips are for browsing when there isn't. Both are pure client
 * state over the list the page loaded once - nothing here fetches.
 *
 * Tiles are large and low-density on purpose. This is a thumb on a phone or a
 * finger on a counter tablet, not a mouse.
 */
export function PosCatalog({ items, onSelect }: Props) {
  const t = useTranslations("Pos");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [category, setCategory] = useState<string | null>(null);

  const kindLabels: Record<PosKind, string> = {
    product: t("kindProducts"),
    service: t("kindServices"),
    menu_item: t("kindFood"),
  };

  // Only offer a tab for a family the tenant sells, and only show the tab row at
  // all when there is more than one - a food-only bakery gets no dead chrome.
  const availableKinds = useMemo(
    () => KIND_ORDER.filter((k) => items.some((item) => item.kind === k)),
    [items],
  );

  // Categories belong to the active family; "all" has no single category axis to
  // filter on, so the chips only appear once a family is picked.
  const categories = useMemo(() => {
    if (kind === "all") return [];
    const names = items
      .filter((item) => item.kind === kind && item.category)
      .map((item) => item.category as string);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [items, kind]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (category && item.category !== category) return false;
      if (needle && !item.name.toLocaleLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [items, kind, category, query]);

  const selectKind = (next: KindFilter) => {
    setKind(next);
    // The old category almost certainly does not exist in the new family, and a
    // filter nothing can match reads as an empty catalog.
    setCategory(null);
  };

  return (
    <Box flexDirection="column" gap={12} padding={12}>
      <TextInput
        label={t("search")}
        value={query}
        onChange={setQuery}
        type="search"
      />

      {availableKinds.length > 1 && (
        <Box flexWrap="wrap" gap={8} role="group" aria-label={t("filterByKind")}>
          <FilterChip
            label={t("kindAll")}
            active={kind === "all"}
            onClick={() => selectKind("all")}
          />
          {availableKinds.map((k) => (
            <FilterChip
              key={k}
              label={kindLabels[k]}
              active={kind === k}
              onClick={() => selectKind(k)}
            />
          ))}
        </Box>
      )}

      {categories.length > 0 && (
        <Box
          flexWrap="wrap"
          gap={8}
          role="group"
          aria-label={t("filterByCategory")}
        >
          <FilterChip
            label={t("categoryAll")}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {categories.map((name) => (
            <FilterChip
              key={name}
              label={name}
              active={category === name}
              onClick={() => setCategory(name)}
            />
          ))}
        </Box>
      )}

      {visible.length === 0 ? (
        <Typography variant="body" margin={0} paddingY={24} textAlign="center">
          {t("noItems")}
        </Typography>
      ) : (
        <Box className="pos-grid">
          {visible.map((item) => (
            <PosTile
              key={`${item.kind}-${item.id}`}
              item={item}
              unavailableLabel={t("unavailable")}
              onSelect={() => onSelect(item)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      unstyled
      text={label}
      onClick={onClick}
      aria-pressed={active}
      paddingX={14}
      paddingY={8}
      borderRadius={999}
      backgroundColor={active ? "var(--accent)" : "var(--surface-2)"}
      color={active ? "#fff" : "var(--foreground)"}
      border={
        active ? "1px solid var(--accent)" : "1px solid var(--border, #e5e7eb)"
      }
      styles={{ fontWeight: 600, fontSize: "0.875rem" }}
    />
  );
}

function PosTile({
  item,
  unavailableLabel,
  onSelect,
}: {
  item: PosCatalogItem;
  unavailableLabel: string;
  onSelect: () => void;
}) {
  return (
    <Button
      unstyled
      className="pos-tile"
      onClick={onSelect}
      disabled={!item.available}
      aria-label={item.name}
      display="flex"
      flexDirection="column"
      padding={0}
      borderRadius={12}
      border="1px solid var(--border, #e5e7eb)"
      backgroundColor="var(--surface-2)"
      styles={{ overflow: "hidden", textAlign: "left" }}
    >
      <Box
        className="pos-tile__media"
        backgroundColor="var(--surface-1, var(--surface-2))"
        styles={{ position: "relative", overflow: "hidden" }}
      >
        {item.image && (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(max-width: 600px) 45vw, 20vw"
            style={{ objectFit: "cover" }}
          />
        )}
      </Box>
      <Box flexDirection="column" gap={2} padding={10}>
        <Typography
          variant="h6"
          margin={0}
          fontWeight={600}
          styles={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.name}
        </Typography>
        <Typography variant="body" margin={0} fontWeight={700}>
          {formatPrice(item.price, item.currency)}
        </Typography>
        {!item.available && (
          <Typography variant="caption" margin={0} color="var(--error, #ef4444)">
            {unavailableLabel}
          </Typography>
        )}
      </Box>
    </Button>
  );
}
