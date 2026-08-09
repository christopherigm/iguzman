import type { Point } from "./breadboard-geometry";
import "./hardware.css";

/**
 * The two parts that do not live on the breadboard: the cell holder and the
 * slide switch.
 *
 * Everything else in this family is placed by the holes its legs go into. These
 * two are placed by a plain `x`/`y`, because on a real build they sit off the
 * board on flying leads - and they expose their lead ends as anchor points so a
 * figure can wire them to a rail exactly as it wires anything else.
 */

const CELL_PITCH = 26;
const BODY_HEIGHT = 84;

export interface BatteryPackProps {
  /** Top-left corner of the holder. */
  x: number;
  y: number;
  /** How many cells to draw. */
  cells?: number;
  label?: string;
  /** Printed under the holder, e.g. the pack voltage. */
  sublabel?: string;
}

/** Where a battery pack's two flying leads end. */
export function batteryPackLeads(
  props: Pick<BatteryPackProps, "x" | "y" | "cells">,
): { positive: Point; negative: Point } {
  const cells = props.cells ?? 4;
  const width = cells * CELL_PITCH + 14;
  return {
    positive: { x: props.x + width, y: props.y + 16 },
    negative: { x: props.x + width, y: props.y + BODY_HEIGHT - 16 },
  };
}

/** A 4×AA holder, cells visible, red and black leads out of one end. */
export function BatteryPack({
  x,
  y,
  cells = 4,
  label = "4 × AA NiMH",
  sublabel,
}: BatteryPackProps) {
  const width = cells * CELL_PITCH + 14;
  const leads = batteryPackLeads({ x, y, cells });

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={BODY_HEIGHT}
        rx={5}
        fill="var(--hw-plastic-dark)"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={1.4}
      />

      {Array.from({ length: cells }, (_, index) => {
        const cellX = x + 8 + index * CELL_PITCH;
        // Cells alternate direction in a holder, which is why the printed
        // polarity on the moulding is worth following rather than guessing.
        const flipped = index % 2 === 1;
        return (
          <g key={`cell-${index}`}>
            <rect
              x={cellX}
              y={y + 12}
              width={CELL_PITCH - 8}
              height={BODY_HEIGHT - 24}
              rx={3}
              fill="#3d4249"
              stroke="#575d66"
              strokeWidth={1}
            />
            {/* the button terminal, at whichever end this cell faces */}
            <rect
              x={cellX + 3}
              y={flipped ? y + BODY_HEIGHT - 18 : y + 14}
              width={CELL_PITCH - 14}
              height={4}
              rx={2}
              fill="var(--hw-metal)"
            />
            <text
              className="hw-label-sm"
              x={cellX + (CELL_PITCH - 8) / 2}
              y={flipped ? y + 26 : y + BODY_HEIGHT - 16}
              textAnchor="middle"
              fill="var(--hw-silk)"
            >
              {flipped ? "−" : "+"}
            </text>
          </g>
        );
      })}

      {/* flying leads */}
      <path
        d={`M${x + width - 6},${y + 16} L${leads.positive.x},${leads.positive.y}`}
        stroke="#d1382b"
        strokeWidth={4.6}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${x + width - 6},${y + BODY_HEIGHT - 16} L${leads.negative.x},${leads.negative.y}`}
        stroke="#26292e"
        strokeWidth={4.6}
        strokeLinecap="round"
        fill="none"
      />

      <text
        className="hw-label"
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
      >
        {label}
      </text>
      {sublabel ? (
        <text
          className="hw-label-sm"
          x={x + width / 2}
          y={y + BODY_HEIGHT + 15}
          textAnchor="middle"
        >
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Slide switch
   ══════════════════════════════════════════════════════════════════════════ */

const SWITCH_WIDTH = 54;
const SWITCH_HEIGHT = 30;

export interface SlideSwitchProps {
  /** Top-left corner of the switch body. */
  x: number;
  y: number;
  /** Which way the actuator is thrown. */
  on?: boolean;
  label?: string;
}

/** Where a slide switch's two wired terminals are. */
export function slideSwitchTerminals(
  props: Pick<SlideSwitchProps, "x" | "y">,
): { left: Point; right: Point } {
  return {
    left: { x: props.x, y: props.y + SWITCH_HEIGHT / 2 },
    right: { x: props.x + SWITCH_WIDTH, y: props.y + SWITCH_HEIGHT / 2 },
  };
}

/**
 * An SPDT slide switch.
 *
 * The actuator is drawn thrown to whichever side `on` says, so a figure can
 * show the circuit both made and broken with the same component - which is more
 * useful than it sounds for a build whose switch is in the *negative* lead,
 * where "off" is not where a reader expects to find it.
 */
export function SlideSwitch({
  x,
  y,
  on = true,
  label = "SW1",
}: SlideSwitchProps) {
  const terminals = slideSwitchTerminals({ x, y });

  return (
    <g>
      {/* terminal tabs */}
      {[terminals.left, terminals.right].map((terminal, index) => (
        <rect
          key={`tab-${index}`}
          x={terminal.x - 7}
          y={terminal.y - 3}
          width={14}
          height={6}
          rx={1.5}
          fill="var(--hw-metal)"
          stroke="var(--hw-metal-dark)"
          strokeWidth={0.8}
        />
      ))}

      <rect
        x={x}
        y={y}
        width={SWITCH_WIDTH}
        height={SWITCH_HEIGHT}
        rx={3}
        fill="var(--hw-plastic-dark)"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={1.2}
      />
      {/* the slot the actuator travels in */}
      <rect
        x={x + 9}
        y={y + SWITCH_HEIGHT / 2 - 5}
        width={SWITCH_WIDTH - 18}
        height={10}
        rx={2}
        fill="#0d0f12"
      />
      <rect
        x={on ? x + SWITCH_WIDTH - 24 : x + 11}
        y={y + SWITCH_HEIGHT / 2 - 8}
        width={13}
        height={16}
        rx={2}
        fill="var(--hw-metal)"
        stroke="var(--hw-metal-dark)"
        strokeWidth={1}
      />

      <text
        className="hw-label"
        x={x + SWITCH_WIDTH / 2}
        y={y - 8}
        textAnchor="middle"
      >
        {label}
      </text>
      <text
        className="hw-label-sm"
        x={x + SWITCH_WIDTH / 2}
        y={y + SWITCH_HEIGHT + 14}
        textAnchor="middle"
      >
        {on ? "on" : "off"}
      </text>
    </g>
  );
}
