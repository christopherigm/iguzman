"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import type {
  AudioFormatCode,
  Category,
  HdrFormatCode,
  MovieFormat,
} from "@/lib/catalog";
import { FORMAT_BUTTONS } from "./format-buttons";
import { GenreSelector } from "./genre-selector";
import { AUDIO_FORMAT_BUTTONS, HDR_FORMAT_BUTTONS } from "./tech-spec-buttons";

type Format = Exclude<MovieFormat, "">;

/**
 * The editable movie-metadata fields shared by the catalog edit form and the
 * Inbox review card - the two were near-identical stacks of the same inputs.
 * Cast and the language lists are held as comma-separated strings (the raw
 * input value); `year` is the raw input string. Formats, audio formats, HDR
 * formats, and genres are multi-select lists - genres being names chosen from
 * the controlled category set via buttons.
 */
export interface MovieMetadataValue {
  title: string;
  director: string;
  year: string;
  formats: Format[];
  audioFormats: AudioFormatCode[];
  hdrFormats: HdrFormatCode[];
  genres: string[];
  cast: string;
  spokenLanguages: string;
  subtitleLanguages: string;
  synopsis: string;
  trailerUrl: string;
}

/** Split a comma-separated input into a trimmed, non-empty list. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Parse the raw year input into a number, or null when blank / invalid. */
export function parseYearInput(year: string): number | null {
  const parsed = year.trim() ? Number.parseInt(year.trim(), 10) : null;
  return Number.isNaN(parsed as number) ? null : parsed;
}

/** Toggle a value's membership in a code list (add when absent, remove when present). */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

type Props = {
  value: MovieMetadataValue;
  onPatch: (patch: Partial<MovieMetadataValue>) => void;
  /**
   * Translation namespace to pull field labels from. `MovieDetailPage` and
   * `InboxPage` share the same key names, so the component works under either.
   */
  namespace: "MovieDetailPage" | "InboxPage";
  /** The selectable genre set; the genre buttons render nothing until it loads. */
  categories: Category[];
  disabled?: boolean;
};

/**
 * Renders the shared metadata input stack as a fragment, so each parent form can
 * drop it inside its own column layout (with its surrounding chrome - barcodes,
 * candidate picker, action buttons - left to the parent).
 */
export function MovieMetadataFields({
  value,
  onPatch,
  namespace,
  categories,
  disabled,
}: Props) {
  const t = useTranslations(namespace);
  const tFormat = useTranslations("MovieFormat");

  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Box display="flex" gap={8} flexWrap="wrap">
        <TextInput
          label={t("titleLabel")}
          value={value.title}
          onChange={(title) => onPatch({ title })}
          flex="2 1 200px"
          disabled={disabled}
        />
        <TextInput
          label={t("directorLabel")}
          value={value.director}
          onChange={(director) => onPatch({ director })}
          flex="1 1 160px"
          disabled={disabled}
        />
      </Box>

      <Box display="flex" gap={8} flexWrap="wrap" alignItems="flex-end">
        <TextInput
          type="number"
          label={t("yearLabel")}
          value={value.year}
          onChange={(year) => onPatch({ year })}
          flex="1 1 100px"
          disabled={disabled}
        />
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography variant="caption" styles={{ opacity: 0.7 }}>
            {t("formatLabel")}
          </Typography>
          <Box display="flex" gap={4} alignItems="center">
            {FORMAT_BUTTONS.map(
              ({ value: code, icon, iconColor, fullColor }) => {
                const selected = value.formats.includes(code);
                return (
                  <IconButton
                    key={code}
                    icon={icon}
                    iconColor={iconColor}
                    kind={selected ? "primary" : "default"}
                    aria-label={tFormat(code)}
                    aria-pressed={selected}
                    title={tFormat(code)}
                    size="sm"
                    onClick={() =>
                      onPatch({ formats: toggle(value.formats, code) })
                    }
                    fullColor={fullColor}
                    solid={selected}
                    disabled={disabled}
                  />
                );
              },
            )}
          </Box>
        </Box>
      </Box>

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="caption" styles={{ opacity: 0.7 }}>
          {t("audioLabel")}
        </Typography>
        <Box display="flex" gap={6} flexWrap="wrap">
          {AUDIO_FORMAT_BUTTONS.map(({ value: code, label }) => {
            const selected = value.audioFormats.includes(code);
            return (
              <Button
                key={code}
                text={label}
                size="sm"
                kind={selected ? "primary" : undefined}
                aria-pressed={selected}
                onClick={() =>
                  onPatch({ audioFormats: toggle(value.audioFormats, code) })
                }
                disabled={disabled}
              />
            );
          })}
        </Box>
      </Box>

      <Box display="flex" flexDirection="column" gap={6}>
        <Typography variant="caption" styles={{ opacity: 0.7 }}>
          {t("hdrLabel")}
        </Typography>
        <Box display="flex" gap={6} flexWrap="wrap">
          {HDR_FORMAT_BUTTONS.map(({ value: code, label }) => {
            const selected = value.hdrFormats.includes(code);
            return (
              <Button
                key={code}
                text={label}
                size="sm"
                kind={selected ? "primary" : undefined}
                aria-pressed={selected}
                onClick={() =>
                  onPatch({ hdrFormats: toggle(value.hdrFormats, code) })
                }
                disabled={disabled}
              />
            );
          })}
        </Box>
      </Box>

      <GenreSelector
        categories={categories}
        selected={value.genres}
        onToggle={(genre) => onPatch({ genres: toggle(value.genres, genre) })}
        valueKey="name"
        label={t("genresLabel")}
        disabled={disabled}
      />
      <TextInput
        label={t("castLabel")}
        value={value.cast}
        onChange={(cast) => onPatch({ cast })}
        disabled={disabled}
      />

      <Box display="flex" gap={8} flexWrap="wrap">
        <TextInput
          label={t("spokenLanguagesLabel")}
          value={value.spokenLanguages}
          onChange={(spokenLanguages) => onPatch({ spokenLanguages })}
          flex="1 1 200px"
          disabled={disabled}
        />
        <TextInput
          label={t("subtitlesLabel")}
          value={value.subtitleLanguages}
          onChange={(subtitleLanguages) => onPatch({ subtitleLanguages })}
          flex="1 1 200px"
          disabled={disabled}
        />
      </Box>

      <TextInput
        label={t("synopsisLabel")}
        value={value.synopsis}
        onChange={(synopsis) => onPatch({ synopsis })}
        multirow
        rows={5}
        disabled={disabled}
      />
      <TextInput
        label={t("trailerLabel")}
        value={value.trailerUrl}
        onChange={(trailerUrl) => onPatch({ trailerUrl })}
        disabled={disabled}
      />
    </Box>
  );
}
