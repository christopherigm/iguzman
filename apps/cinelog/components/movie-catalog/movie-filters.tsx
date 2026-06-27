"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type {
  AudioFormatCode,
  Category,
  HdrFormatCode,
  MovieFormat,
  MovieSort,
} from "@/lib/catalog";
import { FORMAT_BUTTONS } from "@/components/format-buttons";
import {
  AUDIO_FORMAT_BUTTONS,
  HDR_FORMAT_BUTTONS,
} from "@/components/tech-spec-buttons";
import { GenreSelector } from "@/components/genre-selector";

// Sort options as {value, labelKey} pairs. The value is the API `ordering`
// expression (see MovieSort); the key resolves to a CatalogPage translation.
const SORTS: { value: MovieSort; labelKey: string }[] = [
  { value: "", labelKey: "sortNone" },
  { value: "title", labelKey: "sortNameAsc" },
  { value: "-title", labelKey: "sortNameDesc" },
  { value: "-year", labelKey: "sortYearDesc" },
  { value: "year", labelKey: "sortYearAsc" },
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
  /** Currently selected disc audio-format codes (AND-filtered). */
  selectedAudio: AudioFormatCode[];
  /** Toggle an audio-format code in/out of the active selection. */
  onAudioToggle: (code: AudioFormatCode) => void;
  /** Currently selected disc HDR-format codes (AND-filtered). */
  selectedHdr: HdrFormatCode[];
  /** Toggle an HDR-format code in/out of the active selection. */
  onHdrToggle: (code: HdrFormatCode) => void;
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
  selectedAudio,
  onAudioToggle,
  selectedHdr,
  onHdrToggle,
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
      <Box display="flex" gap={12} flexWrap="wrap">
        <TextInput
          type="search"
          label={t("searchLabel")}
          value={search}
          onChange={onSearchChange}
          flex="2 1 200px"
        />
        <Select
          label={t("sortLabel")}
          value={sort}
          onChange={(value) => onSortChange(value as MovieSort)}
          options={sortOptions}
          flex="1 1 40px"
        />
      </Box>

      {/* Disc-spec filter row: physical format (single-select icon toggles),
          then audio and HDR formats (multi-select, AND-filtered). All flow into
          one centered, wrapping row - the same layout language as the genres
          row directly below it. */}
      <Box
        display="flex"
        flexWrap="wrap"
        gap={8}
        width="100%"
        justifyContent="center"
        alignItems="center"
      >
        {FORMAT_BUTTONS.map(({ value, icon, iconColor, fullColor }) => {
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
              fullColor={fullColor}
              solid={selected}
            />
          );
        })}

        {AUDIO_FORMAT_BUTTONS.map(({ value, label, icon }) => {
          const selected = selectedAudio.includes(value);
          return (
            <Button
              key={value}
              text={label}
              icon={icon}
              size="sm"
              kind={selected ? "primary" : undefined}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onAudioToggle(value)}
            />
          );
        })}

        {HDR_FORMAT_BUTTONS.map(({ value, label, icon }) => {
          const selected = selectedHdr.includes(value);
          return (
            <Button
              key={value}
              text={label}
              icon={icon}
              size="sm"
              kind={selected ? "primary" : undefined}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onHdrToggle(value)}
            />
          );
        })}
      </Box>

      <GenreSelector
        categories={categories}
        selected={selectedGenres}
        onToggle={onGenreToggle}
        align="center"
      />
    </Box>
  );
}
