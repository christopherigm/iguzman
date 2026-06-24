"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import type { Category } from "@/lib/catalog";

type Props = {
  /** The full set of selectable genres (bounded: TMDB genres + custom additions). */
  categories: Category[];
  /**
   * Currently selected values. Their meaning is set by `valueKey`: genre slugs
   * in the catalog filter, genre names in the metadata editor.
   */
  selected: string[];
  /** Toggle a value in/out of the selection. */
  onToggle: (value: string) => void;
  /**
   * Which `Category` field a selection is keyed by. The catalog filter keys by
   * `slug` (the API filter param); the metadata editor keys by `name` (genres
   * are stored/sent as plain names). Defaults to `slug`.
   */
  valueKey?: "slug" | "name";
  /** Optional caption above the buttons (the filter bar renders none). */
  label?: string;
  /** Horizontal alignment of the wrapped button row. */
  align?: "start" | "center";
  disabled?: boolean;
};

/**
 * A multi-select group of genre buttons, shared by the catalog filter bar and
 * the movie-metadata editor so both render the same controlled genre set (and
 * editing can no longer introduce free-text genres outside the vocabulary).
 * Renders nothing until the category list is available.
 */
export function GenreSelector({
  categories,
  selected,
  onToggle,
  valueKey = "slug",
  label,
  align = "start",
  disabled,
}: Props) {
  if (categories.length === 0) return null;
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={6}
      width="100%"
      alignItems={align === "center" ? "center" : undefined}
    >
      {label && (
        <Typography variant="caption" styles={{ opacity: 0.7 }}>
          {label}
        </Typography>
      )}
      <Box
        display="flex"
        flexWrap="wrap"
        gap={8}
        width="100%"
        justifyContent={align === "center" ? "center" : "flex-start"}
      >
        {categories.map((category) => {
          const value = category[valueKey];
          const isSelected = selected.includes(value);
          return (
            <Button
              key={category.slug}
              kind={isSelected ? "primary" : undefined}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(value)}
              disabled={disabled}
            >
              {category.name}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
