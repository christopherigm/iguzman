"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
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

  // Which filter modal is open (only one at a time), or null when closed.
  const [openModal, setOpenModal] = useState<"formats" | "genres" | null>(null);
  const closeModal = () => setOpenModal(null);

  const sortOptions: SelectOption[] = SORTS.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }));

  // Highlight a trigger button while its group has any active selection, so the
  // user can tell filters are applied even with the modal collapsed.
  const formatsActive =
    format !== "" || selectedAudio.length > 0 || selectedHdr.length > 0;
  const genresActive = selectedGenres.length > 0;

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

      {/* Two centered triggers open the Formats and Genres pickers. Selections
          inside each modal apply live (they call the same toggle handlers), so
          OK just closes the dialog. */}
      <Box
        display="flex"
        gap={12}
        width="100%"
        justifyContent="center"
        alignItems="center"
        flexWrap="wrap"
      >
        <Button
          text={t("formatsButton")}
          icon="/icons/formats.svg"
          size="md"
          kind={formatsActive ? "primary" : undefined}
          aria-expanded={openModal === "formats"}
          onClick={() => setOpenModal("formats")}
        />
        <Button
          text={t("genresButton")}
          icon="/icons/genres.svg"
          size="md"
          kind={genresActive ? "primary" : undefined}
          aria-expanded={openModal === "genres"}
          onClick={() => setOpenModal("genres")}
        />
      </Box>

      {openModal === "formats" && (
        <ConfirmationModal
          title={t("formatsModalTitle")}
          text={t("formatsModalText")}
          okCallback={closeModal}
        >
          <Box display="flex" flexDirection="column" gap={16}>
            {/* Disc / physical format - single-select icon toggles. */}
            <Box display="flex" flexDirection="column" gap={6}>
              <Typography variant="caption" styles={{ opacity: 0.7 }}>
                {t("discFormatHeading")}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={8}>
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
                      // Toggle: re-selecting the active format clears it.
                      onClick={() => onFormatChange(selected ? "" : value)}
                      fullColor={fullColor}
                      solid={selected}
                    />
                  );
                })}
              </Box>
            </Box>

            {/* Audio formats - multi-select, AND-filtered. */}
            <Box display="flex" flexDirection="column" gap={6}>
              <Typography variant="caption" styles={{ opacity: 0.7 }}>
                {t("audioFormatHeading")}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={8}>
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
              </Box>
            </Box>

            {/* Video / HDR formats - multi-select, AND-filtered. */}
            <Box display="flex" flexDirection="column" gap={6}>
              <Typography variant="caption" styles={{ opacity: 0.7 }}>
                {t("videoFormatHeading")}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={8}>
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
            </Box>
          </Box>
        </ConfirmationModal>
      )}

      {openModal === "genres" && (
        <ConfirmationModal
          title={t("genresModalTitle")}
          text={t("genresModalText")}
          okCallback={closeModal}
        >
          <GenreSelector
            categories={categories}
            selected={selectedGenres}
            onToggle={onGenreToggle}
            align="center"
          />
        </ConfirmationModal>
      )}
    </Box>
  );
}
