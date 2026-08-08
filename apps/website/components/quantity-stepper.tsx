"use client";

import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * `sm` is the storefront's density (detail pages, catalog card modals); `lg`
 * grows the touch targets for a finger-driven surface - the POS till over a
 * counter, or a phone. Only the sizes change; the control is the same.
 */
export type QuantityStepperSize = "sm" | "lg";

const SIZES = {
  sm: {
    stepSize: "sm",
    stepMinWidth: 30,
    qtyVariant: "h6",
    qtyMinWidth: 28,
  },
  lg: {
    stepSize: "md",
    stepMinWidth: 44,
    qtyVariant: "h5",
    qtyMinWidth: 32,
  },
} as const;

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: QuantityStepperSize;
  /** Both buttons need one, and neither has visible text a screen reader could
   *  use - "−" and "+" are glyphs. Required rather than defaulted, because the
   *  wording is the caller's (`Booking` and `Menu` have their own namespaces)
   *  and a hardcoded English fallback would ship silently. */
  decreaseLabel: string;
  increaseLabel: string;
  /** Labels the whole control, for the case where the surrounding text does not
   *  already say what is being counted. */
  ariaLabel?: string;
}

/**
 * A horizontal `− n +` counter.
 *
 * Extracted from `menu-ingredient-picker.tsx` when the booking party counter
 * became its second consumer - the threshold `apps/CLAUDE.md` sets for lifting a
 * component out of the route that first needed it. The picker now renders this
 * rather than its own copy, so the two cannot drift.
 *
 * **Fully controlled and owns no state.** Both consumers need the value
 * elsewhere - the picker's lives in a customization context or a modal's local
 * state, the booking form's is part of the availability request key - and a
 * stepper holding its own copy would give each of them a second source of truth
 * for the same number.
 *
 * `aria-live="polite"` sits on the number rather than on the container so a
 * screen reader announces the new count and not the two buttons around it.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  size = "sm",
  decreaseLabel,
  increaseLabel,
  ariaLabel,
}: QuantityStepperProps) {
  const s = SIZES[size];
  const atMin = value <= min;
  const atMax = max != null && value >= max;

  return (
    <Box
      alignItems="center"
      gap={4}
      padding={2}
      borderRadius={8}
      border="1px solid var(--border, #e5e7eb)"
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        text="−"
        aria-label={decreaseLabel}
        title={decreaseLabel}
        size={s.stepSize}
        minWidth={s.stepMinWidth}
        disabled={atMin}
        onClick={() => onChange(value - 1)}
      />
      <Typography
        as="span"
        variant={s.qtyVariant}
        margin={0}
        minWidth={s.qtyMinWidth}
        textAlign="center"
        aria-live="polite"
      >
        {value}
      </Typography>
      <Button
        text="+"
        aria-label={increaseLabel}
        title={increaseLabel}
        size={s.stepSize}
        minWidth={s.stepMinWidth}
        disabled={atMax}
        onClick={() => onChange(value + 1)}
      />
    </Box>
  );
}
