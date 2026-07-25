"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import "./color-field.css";

/**
 * Native `<input type="color">` only accepts `#rrggbb`. Anything else - a short
 * `#fff`, a named color, an empty string - makes the browser silently show
 * black, which reads as "the color was lost". Widen what we can, and leave the
 * rest to the fallback so at least the text beside it still shows the truth.
 */
function toHex7(value: string, fallback: string): string {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const [r, g, b] = [v[1], v[2], v[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Fallback when `value` is not a hex color the native picker can show. */
  fallback: string;
  /**
   * Whether this is the color currently on screen (the CMS's own theme). Drawn
   * as an accent outline so it is obvious which of the two the preview shows.
   */
  active?: boolean;
};

/**
 * A large, obvious color swatch with its hex value beside it.
 *
 * Not a `<TextInput type="color">`: that renders the browser's default swatch
 * at text height, which is a small target and says nothing about which color is
 * selected unless you can name a hex by looking at it.
 */
export function ColorField({
  id,
  label,
  value,
  onChange,
  fallback,
  active = false,
}: Props) {
  const hex = toHex7(value, fallback);

  return (
    <Box flexDirection="column" gap={6}>
      <Typography
        as="label"
        htmlFor={id}
        variant="label"
        fontWeight={600}
        color="var(--foreground)"
      >
        {label}
      </Typography>
      <Box
        alignItems="center"
        gap={12}
        padding="8px 12px"
        borderRadius={10}
        border={`1px solid ${active ? "var(--accent)" : "var(--border)"}`}
        backgroundColor="var(--surface-1)"
      >
        <input
          id={id}
          type="color"
          className="admin-color-field__swatch"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <Typography
          as="span"
          variant="body"
          color="var(--foreground)"
          styles={{ fontFamily: "monospace", textTransform: "uppercase" }}
        >
          {hex}
        </Typography>
      </Box>
    </Box>
  );
}
