import { angleDegrees, midpoint, type Point } from "./breadboard-geometry";
import { Lead } from "./wire";
import "./hardware.css";

/**
 * 5 mm LEDs - a plain one, and the four-legged common-cathode RGB part.
 *
 * Both are drawn from above-and-behind, the way one looks lying on a board:
 * the domed lens, the flat on the cathode side, the two legs of unequal length.
 * That flat is the point of drawing them pictorially at all - "the short leg,
 * on the flattened side, is the cathode" is a sentence a schematic's triangle
 * cannot say, and getting it backwards is the single most common reason a
 * beginner's LED does not light.
 */

/** What the die is doing. `flicker` is the firmware's flame, not a fault. */
export type LedState = "off" | "on" | "pulse" | "flicker";

const GLOW_CLASS: Record<LedState, string | undefined> = {
  off: undefined,
  on: undefined,
  pulse: "hw-glow-pulse",
  flicker: "hw-glow-flicker",
};

/** The lens body, drawn at `centre` and rotated to lie along its own legs. */
function LedBody({
  centre,
  rotation,
  color,
  state,
  radius,
  glowId,
}: {
  centre: Point;
  rotation: number;
  color: string;
  state: LedState;
  radius: number;
  glowId: string;
}) {
  const lit = state !== "off";

  return (
    <g transform={`translate(${centre.x},${centre.y}) rotate(${rotation})`}>
      {lit ? (
        <circle
          className={GLOW_CLASS[state]}
          cx={0}
          cy={0}
          r={radius * 3.1}
          fill={`url(#${glowId})`}
          opacity={state === "on" ? 0.9 : undefined}
        />
      ) : null}

      {/* The flange every 5 mm LED has around its base. Its outline carries a
          real weight because a warm-white lens on an ivory breadboard has
          almost no fill contrast to find an edge from. */}
      <circle
        cx={0}
        cy={0}
        r={radius * 1.22}
        fill={color}
        opacity={0.55}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={1.2}
      />
      {/* the flat on the cathode side - the whole reason to draw this part
          pictorially rather than as a triangle */}
      <path
        d={`M${-radius * 1.22},${radius * 0.72} L${radius * 1.22},${radius * 0.72} L${radius * 1.22},${radius * 1.1} L${-radius * 1.22},${radius * 1.1} Z`}
        fill={color}
        opacity={0.75}
      />
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={color}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={1.2}
      />
      {/* specular highlight, so the dome reads as glass */}
      <ellipse
        cx={-radius * 0.3}
        cy={-radius * 0.34}
        rx={radius * 0.3}
        ry={radius * 0.22}
        fill="rgba(255,255,255,0.7)"
      />
    </g>
  );
}

export interface LedProps {
  /** The hole the long leg goes in. */
  anode: Point;
  /** The hole the short leg, on the flattened side, goes in. */
  cathode: Point;
  /** The lens colour, as CSS. */
  color?: string;
  state?: LedState;
  /** Drawn lens radius. A 5 mm lens is about half a pitch. */
  radius?: number;
  /** A stable id for this LED's glow gradient - must be unique in the figure. */
  id: string;
  /** Print `+`/`−` beside the legs. */
  polarity?: boolean;
}

/** A single-colour 5 mm through-hole LED. */
export function Led({
  anode,
  cathode,
  color = "#e0453a",
  state = "on",
  radius = 9,
  id,
  polarity = true,
}: LedProps) {
  const centre = midpoint(anode, cathode);
  // The body sits between the legs, square to the run between them.
  const rotation = angleDegrees(anode, cathode) - 90;
  const glowId = `hw-glow-${id}`;

  return (
    <g>
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0%" stopColor={color} stopOpacity="0.85" />
          <stop offset="45%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The anode leg is drawn longer, as it is on the part. */}
      <Lead from={anode} to={centre} bow={0.06} bowDirection={1} />
      <Lead from={cathode} to={centre} bow={0.06} bowDirection={-1} />

      <LedBody
        centre={centre}
        rotation={rotation}
        color={color}
        state={state}
        radius={radius}
        glowId={glowId}
      />

      {polarity ? (
        <g className="hw-label-sm" textAnchor="middle">
          <text x={anode.x} y={anode.y + (anode.y > centre.y ? 16 : -9)}>
            +
          </text>
          <text x={cathode.x} y={cathode.y + (cathode.y > centre.y ? 16 : -9)}>
            −
          </text>
        </g>
      ) : null}
    </g>
  );
}

export interface RgbLedProps {
  /** The four holes, in the part's own leg order. */
  red: Point;
  cathode: Point;
  green: Point;
  blue: Point;
  /** Which dice are lit, and how. */
  state?: { red?: LedState; green?: LedState; blue?: LedState };
  radius?: number;
  id: string;
}

/**
 * A four-legged common-cathode RGB LED.
 *
 * Leg order on the part is **red · cathode · green · blue**, with the cathode
 * the longest leg - not the neat R/G/B-plus-common a reader might assume, and
 * the reason this component takes four named holes rather than a start hole and
 * a direction. The lens is drawn as three sectors so it is obvious that one
 * package holds three separate dice sharing one return.
 */
export function RgbLed({
  red,
  cathode,
  green,
  blue,
  state = { red: "on", green: "off", blue: "off" },
  radius = 11,
  id,
}: RgbLedProps) {
  // The package centres over its four legs; they run in a line, so the midpoint
  // of the outermost two is the middle of the part.
  const centre = midpoint(red, blue);
  const rotation = angleDegrees(red, blue) - 90;

  const dice: {
    key: "red" | "green" | "blue";
    color: string;
    from: number;
    to: number;
  }[] = [
    { key: "red", color: "#e0453a", from: 90, to: 210 },
    { key: "green", color: "#3fb45c", from: 210, to: 330 },
    { key: "blue", color: "#3f7fd6", from: 330, to: 450 },
  ];

  /** A pie sector of the lens, for one die. */
  const sector = (from: number, to: number) => {
    const point = (angle: number) => {
      const rad = (angle * Math.PI) / 180;
      return `${(Math.cos(rad) * radius).toFixed(2)},${(
        Math.sin(rad) * radius
      ).toFixed(2)}`;
    };
    return `M0,0 L${point(from)} A${radius},${radius} 0 0 1 ${point(to)} Z`;
  };

  return (
    <g>
      <defs>
        {dice.map(({ key, color }) => (
          <radialGradient key={key} id={`hw-glow-${id}-${key}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <stop offset="45%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      {[red, cathode, green, blue].map((leg, index) => (
        <Lead
          key={`leg-${index}`}
          from={leg}
          to={centre}
          bow={0.05}
          bowDirection={leg.x < centre.x ? 1 : -1}
        />
      ))}

      <g transform={`translate(${centre.x},${centre.y}) rotate(${rotation})`}>
        {/* glow per lit die, all centred - three overlapping haloes mix on the
            page the way three dice in one lens mix in the room */}
        {dice.map(({ key }) => {
          const dieState = state[key] ?? "off";
          if (dieState === "off") return null;
          return (
            <circle
              key={`glow-${key}`}
              className={GLOW_CLASS[dieState]}
              cx={0}
              cy={0}
              r={radius * 2.8}
              fill={`url(#hw-glow-${id}-${key})`}
              opacity={dieState === "on" ? 0.9 : undefined}
            />
          );
        })}

        <circle
          cx={0}
          cy={0}
          r={radius * 1.16}
          fill="rgba(210,214,220,0.5)"
          stroke="rgba(0,0,0,0.28)"
          strokeWidth={0.8}
        />
        {dice.map(({ key, color, from, to }) => (
          <path
            key={`sector-${key}`}
            d={sector(from, to)}
            fill={color}
            opacity={(state[key] ?? "off") === "off" ? 0.32 : 0.85}
          />
        ))}
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={1}
        />
        <ellipse
          cx={-radius * 0.3}
          cy={-radius * 0.34}
          rx={radius * 0.28}
          ry={radius * 0.2}
          fill="rgba(255,255,255,0.6)"
        />
      </g>

      {/* Leg names, since the order is the thing people get wrong. */}
      <g className="hw-label-sm" textAnchor="middle">
        {[
          { at: red, text: "R" },
          { at: cathode, text: "−" },
          { at: green, text: "G" },
          { at: blue, text: "B" },
        ].map(({ at, text }) => (
          <text key={text} x={at.x} y={at.y - radius * 1.3 - 7}>
            {text}
          </text>
        ))}
      </g>
    </g>
  );
}
