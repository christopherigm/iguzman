'use client';

import { useId } from 'react';
import { buildStyleProps } from './utils';
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
export function Slider({ steps, value, onChange, label, disabled, ...rest }: SliderProps) {
  const id = useId();
  const currentIndex = steps.findIndex((s) => s.value === value);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const max = Math.max(steps.length - 1, 1);
  const pct = (safeIndex / max) * 100;

  const style = buildStyleProps(rest);

  return (
    <div
      className={['ui-slider', rest.className].filter(Boolean).join(' ')}
      style={{ ...style, ...(rest.styles ?? {}) }}
    >
      {label && (
        <label className="ui-slider__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="ui-slider__track-wrapper">
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
          style={{ '--ui-slider-pct': `${pct}%` } as React.CSSProperties}
          aria-valuetext={steps[safeIndex]?.label ?? String(safeIndex)}
        />
      </div>
      <div className="ui-slider__labels" aria-hidden="true">
        {steps.map((step, i) => (
          <span
            key={String(step.value)}
            className={[
              'ui-slider__tick-label',
              i === safeIndex ? 'ui-slider__tick-label--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (!disabled) onChange(step.value);
            }}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
