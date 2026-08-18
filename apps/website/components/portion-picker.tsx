"use client";

import { useEffect, useRef } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import {
  prefersReducedMotion,
  scrollToElement,
} from "@repo/ui/core-elements/scroll-to";
import { Slider, type SliderStep } from "@repo/ui/core-elements/slider";
import { Typography } from "@repo/ui/core-elements/typography";
import "./portion-picker.css";

/**
 * `sm` is the storefront's density (detail page, catalog card modal); `lg` grows
 * the gauge and the apply button for the POS till, where an associate drives it
 * with a finger over a counter. Shares its names with `MenuIngredientPicker`'s
 * scale, so the picker passes `size` straight through.
 */
export type PortionPickerSize = "sm" | "lg";

const SIZES = {
  sm: {
    circles: [10, 14, 19],
    circleGap: 4,
    amountVariant: "h6",
    paddingX: 8,
    paddingY: 4,
    applySize: "md",
  },
  lg: {
    circles: [13, 18, 24],
    circleGap: 5,
    amountVariant: "h5",
    paddingX: 10,
    paddingY: 6,
    applySize: "lg",
  },
} as const;

/** The apply glyph. Kept here so both halves of the control name it once. */
export const PORTION_APPLY_ICON = "/icons/ok.svg";

/**
 * How long the panel takes to unfold, in ms - **the `grid-template-rows`
 * transition in `portion-picker.css`**. Keep the two in step: it is how long
 * {@link PortionSlider} waits before scrolling itself into view, and a scroll
 * aimed at the panel while it is still a zero-height row lands short of it.
 */
const PORTION_FOLD_MS = 260;

/**
 * How many of the three circles are lit for `value`.
 *
 * The gauge is **proportional**, not a count: an ingredient may allow one
 * portion or six, and three circles have to read as low / medium / high for both.
 * `min` is the floor the ingredient can be taken to (0 when it is removable), so
 * an ingredient sitting at its floor lights nothing - that is what "none of this
 * on the dish" looks like.
 */
export function gaugeLevel(value: number, min: number, max: number): number {
  const span = max - min;
  if (value <= min) return 0;
  if (span <= 0) return 3;
  return Math.min(3, Math.ceil(((value - min) / span) * 3));
}

interface GaugeProps {
  /** The chosen quantity, in portions. */
  value: number;
  min: number;
  max: number;
  /** The quantity as a person reads it - "40 g", "2×". Printed above the circles. */
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Names the control; the visible label is a bare amount with no subject. */
  ariaLabel: string;
  /** The panel this button opens, for `aria-controls`. */
  controls: string;
  size?: PortionPickerSize;
}

/**
 * The amount, over three circles that grow with it.
 *
 * This replaced a `− n +` stepper, which stated the number and nothing else: a
 * customer reading "2" had no idea whether that was a little pineapple or a lot,
 * and no idea what the dish could take. The circles answer both at a glance, and
 * pressing them opens the `PortionSlider` below the row, where every portion the
 * kitchen allows is a mark with its own price.
 *
 * **Fully controlled and owns no state**, including whether it is open - the
 * picker holds that, so opening one ingredient's slider closes the last.
 */
export function PortionGauge({
  value,
  min,
  max,
  label,
  open,
  onToggle,
  ariaLabel,
  controls,
  size = "sm",
}: GaugeProps) {
  const s = SIZES[size];
  const level = gaugeLevel(value, min, max);

  return (
    <Button
      unstyled
      className="portion-gauge"
      onClick={onToggle}
      aria-label={`${ariaLabel}: ${label}`}
      aria-expanded={open}
      aria-controls={controls}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={4}
      paddingX={s.paddingX}
      paddingY={s.paddingY}
      borderRadius={10}
      backgroundColor={
        open
          ? "color-mix(in srgb, var(--accent, #06b6d4) 10%, transparent)"
          : "transparent"
      }
      border={
        open ? "1px solid var(--accent)" : "1px solid var(--border, #e5e7eb)"
      }
      /* A bare `<button>` carries the UA's own font, which the amount inside it
         would otherwise inherit instead of the tenant's. */
      styles={{ fontFamily: "inherit" }}
    >
      <Typography
        as="span"
        variant={s.amountVariant}
        margin={0}
        fontWeight={700}
        color={level > 0 ? "var(--accent)" : "var(--foreground)"}
        aria-live="polite"
      >
        {label}
      </Typography>
      {/* The three circles sit on one baseline, so the size difference - not the
          position - is what carries the reading. */}
      <Box alignItems="flex-end" gap={s.circleGap} aria-hidden={true}>
        {s.circles.map((diameter, i) => (
          <Box
            key={diameter}
            className="portion-gauge__dot"
            width={diameter}
            height={diameter}
            borderRadius="50%"
            backgroundColor={i < level ? "var(--accent)" : "transparent"}
            border={
              i < level
                ? "1px solid var(--accent)"
                : "1px solid color-mix(in srgb, var(--foreground, #111) 30%, transparent)"
            }
          />
        ))}
      </Box>
    </Button>
  );
}

interface SliderProps {
  /** One step per portion the ingredient allows, floor to ceiling. */
  steps: SliderStep[];
  value: number;
  onChange: (value: number) => void;
  /** Closes the panel. The quantity is already applied - the slider writes on
   *  every move - so this only puts the control away. */
  onApply: () => void;
  applyLabel: string;
  open: boolean;
  /** Matches the gauge's `aria-controls`. */
  id: string;
  size?: PortionPickerSize;
}

/**
 * The slider the gauge opens: every allowed portion as a labelled mark, with the
 * up-charge that portion adds printed beneath the amount, and an apply button
 * that folds the row away again.
 *
 * ⚠ **It is never unmounted** - it is folded into a zero-height grid row, so it
 * animates open *and* closed, and `visibility` (in the CSS) is what takes the
 * slider and the button out of the tab order while it is folded away.
 */
export function PortionSlider({
  steps,
  value,
  onChange,
  onApply,
  applyLabel,
  open,
  id,
  size = "sm",
}: SliderProps) {
  const s = SIZES[size];
  const panelRef = useRef<HTMLDivElement>(null);

  // Bring the panel into view when it opens. The gauge for the last ingredient
  // in a long list sits at the bottom of the modal (or the page), so the slider
  // it unfolds lands below the fold and the press reads as having done nothing.
  //
  // `block: "nearest"` is what makes this "a little bit": a panel already fully
  // visible does not move the page at all, and one that is not is scrolled by
  // exactly the amount that reveals it - keeping the gauge that was pressed on
  // screen above it.
  useEffect(() => {
    if (!open) return;
    // Wait for the fold: until it finishes the panel is a zero-height row, and
    // scrolling to it would aim at the line it used to occupy.
    const timer = window.setTimeout(
      () => scrollToElement(panelRef.current, { block: "nearest" }),
      prefersReducedMotion() ? 0 : PORTION_FOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Box
      ref={panelRef}
      id={id}
      display="grid"
      className={["portion-slider", open ? "portion-slider--open" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <Box styles={{ overflow: "hidden", minWidth: 0 }}>
        <Box alignItems="center" gap={12} paddingTop={8} width="100%">
          <Box flex="1" minWidth={0}>
            <Slider
              className="portion-slider__track"
              steps={steps}
              value={value}
              onChange={(v) => onChange(Number(v))}
              /* The tick labels carry a second line (the up-charge), which
                 overflows the track's own label row - this is the space it
                 lands in. */
              paddingBottom={14}
            />
          </Box>
          <IconButton
            icon={PORTION_APPLY_ICON}
            kind="primary"
            solid
            size={s.applySize}
            aria-label={applyLabel}
            title={applyLabel}
            onClick={onApply}
          />
        </Box>
      </Box>
    </Box>
  );
}
