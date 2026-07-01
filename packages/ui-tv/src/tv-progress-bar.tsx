import "./tokens.css";
import "./tv-progress-bar.css";

export interface TvProgressBarProps {
  /** Progress 0-100. Omit for an indeterminate (loading) animation. */
  value?: number;
  /** Bar height in px. @default 6 */
  size?: number;
  /** Accessible label. @default "Loading" */
  label?: string;
  className?: string;
}

/**
 * TvProgressBar - 10-foot port of @repo/ui's `ProgressBar`.
 *
 * Pass a `value` (0-100) for determinate progress, or omit it for an
 * indeterminate loading animation. Written for old Tizen Chromium (76): only
 * `border-radius` and a `transform: translateX` animation (no `color-mix`,
 * `inset` or `aspect-ratio`); consumes the host palette tokens
 * (`--surface-2`, `--accent`).
 */
export function TvProgressBar({
  value,
  size = 6,
  label = "Loading",
  className,
}: TvProgressBarProps) {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, value));

  const cls = [
    "tv-progress-bar",
    indeterminate ? "tv-progress-bar--indeterminate" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      role="progressbar"
      aria-label={label}
      {...(!indeterminate && {
        "aria-valuenow": clamped,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
      })}
      style={{ height: size }}
    >
      <div
        className="tv-progress-bar__track"
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}

export default TvProgressBar;
