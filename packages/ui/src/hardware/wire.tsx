import { distance, type Point } from "./breadboard-geometry";
import "./hardware.css";

/**
 * Jumper wires, and the component legs that are drawn the same way.
 *
 * A pictorial wiring drawing lives or dies on its wires: they are the thing the
 * reader is being asked to reproduce, and a schematic's right-angled traces are
 * exactly what a beginner cannot map onto a fistful of loose jumpers. So these
 * bow, the way a real wire lying on a board does, and they carry their colour
 * literally - a red wire in the drawing is a red wire in your hand.
 */

/** Common jumper-wire colours, so a figure names them instead of guessing hex. */
export const WIRE_COLORS = {
  red: "#d1382b",
  black: "#26292e",
  blue: "#2f6fc4",
  green: "#2f9152",
  yellow: "#e0b32c",
  orange: "#df7c26",
  white: "#e9e9e6",
  grey: "#8b9099",
  purple: "#8455b5",
} as const;

export type WireColor = keyof typeof WIRE_COLORS;

export interface WireProps {
  from: Point;
  to: Point;
  /** A name from `WIRE_COLORS`, or any CSS colour for something off-palette. */
  color?: WireColor | string;
  /**
   * How far the wire bows away from the straight line between its ends, as a
   * fraction of its own length. `0` draws it taut.
   */
  bow?: number;
  /** Which side it bows towards. Flip it when two wires would overlap. */
  bowDirection?: 1 | -1;
  thickness?: number;
  /**
   * Animate current travelling from `from` to `to`.
   *
   * This is the drawing's one piece of real teaching motion, so use it where
   * direction is the lesson - the supply rails, the ground return - and leave
   * it off signal wires, where a dozen crawling dashes just make the figure
   * noisy.
   */
  flow?: boolean;
  /** Draw the little plug ends. Off for a component's own leg. */
  ends?: boolean;
}

/** The bowed path between two points, as an SVG `d` string. */
function wirePath(from: Point, to: Point, bow: number, direction: 1 | -1) {
  if (bow === 0) return `M${from.x},${from.y} L${to.x},${to.y}`;

  const length = distance(from, to);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  // Normal to the run, so the bow is always perpendicular to the wire.
  const normalX = -(to.y - from.y) / (length || 1);
  const normalY = (to.x - from.x) / (length || 1);
  const offset = length * bow * direction;

  return `M${from.x},${from.y} Q${midX + normalX * offset},${
    midY + normalY * offset
  } ${to.x},${to.y}`;
}

/** A single jumper wire. */
export function Wire({
  from,
  to,
  color = "grey",
  bow = 0.09,
  bowDirection = 1,
  thickness = 4.6,
  flow = false,
  ends = true,
}: WireProps) {
  const stroke = WIRE_COLORS[color as WireColor] ?? color;
  const d = wirePath(from, to, bow, bowDirection);

  return (
    <g>
      {/* A darker casing under the wire keeps it legible when it crosses one
          of its own colour, or the board's own plastic. */}
      <path
        d={d}
        fill="none"
        stroke="rgba(0,0,0,0.34)"
        strokeWidth={thickness + 1.8}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      {flow ? (
        <path
          className="hw-flow"
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={thickness * 0.42}
        />
      ) : null}
      {ends ? (
        <>
          <circle cx={from.x} cy={from.y} r={thickness * 0.62} fill={stroke} />
          <circle cx={to.x} cy={to.y} r={thickness * 0.62} fill={stroke} />
        </>
      ) : null}
    </g>
  );
}

/**
 * A component's own tinned lead, bent from its body down into a hole.
 *
 * Same geometry as a wire but drawn thin and in bare metal, so the eye reads
 * "this is the part's leg" rather than "this is another jumper you have to
 * add" - a distinction the schematic view does not have to make, because there
 * every line is just a connection.
 */
export function Lead({
  from,
  to,
  bow = 0,
  bowDirection = 1,
  thickness = 2.2,
}: {
  from: Point;
  to: Point;
  bow?: number;
  bowDirection?: 1 | -1;
  thickness?: number;
}) {
  const d = wirePath(from, to, bow, bowDirection);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="var(--hw-metal-dark)"
        strokeWidth={thickness + 1}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--hw-metal)"
        strokeWidth={thickness}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * A callout tying a label to a point on the drawing.
 *
 * Pictorial figures have nowhere to write a value *on* the part - a 5 mm LED is
 * 9 px across at this scale - so the values that a schematic prints beside its
 * symbols have to hang off a leader line instead.
 */
export function Callout({
  at,
  to,
  children,
  anchor = "start",
}: {
  at: Point;
  to: Point;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <g>
      <line
        x1={at.x}
        y1={at.y}
        x2={to.x}
        y2={to.y}
        stroke="var(--hw-ink-soft)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <circle cx={at.x} cy={at.y} r={1.8} fill="var(--hw-ink-soft)" />
      <text className="hw-label" x={to.x} y={to.y} textAnchor={anchor}>
        {children}
      </text>
    </g>
  );
}
