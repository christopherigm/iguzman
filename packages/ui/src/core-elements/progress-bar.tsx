'use client';

import { CSSProperties } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import './progress-bar.css';

export interface ProgressBarProps extends UIComponentProps {
  /**
   * Progress value between 0 and 100.
   * When `undefined`, the bar renders in indeterminate (loading) mode.
   */
  value?: number;
  /** Height of the bar in pixels. @defaultValue 4 */
  size?: number;
  /** Accessible label for the progress bar. @defaultValue "Loading" */
  label?: string;
}

/**
 * ProgressBar — a minimal, animated progress indicator.
 *
 * - Pass a `value` (0–100) for determinate progress.
 * - Omit `value` for an indeterminate loading animation.
 *
 * @example
 * ```tsx
 * <ProgressBar />                 // indeterminate
 * <ProgressBar value={45} />      // 45 %
 * ```
 */
export const ProgressBar = ({
  value,
  size = 4,
  label = 'Loading',
  className,
  id,
  ...rest
}: ProgressBarProps) => {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, value));

  const uiStyle: CSSProperties = buildStyleProps(rest as UIComponentProps);

  const rootClasses = [
    'progress-bar',
    indeterminate && 'progress-bar--indeterminate',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={id}
      className={rootClasses}
      role="progressbar"
      aria-label={label}
      {...(!indeterminate && {
        'aria-valuenow': clamped,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      })}
      style={{ height: size, ...uiStyle }}
    >
      <div
        className="progress-bar__track"
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
};

export default ProgressBar;
