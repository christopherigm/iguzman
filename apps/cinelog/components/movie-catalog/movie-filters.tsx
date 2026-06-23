"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { Category, MovieFormat, MovieSort } from "@/lib/catalog";

// Each selectable format renders as an IconButton. Blu-ray and 4K share the
// same disc icon, distinguished by icon color (blue vs. black); DVD and other
// formats use their own icons.
const FORMAT_BUTTONS: {
  value: Exclude<MovieFormat, "">;
  icon: string;
  iconColor?: string;
}[] = [
  { value: "dvd", icon: "/icons/dvd.svg" },
  { value: "bluray", icon: "/icons/blu-ray.svg", iconColor: "#2563eb" },
  {
    value: "4k",
    icon: "/icons/blu-ray.svg",
    iconColor: "var(--foreground, #111)",
  },
  { value: "other", icon: "/icons/disc.svg" },
];

// Sort options as {value, labelKey} pairs. The value is the API `ordering`
// expression (see MovieSort); the key resolves to a CatalogPage translation.
const SORTS: { value: MovieSort; labelKey: string }[] = [
  { value: "", labelKey: "sortNone" },
  { value: "title", labelKey: "sortNameAsc" },
  { value: "-title", labelKey: "sortNameDesc" },
  { value: "-year", labelKey: "sortYearDesc" },
  { value: "year", labelKey: "sortYearAsc" },
  { value: "format", labelKey: "sortFormat" },
  { value: "-created", labelKey: "sortDateAddedDesc" },
  { value: "created", labelKey: "sortDateAddedAsc" },
];

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  /** Currently selected genre slugs (AND-filtered). */
  selectedGenres: string[];
  /** Toggle a genre slug in/out of the active selection. */
  onGenreToggle: (slug: string) => void;
  format: MovieFormat;
  onFormatChange: (value: MovieFormat) => void;
  sort: MovieSort;
  onSortChange: (value: MovieSort) => void;
  categories: Category[];
};

export function MovieFilters({
  search,
  onSearchChange,
  selectedGenres,
  onGenreToggle,
  format,
  onFormatChange,
  sort,
  onSortChange,
  categories,
}: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");

  const sortOptions: SelectOption[] = SORTS.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }));

  return (
    <Box display="flex" flexDirection="column" gap={16}>
      <Box display="flex" gap={8} flexWrap="wrap">
        <TextInput
          type="search"
          label={t("searchLabel")}
          value={search}
          onChange={onSearchChange}
          flex="2 1 200px"
        />
        <Box display="flex" flexDirection="column" gap={4} flex="1 1 140px">
          <Typography variant="caption" styles={{ opacity: 0.7 }}>
            {t("formatLabel")}
          </Typography>
          <Box display="flex" gap={4} alignItems="center">
            {FORMAT_BUTTONS.map(({ value, icon, iconColor }) => {
              const selected = format === value;
              return (
                <IconButton
                  key={value}
                  icon={icon}
                  iconColor={iconColor}
                  kind={selected ? "primary" : "default"}
                  aria-label={tFormat(value)}
                  aria-pressed={selected}
                  title={tFormat(value)}
                  size="sm"
                  // Toggle: re-selecting the active format clears it ("all formats").
                  onClick={() => onFormatChange(selected ? "" : value)}
                />
              );
            })}
          </Box>
        </Box>
        <Select
          label={t("sortLabel")}
          value={sort}
          onChange={(value) => onSortChange(value as MovieSort)}
          options={sortOptions}
          flex="1 1 160px"
        />
      </Box>

      {categories.length > 0 && (
        <Box
          display="flex"
          flexDirection="column"
          gap={8}
          width="100%"
          alignItems="center"
          marginBottom={8}
        >
          <Box
            display="flex"
            flexWrap="wrap"
            gap={8}
            justifyContent="center"
            width="100%"
          >
            {categories.map((category) => {
              const selected = selectedGenres.includes(category.slug);
              return (
                <Button
                  key={category.slug}
                  kind={selected ? "primary" : undefined}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onGenreToggle(category.slug)}
                >
                  {category.name}
                </Button>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
