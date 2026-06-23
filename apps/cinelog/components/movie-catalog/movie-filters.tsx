"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import type { Category, MovieFormat, MovieSort } from "@/lib/catalog";

const FORMATS: Exclude<MovieFormat, "">[] = ["dvd", "bluray", "4k", "other"];

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
  genre: string;
  onGenreChange: (value: string) => void;
  format: MovieFormat;
  onFormatChange: (value: MovieFormat) => void;
  sort: MovieSort;
  onSortChange: (value: MovieSort) => void;
  categories: Category[];
};

export function MovieFilters({
  search,
  onSearchChange,
  genre,
  onGenreChange,
  format,
  onFormatChange,
  sort,
  onSortChange,
  categories,
}: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");

  const genreOptions: SelectOption[] = [
    { value: "", label: t("allGenres") },
    ...categories.map((category) => ({
      value: category.slug,
      label: category.name,
    })),
  ];

  const formatOptions: SelectOption[] = [
    { value: "", label: t("allFormats") },
    ...FORMATS.map((value) => ({ value, label: tFormat(value) })),
  ];

  const sortOptions: SelectOption[] = SORTS.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }));

  return (
    <Box display="flex" gap={8} flexWrap="wrap">
      <TextInput
        type="search"
        label={t("searchLabel")}
        value={search}
        onChange={onSearchChange}
        flex="2 1 200px"
      />
      <Select
        label={t("genreLabel")}
        value={genre}
        onChange={onGenreChange}
        options={genreOptions}
        flex="1 1 140px"
      />
      <Select
        label={t("formatLabel")}
        value={format}
        onChange={(value) => onFormatChange(value as MovieFormat)}
        options={formatOptions}
        flex="1 1 140px"
      />
      <Select
        label={t("sortLabel")}
        value={sort}
        onChange={(value) => onSortChange(value as MovieSort)}
        options={sortOptions}
        flex="1 1 160px"
      />
    </Box>
  );
}
