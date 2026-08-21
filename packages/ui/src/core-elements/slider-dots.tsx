"use client";

import React, { CSSProperties } from "react";
import { UIComponentProps, buildStyleProps } from "./utils";
import { Box } from "./box";
import {
  IconButton,
  type IconButtonKind,
  type IconButtonSize,
} from "./icon-button";
import "./slider-dots.css";

/** The default arrow glyphs. Every app keeps this pair in `public/icons/`. */
export const SLIDER_PREV_ICON = "/icons/prev.svg";
export const SLIDER_NEXT_ICON = "/icons/next.svg";

/**
 * Props for `SliderDots`.
 */
export interface SliderDotsProps extends UIComponentProps {
  /** How many dots to draw - one per slide, or one per snap position. */
  count: number;
  /** Index of the dot that reads as current. */
  active: number;
  /** Called with the index of the dot pressed. */
  onSelect: (index: number) => void;
  /** Names the dot row itself for a screen reader, e.g. "Pagination". */
  label: string;
  /**
   * Accessible label for dot `index`. **Pass it whenever the slides have
   * titles**: "Fawn in the north meadow" is a better destination than "3", and
   * the caller is the side that holds the translated strings. Defaults to the
   * 1-based position.
   */
  dotLabel?: (index: number) => string;
}

/**
 * Props for `SliderControls`.
 */
export interface SliderControlsProps extends SliderDotsProps {
  /** Steps back one slide. */
  onPrev: () => void;
  /** Steps forward one slide. */
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  /** Overrides the back glyph. Defaults to `/icons/prev.svg`. */
  previousIcon?: string;
  /** Overrides the forward glyph. Defaults to `/icons/next.svg`. */
  nextIcon?: string;
  /** Semantic colour of the two arrows. Defaults to `'primary'`. */
  arrowKind?: IconButtonKind;
  /** Arrow box size. Defaults to `'md'`. */
  arrowSize?: IconButtonSize;
  /**
   * Backdrop-blurs the arrows so they blend into a translucent surface.
   * Defaults to `true` - the row normally sits under a slide, over the page's
   * own background. Turn it off inside an opaque card.
   */
  translucentArrows?: boolean;
}

/**
 * SliderDots - the row of dots under a slider: one per slide, counting them and
 * jumping to one.
 *
 * The current slide reads as a **pill** rather than a bigger dot, so the row
 * keeps its height and nothing below it shifts on a slide change. Both states
 * are painted from `--accent-text` (the site's primary colour, walked until it
 * is legible on this theme's surfaces - a dot is ink drawn on the page, so a
 * single dark brand hex would otherwise vanish in dark mode): the inactive dots
 * are the same hue mixed down to a tint, so the row is one colour at two
 * strengths rather than an accent dot among grey ones.
 *
 * It is deliberately **slider-agnostic** - it takes a count, an index and a
 * callback, and knows nothing about Swiper. A looping single-view slider passes
 * `realIndex` / `slideToLoop`; a multi-view one passes `snapIndex` /
 * `snapGrid.length` / `slideTo`, which is what keeps the last dots reachable
 * when several slides share the viewport.
 *
 * ⚠ The dots are plain `<button>`s, not `@repo/ui` components, so the
 * props-first rule does not reach them: their whole look lives in
 * `slider-dots.css`.
 *
 * @example
 * <SliderDots
 *   count={slides.length}
 *   active={index}
 *   onSelect={(i) => swiper?.slideToLoop(i)}
 *   label={t("pagination")}
 *   dotLabel={(i) => slides[i]!.title}
 * />
 */
export const SliderDots: React.FC<SliderDotsProps> = (props) => {
  const { count, active, onSelect, label, dotLabel, className, id } = props;

  if (count <= 0) return null;

  const finalStyle: CSSProperties = {
    ...buildStyleProps(props as UIComponentProps),
    ...props.styles,
  };

  const classes = ["ui-slider-dots", className].filter(Boolean).join(" ");

  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      className={classes}
      style={finalStyle}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={dotLabel ? dotLabel(i) : String(i + 1)}
          aria-current={i === active}
          className={
            i === active
              ? "ui-slider-dots__dot ui-slider-dots__dot--active"
              : "ui-slider-dots__dot"
          }
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
};

/**
 * SliderControls - one control row beneath a slider: the two arrows flanking
 * the `SliderDots`.
 *
 * The row sits **below** the slide rather than floating over it, so a button is
 * never parked on top of the content it is paging through - and the dots stay
 * between the arrows, where the count is read in the same sweep as the step.
 * The arrows default to `kind="primary"`, so the whole row - dots and steps -
 * is the site's own accent rather than an unrelated green.
 *
 * Renders nothing for a single slide: one dot between two dead arrows says
 * only that there is nothing to page.
 *
 * @example
 * <SliderControls
 *   count={slides.length}
 *   active={index}
 *   onSelect={(i) => swiper?.slideToLoop(i)}
 *   onPrev={() => swiper?.slidePrev()}
 *   onNext={() => swiper?.slideNext()}
 *   label={t("pagination")}
 *   previousLabel={t("previous")}
 *   nextLabel={t("next")}
 * />
 */
export const SliderControls: React.FC<SliderControlsProps> = (props) => {
  const {
    count,
    active,
    onSelect,
    label,
    dotLabel,
    onPrev,
    onNext,
    previousLabel,
    nextLabel,
    previousIcon = SLIDER_PREV_ICON,
    nextIcon = SLIDER_NEXT_ICON,
    arrowKind = "primary",
    arrowSize = "md",
    translucentArrows = true,
    className,
    id,
  } = props;

  if (count <= 1) return null;

  return (
    <Box
      id={id}
      className={className}
      justifyContent="center"
      alignItems="center"
      gap={16}
      width="100%"
      // Layout props the caller passed (`marginTop`, a narrower `width`, …) ride
      // in `styles`, which `Box` applies over its own props - so a caller can
      // override the row's defaults without this component re-listing them all.
      styles={{
        ...buildStyleProps(props as UIComponentProps),
        ...props.styles,
      }}
    >
      <IconButton
        icon={previousIcon}
        aria-label={previousLabel}
        onClick={onPrev}
        kind={arrowKind}
        size={arrowSize}
        translucent={translucentArrows}
      />

      <SliderDots
        count={count}
        active={active}
        onSelect={onSelect}
        label={label}
        dotLabel={dotLabel}
      />

      <IconButton
        icon={nextIcon}
        aria-label={nextLabel}
        onClick={onNext}
        kind={arrowKind}
        size={arrowSize}
        translucent={translucentArrows}
      />
    </Box>
  );
};

export default SliderDots;
