import type { ReactNode } from "react";
import {
  HOLE_PITCH,
  HOLE_RADIUS,
  RAIL_ROWS,
  TERMINAL_ROWS,
  railHasHole,
  type BreadboardLayout,
} from "./breadboard-geometry";
import "./hardware.css";

/**
 * The drawing surface and the breadboard that sits on it.
 *
 * `PictorialFigure` is the `<svg>` every pictorial hardware drawing opens with;
 * `Breadboard` renders one board's plastic, holes and power rails at the
 * position a `BreadboardLayout` describes.
 *
 * Both are plain server components - the animations they host are CSS, so
 * nothing here needs `"use client"` and a documentation page stays server-
 * rendered.
 */

export interface PictorialFigureProps {
  /** Drawing width and height in SVG user units. */
  width: number;
  height: number;
  /**
   * The long description a screen reader gets. A wiring drawing is opaque
   * without one, so it is required rather than optional - the same rule the
   * schematic figures in `apps/help` already follow.
   */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The `<svg>` a pictorial drawing lives in.
 *
 * It keeps its intrinsic width and is expected to sit inside a horizontally
 * scrolling box on a narrow screen - squeezing a breadboard until the hole grid
 * collapses is worse than panning it.
 */
export function PictorialFigure({
  width,
  height,
  label,
  children,
  className,
}: PictorialFigureProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className={className ? `hw-fig ${className}` : "hw-fig"}
    >
      {children}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Breadboard
   ══════════════════════════════════════════════════════════════════════════ */

export interface BreadboardProps {
  layout: BreadboardLayout;
  /**
   * Draw the column numbers and row letters printed on the moulding.
   * On by default: they are how a reader carries "row e, column 12" from the
   * drawing to the board in front of them.
   */
  markings?: boolean;
  /** Column-number interval. Every 5th column, as on the real part. */
  markingInterval?: number;
}

/** One socket. Drawn as a recess with a slot, not a flat dot. */
function Hole({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={HOLE_RADIUS} fill="var(--hw-hole)" />
      <rect
        x={x - 1}
        y={y - HOLE_RADIUS + 0.6}
        width={2}
        height={HOLE_RADIUS * 2 - 1.2}
        rx={0.8}
        fill="var(--hw-hole-slot)"
      />
    </g>
  );
}

/** A solderless breadboard: plastic, two terminal banks, four power rails. */
export function Breadboard({
  layout,
  markings = true,
  markingInterval = 5,
}: BreadboardProps) {
  const columns = Array.from({ length: layout.columns }, (_, i) => i + 1);

  return (
    <g>
      {/* plastic */}
      <rect
        x={layout.x}
        y={layout.y}
        width={layout.width}
        height={layout.height}
        rx={6}
        fill="var(--hw-board)"
        stroke="var(--hw-board-edge)"
        strokeWidth={1.5}
      />

      {/* the ravine down the middle */}
      <rect
        x={layout.x + 4}
        y={layout.ravine.top}
        width={layout.width - 8}
        height={layout.ravine.bottom - layout.ravine.top}
        rx={2}
        fill="var(--hw-board-groove)"
        stroke="var(--hw-board-edge)"
        strokeWidth={1}
      />

      {/*
        The red and blue guide stripes, each printed on the *outward* side of
        its row of holes: red above the top `+`, blue below the top `−`, and
        mirrored on the bottom pair. That outward placement is what tells a
        reader at a glance which rail a hole belongs to.
      */}
      {RAIL_ROWS.map((row) => {
        const outward = row === "+t" || row === "-b" ? -1 : 1;
        const y = layout.rowY(row) + outward * HOLE_PITCH * 0.44;
        return (
          <line
            key={`stripe-${row}`}
            x1={layout.x + 12}
            x2={layout.x + layout.width - 12}
            y1={y}
            y2={y}
            stroke={
              row.startsWith("+")
                ? "var(--hw-rail-positive)"
                : "var(--hw-rail-negative)"
            }
            strokeWidth={1.4}
          />
        );
      })}

      {/* rail holes - five, a gap, five */}
      {RAIL_ROWS.map((row) =>
        columns
          .filter(railHasHole)
          .map((column) => (
            <Hole key={`${row}${column}`} {...layout.hole(column, row)} />
          )),
      )}

      {/* terminal holes */}
      {TERMINAL_ROWS.map((row) =>
        columns.map((column) => (
          <Hole key={`${row}${column}`} {...layout.hole(column, row)} />
        )),
      )}

      {markings ? (
        <g className="hw-label-sm">
          {/* ± signs at both ends of each rail */}
          {RAIL_ROWS.map((row) => {
            const y = layout.rowY(row) + 3.2;
            const sign = row.startsWith("+") ? "+" : "−";
            const fill = row.startsWith("+")
              ? "var(--hw-rail-positive)"
              : "var(--hw-rail-negative)";
            return (
              <g key={`sign-${row}`} fill={fill}>
                <text x={layout.x + 5} y={y}>
                  {sign}
                </text>
                <text x={layout.x + layout.width - 10} y={y}>
                  {sign}
                </text>
              </g>
            );
          })}

          {/* column numbers above the upper bank and below the lower one */}
          {columns
            .filter((column) => column % markingInterval === 0 || column === 1)
            .map((column) => (
              <g key={`col-${column}`} textAnchor="middle">
                <text x={layout.columnX(column)} y={layout.rowY("j") - 8}>
                  {column}
                </text>
                <text x={layout.columnX(column)} y={layout.rowY("a") + 14}>
                  {column}
                </text>
              </g>
            ))}

          {/* row letters, at both ends */}
          {TERMINAL_ROWS.map((row) => (
            <g key={`row-${row}`}>
              <text x={layout.x + 4} y={layout.rowY(row) + 3.2}>
                {row}
              </text>
              <text x={layout.x + layout.width - 11} y={layout.rowY(row) + 3.2}>
                {row}
              </text>
            </g>
          ))}
        </g>
      ) : null}
    </g>
  );
}
