import type { Point } from "./breadboard-geometry";
import "./hardware.css";

/**
 * The parts that do not live on the breadboard: the cell holder, the slide
 * switch, the loudspeaker and the volume pot.
 *
 * Everything else in this family is placed by the holes its legs go into. These
 * are placed by a plain `x`/`y`, because on a real build they sit off the board
 * on flying leads - and they expose their lead ends as anchor points so a
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

/* ══════════════════════════════════════════════════════════════════════════
   Loudspeaker
   ══════════════════════════════════════════════════════════════════════════ */

const SPEAKER_SIZE = 88;

export interface SpeakerProps {
  /** Top-left corner of the speaker's frame. */
  x: number;
  y: number;
  /** Frame width and height. A 40 mm mini cone is roughly square. */
  size?: number;
  label?: string;
  /** Printed under it, e.g. the impedance and rating. */
  sublabel?: string;
  /** Radiate sound rings, as the buzzer does. */
  sounding?: boolean;
}

/** Where a speaker's two flying leads end. */
export function speakerTerminals(
  props: Pick<SpeakerProps, "x" | "y" | "size">,
): { positive: Point; negative: Point } {
  const size = props.size ?? SPEAKER_SIZE;
  return {
    positive: { x: props.x, y: props.y + size * 0.34 },
    negative: { x: props.x, y: props.y + size * 0.66 },
  };
}

/**
 * A small cone loudspeaker, drawn face-on with its two solder tabs.
 *
 * Its polarity is marked and deliberately drawn, but the note it carries is the
 * opposite of the capacitor's next door: getting a single speaker backwards is
 * **inaudible**. It only matters where two of them share a cabinet, at which
 * point the pair cancel each other in the bass. The drawing says which tab is
 * which so a reader who has met "watch the polarity" everywhere else in the
 * build does not go looking for a mistake that would not be one.
 */
export function Speaker({
  x,
  y,
  size = SPEAKER_SIZE,
  label = "SPK1",
  sublabel,
  sounding = false,
}: SpeakerProps) {
  const terminals = speakerTerminals({ x, y, size });
  const centre = { x: x + size / 2, y: y + size / 2 };
  const cone = size * 0.4;

  return (
    <g>
      {sounding
        ? [0, 1, 2].map((ring) => (
            <circle
              key={`ring-${ring}`}
              className="hw-sound-arc"
              cx={centre.x}
              cy={centre.y}
              r={cone * (1.22 + ring * 0.2)}
              fill="none"
              stroke="var(--hw-ink-soft)"
              strokeWidth={1.6}
            />
          ))
        : null}

      {/* the stamped steel basket */}
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={size * 0.14}
        fill="var(--hw-metal-dark)"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={1.2}
      />
      {/* the four mounting ears every one of these has in its corners */}
      {[
        [x + size * 0.12, y + size * 0.12],
        [x + size * 0.88, y + size * 0.12],
        [x + size * 0.12, y + size * 0.88],
        [x + size * 0.88, y + size * 0.88],
      ].map(([cx, cy], index) => (
        <circle
          key={`ear-${index}`}
          cx={cx}
          cy={cy}
          r={size * 0.045}
          fill="var(--hw-plastic-dark)"
        />
      ))}

      {/* cone, surround and dust cap */}
      <circle cx={centre.x} cy={centre.y} r={cone} fill="#1a1c20" />
      <circle
        cx={centre.x}
        cy={centre.y}
        r={cone * 0.86}
        fill="none"
        stroke="#3d4148"
        strokeWidth={size * 0.06}
      />
      <circle cx={centre.x} cy={centre.y} r={cone * 0.34} fill="#33373e" />

      {/* solder tabs and their flying leads */}
      {[
        { at: terminals.positive, mark: "+", color: "#cf4a3c" },
        { at: terminals.negative, mark: "−", color: "#23262b" },
      ].map(({ at, mark, color }) => (
        <g key={mark}>
          <rect
            x={at.x}
            y={at.y - 4}
            width={size * 0.16}
            height={8}
            rx={1.5}
            fill="var(--hw-metal)"
            stroke="var(--hw-metal-dark)"
            strokeWidth={0.8}
          />
          <circle cx={at.x} cy={at.y} r={3.2} fill={color} />
          <text className="hw-label-sm" x={at.x - 10} y={at.y + 4}>
            {mark}
          </text>
        </g>
      ))}

      <text className="hw-label" x={centre.x} y={y - 8} textAnchor="middle">
        {label}
      </text>
      {sublabel ? (
        <text
          className="hw-label-sm"
          x={centre.x}
          y={y + size + 15}
          textAnchor="middle"
        >
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Potentiometer
   ══════════════════════════════════════════════════════════════════════════ */

const POT_SIZE = 76;

export interface PotentiometerProps {
  /** Top-left corner of the body, knob side up. */
  x: number;
  y: number;
  /** Body width. A 16 mm panel pot is roughly square. */
  size?: number;
  label?: string;
  /** Printed under it, e.g. the track value and taper. */
  sublabel?: string;
  /** Where the shaft points, in degrees clockwise from straight up. */
  angle?: number;
}

/**
 * Where a potentiometer's three solder tags are, left to right.
 *
 * Named for what they *do* rather than 1/2/3, because the numbering is the one
 * thing about a pot nobody remembers and the roles are the thing a figure
 * actually wires: the wiper is always the middle tag, and which outer tag is
 * which end of the track is decided by how you mount it, not by the part.
 */
export function potentiometerTerminals(
  props: Pick<PotentiometerProps, "x" | "y" | "size">,
): { ccw: Point; wiper: Point; cw: Point } {
  const size = props.size ?? POT_SIZE;
  const y = props.y + size * 0.86;
  return {
    ccw: { x: props.x + size * 0.22, y },
    wiper: { x: props.x + size * 0.5, y },
    cw: { x: props.x + size * 0.78, y },
  };
}

/**
 * A 16 mm panel potentiometer, drawn shaft-on with its three tags below it.
 *
 * Face-on rather than in profile because the thing a reader needs to match
 * against the part in their hand is the **order of the three tags**, and that
 * is what disappears in a side view. The shaft is drawn with its flat pointing
 * somewhere off-centre for the same reason the LEDs are drawn lit: a knob
 * parked dead upright reads as a symbol, and a knob turned part way reads as a
 * control somebody has already been using.
 *
 * It carries no polarity mark, and that is not an omission. A pot has no
 * correct way round - swapping the outer tags reverses which way is louder,
 * which is a setting (`VOLUME_POT_REVERSED` in the pumpkin lantern) rather
 * than a fault. Only the middle tag is fixed, and it is fixed by the part.
 */
export function Potentiometer({
  x,
  y,
  size = POT_SIZE,
  label = "RV1",
  sublabel,
  angle = -38,
}: PotentiometerProps) {
  const terminals = potentiometerTerminals({ x, y, size });
  const bodyHeight = size * 0.68;
  const bodyBottom = y + bodyHeight;
  const centre = { x: x + size / 2, y: y + bodyHeight / 2 };
  const knob = size * 0.3;
  const radians = (angle * Math.PI) / 180;
  const pointer = {
    x: centre.x + Math.sin(radians) * knob * 0.82,
    y: centre.y - Math.cos(radians) * knob * 0.82,
  };

  return (
    <g>
      {/* the can */}
      <rect
        x={x}
        y={y}
        width={size}
        height={bodyHeight}
        rx={size * 0.1}
        fill="var(--hw-metal-dark)"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth={1.2}
      />

      {/* the shaft, and the flat you line a knob up against */}
      <circle
        cx={centre.x}
        cy={centre.y}
        r={knob}
        fill="var(--hw-plastic-dark)"
      />
      <circle
        cx={centre.x}
        cy={centre.y}
        r={knob * 0.78}
        fill="none"
        stroke="var(--hw-metal)"
        strokeWidth={1.3}
      />
      <line
        x1={centre.x}
        y1={centre.y}
        x2={pointer.x}
        y2={pointer.y}
        stroke="var(--hw-silk)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />

      {[
        { at: terminals.ccw, mark: "1" },
        { at: terminals.wiper, mark: "2" },
        { at: terminals.cw, mark: "3" },
      ].map(({ at, mark }) => (
        <g key={mark}>
          <rect
            x={at.x - 3}
            y={bodyBottom - 3}
            width={6}
            height={at.y - bodyBottom + 3}
            rx={1}
            fill="var(--hw-metal)"
            stroke="var(--hw-metal-dark)"
            strokeWidth={0.8}
          />
          <circle
            cx={at.x}
            cy={at.y}
            r={3.2}
            fill="var(--hw-plastic-dark)"
          />
          <text
            className="hw-silk"
            x={at.x}
            y={bodyBottom - 7}
            textAnchor="middle"
          >
            {mark}
          </text>
        </g>
      ))}

      <text className="hw-label" x={centre.x} y={y - 22} textAnchor="middle">
        {label}
      </text>
      {sublabel ? (
        <text className="hw-label-sm" x={centre.x} y={y - 8} textAnchor="middle">
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}
