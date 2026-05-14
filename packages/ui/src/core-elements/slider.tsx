'use client';

import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Box } from './box';
import { Typography } from './typography';
import type { UIComponentProps } from './utils';
import './slider.css';

export interface SliderStep {
  value: string | number;
  label: string;
}

export interface SliderProps extends UIComponentProps {
  /** Ordered list of discrete steps. */
  steps: SliderStep[];
  /** Currently selected step value. */
  value: string | number;
  /** Called with the new step value when the user moves the slider. */
  onChange: (value: string | number) => void;
  /** Optional label rendered above the track. */
  label?: string;
  /** Whether the slider is interactive. */
  disabled?: boolean;
}

/**
 * Slider — discrete range input with labelled tick marks.
 *
 * @example
 * <Slider
 *   steps={[{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]}
 *   value={count}
 *   onChange={setCount}
 *   label="Number of paragraphs"
 * />
 */
export function Slider({
  steps,
  value,
  onChange,
  label,
  disabled,
  ...rest
}: SliderProps) {
  const id = useId();
  const currentIndex = steps.findIndex((s) => s.value === value);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const max = Math.max(steps.length - 1, 1);
  const pct = (safeIndex / max) * 100;

  const { className: userClassName, ...boxRest } = rest;

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={6}
      width="100%"
      {...boxRest}
      className={['ui-slider', userClassName].filter(Boolean).join(' ')}
    >
      {label && (
        <Typography
          as="label"
          htmlFor={id}
          fontWeight={600}
          color="var(--foreground, #1a1a1a)"
          styles={{ fontSize: 13, userSelect: 'none' }}
        >
          {label}
        </Typography>
      )}
      <Box width="100%" padding="6px 0" styles={{ position: 'relative' }}>
        <input
          id={id}
          type="range"
          className="ui-slider__input"
          min={0}
          max={max}
          step={1}
          value={safeIndex}
          disabled={disabled}
          onChange={(e) => {
            const idx = Number(e.target.value);
            if (steps[idx]) onChange(steps[idx].value);
          }}
          style={{ '--ui-slider-pct': `${pct}%` } as CSSProperties}
          aria-valuetext={steps[safeIndex]?.label ?? String(safeIndex)}
        />
      </Box>
      <Box
        width="100%"
        marginTop={2}
        aria-hidden={true}
        styles={{ position: 'relative', height: '20px' }}
      >
        {steps.map((step, i) => (
          <span
            key={String(step.value)}
            className={[
              'ui-slider__tick-label',
              i === safeIndex ? 'ui-slider__tick-label--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              {
                '--ui-slider-label-pct': max > 0 ? i / max : 0,
              } as CSSProperties
            }
            onClick={() => {
              if (!disabled) onChange(step.value);
            }}
          >
            {step.label}
          </span>
        ))}
      </Box>
    </Box>
  );
}
