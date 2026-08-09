import {
  HOLE_PITCH,
  PICO_PIN_NAMES,
  picoPinKind,
  type PicoFootprint,
  type PicoPinKind,
} from "./breadboard-geometry";
import "./hardware.css";

/**
 * A Raspberry Pi Pico, drawn as the board actually looks.
 *
 * Recognition is the whole job here. A beginner holding the board should be
 * able to match what is on screen to what is in their hand without a legend:
 * the green PCB, the micro-USB shield at one end, the RP2040 under the
 * raspberry, the BOOTSEL button they are about to hold down, the three debug
 * pads at the far end. The schematic view beside it draws the same board as a
 * labelled rectangle, which is the right abstraction once you already know
 * which rectangle it is.
 *
 * It lies **lengthwise across the breadboard's ravine**, USB to the left - see
 * `picoFootprint` in `breadboard-geometry`, which owns where each of the 40
 * pins lands.
 *
 * ── The `labels` prop is the beginner/expert dial ──────────────────────────
 *
 * `"used"` (the default) names only the pins a figure passes in `highlight`,
 * so a reader wiring GP0, GP1, GP2 and a ground sees four labels instead of
 * forty. `"all"` renders the full colour-coded pinout - the same information as
 * the poster everyone keeps open in another tab, in place on the board. `"none"`
 * leaves the art bare, for a figure whose point is mechanical rather than
 * electrical.
 */

/** Label-chip colour per pin function, following the official pinout card. */
const PIN_KIND_COLOR: Record<PicoPinKind, string> = {
  power: "#cf3b31",
  ground: "#33383c",
  gpio: "#5faf3f",
  adc: "#2c7233",
  system: "#d4788a",
};

export type PicoLabelMode = "used" | "all" | "none";

export interface PicoBoardProps {
  footprint: PicoFootprint;
  /**
   * Which pins to call out. Accepts pin numbers or names; a name that appears
   * more than once (`GND`) resolves to its first pin, so pass the number when
   * you mean a specific ground.
   */
  highlight?: (number | string)[];
  labels?: PicoLabelMode;
  /**
   * Which side of the pin row the name chips sit on.
   *
   * `"inside"` prints them on the PCB itself, reading inward from the pad, the
   * way the pin names are silkscreened on the underside of a real Pico.
   * `"outside"` stands them off the board's edges, which is the layout of the
   * familiar pinout poster.
   *
   * The default follows `labels`, and the reason is worth stating: **on a
   * breadboard, everything outside the pin row is wiring**. The holes an
   * outward chip would cover are precisely the ones the figure's jumpers plug
   * into, so a wiring diagram puts its few labels on the board (`"used"` →
   * inside) while a reference card, which has no wires to fight, spreads all
   * forty outward (`"all"` → outside).
   */
  labelPlacement?: "inside" | "outside";
  /** How far a chip stands off from its pin before its text begins. */
  labelStandoff?: number;
}

/** One rotated name chip standing off the board edge. */
function PinChip({
  x,
  y,
  name,
  direction,
  outlined = false,
}: {
  x: number;
  y: number;
  name: string;
  direction: 1 | -1;
  /** A hairline, for a chip printed on the PCB - green on green needs an edge. */
  outlined?: boolean;
}) {
  // A rotated chip is how a horizontal Pico can carry 40 names at 18 px pitch:
  // upright text would need ~60 px per name and they would all collide.
  const width = Math.max(26, name.length * 5.6 + 10);
  const rotation = direction === -1 ? -90 : 90;

  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`}>
      <rect
        x={0}
        y={-6.4}
        width={width}
        height={12.8}
        rx={2.4}
        fill={PIN_KIND_COLOR[picoPinKind(name)]}
        stroke={outlined ? "rgba(255,255,255,0.6)" : undefined}
        strokeWidth={outlined ? 0.9 : undefined}
      />
      <text className="hw-label-chip" x={5} y={3.4}>
        {name}
      </text>
    </g>
  );
}

/**
 * The silkscreened raspberry, simplified to what survives at this size.
 *
 * Berries widest at the top and tapering to a single one at the point, with two
 * short leaves swept outward above them. The proportions matter more than they
 * look like they should: a first pass with two long upright leaves read
 * unmistakably as a rabbit.
 */
function RaspberryMark({ x, y, size }: { x: number; y: number; size: number }) {
  const berries: [number, number, number][] = [
    // [x, y, radius], all as fractions of `size`
    [-0.3, -0.02, 0.15],
    [0.3, -0.02, 0.15],
    [0, 0.06, 0.15],
    [-0.17, 0.24, 0.14],
    [0.17, 0.24, 0.14],
    [0, 0.44, 0.13],
  ];

  const leaf = (direction: 1 | -1) => {
    const s = size;
    const d = direction;
    return (
      `M${d * 0.04 * s},${-0.18 * s} ` +
      `C${d * 0.12 * s},${-0.42 * s} ${d * 0.34 * s},${-0.5 * s} ${d * 0.46 * s},${-0.44 * s} ` +
      `C${d * 0.42 * s},${-0.28 * s} ${d * 0.24 * s},${-0.16 * s} ${d * 0.04 * s},${-0.18 * s} Z`
    );
  };

  return (
    <g transform={`translate(${x},${y})`} fill="var(--hw-silk)">
      <path d={leaf(-1)} />
      <path d={leaf(1)} />
      {berries.map(([bx, by, r]) => (
        <circle
          key={`${bx}-${by}`}
          cx={bx * size}
          cy={by * size}
          r={r * size}
        />
      ))}
    </g>
  );
}

export function PicoBoard({
  footprint,
  highlight = [],
  labels = "used",
  labelPlacement = labels === "all" ? "outside" : "inside",
  labelStandoff = HOLE_PITCH * 0.62,
}: PicoBoardProps) {
  const { body } = footprint;
  const w = body.width;
  const h = body.height;
  const left = body.x;
  const top = body.y;
  const centreY = top + h / 2;

  // Resolve the highlight list to pin numbers once, so both the pad ring and
  // the label chip agree about which pins are called out.
  const highlighted = new Set(
    highlight.map((entry) => {
      if (typeof entry === "number") return entry;
      const index = PICO_PIN_NAMES.indexOf(
        entry as (typeof PICO_PIN_NAMES)[number],
      );
      return index + 1;
    }),
  );

  const pins = Array.from({ length: 40 }, (_, i) => i + 1);

  return (
    <g>
      {/* ── PCB ─────────────────────────────────────────────────────────── */}
      <rect
        x={left}
        y={top}
        width={w}
        height={h}
        rx={h * 0.06}
        fill="var(--hw-pcb)"
        stroke="var(--hw-pcb-dark)"
        strokeWidth={1.4}
      />

      {/* castellated edges: the scalloped half-holes down both long sides */}
      {pins.map((pin) => {
        const point = footprint.pin(pin);
        const edgeY = pin <= 20 ? top + h : top;
        return (
          <circle
            key={`castellation-${pin}`}
            cx={point.x}
            cy={edgeY}
            r={3.4}
            fill="var(--hw-pcb-dark)"
          />
        );
      })}

      {/* ── through-hole pads ───────────────────────────────────────────── */}
      {pins.map((pin) => {
        const point = footprint.pin(pin);
        const isOn = highlighted.has(pin);
        return (
          <g key={`pad-${pin}`}>
            {isOn ? (
              <circle
                cx={point.x}
                cy={point.y}
                r={8}
                fill="none"
                stroke={PIN_KIND_COLOR[picoPinKind(PICO_PIN_NAMES[pin - 1]!)]}
                strokeWidth={2}
              />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              r={5.2}
              fill="var(--hw-pad)"
              stroke="var(--hw-pad-ring)"
              strokeWidth={1}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={2.4}
              fill="var(--hw-plastic-dark)"
            />
          </g>
        );
      })}

      {/* ── micro-USB shield, left end ──────────────────────────────────── */}
      <g>
        <rect
          x={left - 5}
          y={centreY - h * 0.21}
          width={w * 0.105}
          height={h * 0.42}
          rx={2.5}
          fill="var(--hw-metal)"
          stroke="var(--hw-metal-dark)"
          strokeWidth={1.2}
        />
        <rect
          x={left - 3}
          y={centreY - h * 0.11}
          width={w * 0.03}
          height={h * 0.22}
          rx={1.6}
          fill="var(--hw-plastic-dark)"
        />
      </g>

      {/* the on-board green LED on GP25, and the BOOTSEL button */}
      <rect
        x={left + w * 0.135}
        y={centreY - h * 0.3}
        width={7}
        height={5}
        rx={1}
        fill="#8fd16a"
      />
      <g>
        <rect
          x={left + w * 0.145}
          y={centreY - h * 0.11}
          width={w * 0.055}
          height={h * 0.22}
          rx={2}
          fill="var(--hw-metal)"
          stroke="var(--hw-metal-dark)"
          strokeWidth={1}
        />
        {/* Beside the button, not under it: a chip standing inward from a
            labelled pin occupies the space directly below. */}
        <text className="hw-silk" x={left + w * 0.21} y={centreY + 3.5}>
          BOOTSEL
        </text>
      </g>

      {/* flash chip */}
      <rect
        x={left + w * 0.33}
        y={centreY - h * 0.12}
        width={w * 0.055}
        height={h * 0.24}
        rx={1.5}
        fill="var(--hw-plastic-dark)"
      />

      {/* ── RP2040 ──────────────────────────────────────────────────────── */}
      <g>
        <rect
          x={left + w * 0.44}
          y={centreY - h * 0.17}
          width={h * 0.34}
          height={h * 0.34}
          rx={2}
          fill="var(--hw-plastic-dark)"
        />
        <RaspberryMark
          x={left + w * 0.44 + h * 0.17}
          y={centreY}
          size={h * 0.2}
        />
      </g>

      {/* silkscreen wordmark + the big raspberry, as on the real board */}
      <text className="hw-silk" x={left + w * 0.56} y={centreY - h * 0.28}>
        Raspberry Pi Pico
      </text>
      <RaspberryMark x={left + w * 0.72} y={centreY} size={h * 0.42} />

      {/* three debug pads at the far end */}
      {[0, 1, 2].map((i) => (
        <circle
          key={`debug-${i}`}
          cx={left + w * 0.9 + i * 9}
          cy={centreY}
          r={3.4}
          fill="var(--hw-pad)"
          stroke="var(--hw-pad-ring)"
          strokeWidth={1}
        />
      ))}
      <text className="hw-silk" x={left + w * 0.9} y={centreY + h * 0.28}>
        DEBUG
      </text>

      {/* ── labels ──────────────────────────────────────────────────────── */}
      {labels === "none"
        ? null
        : pins
            .filter((pin) => labels === "all" || highlighted.has(pin))
            .map((pin) => {
              const point = footprint.pin(pin);
              // Pins 1-20 are the lower row. Outward for them is downward, off
              // the board's bottom edge; inward is up onto the PCB.
              const outward: 1 | -1 = pin <= 20 ? 1 : -1;
              const direction: 1 | -1 =
                labelPlacement === "outside"
                  ? outward
                  : ((outward * -1) as 1 | -1);
              const chipY = point.y + direction * labelStandoff;
              return (
                <g key={`chip-${pin}`}>
                  {/* A leader, so a chip standing clear of the pad is still
                      visibly tied to the pin it names. */}
                  <line
                    x1={point.x}
                    y1={point.y}
                    x2={point.x}
                    y2={chipY}
                    stroke={
                      PIN_KIND_COLOR[picoPinKind(PICO_PIN_NAMES[pin - 1]!)]
                    }
                    strokeWidth={1.2}
                    strokeDasharray="2 2"
                  />
                  <PinChip
                    x={point.x}
                    y={chipY}
                    name={PICO_PIN_NAMES[pin - 1]!}
                    direction={direction}
                    outlined={labelPlacement === "inside"}
                  />
                </g>
              );
            })}
    </g>
  );
}
