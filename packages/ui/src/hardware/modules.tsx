import type { BreakoutFootprint, Point } from "./breadboard-geometry";
import "./hardware.css";

/**
 * Breakout modules: the little PCBs that arrive already assembled.
 *
 * A discrete has legs and a marking you have to read; a breakout has a **header
 * and a silkscreen**, and the silkscreen is the whole content of the drawing.
 * Nobody wiring a MAX98357A needs to see what the chip looks like - they need
 * to know that the third pad along says `DIN` and the one before it says
 * `BCLK`, because the only way to get a part like this wrong is to count the
 * header off by one. So the pin names are printed under the pads in the order
 * `footprint.pins` lists them, and `BreakoutFootprint.tap()` hands out the
 * holes the jumpers actually plug into.
 *
 * A module's **output** side is drawn as tinned pads on the far edge, with no
 * holes under them: those are the screw terminals or solder pads a speaker or a
 * sensor lead goes to, and nothing there plugs into the breadboard.
 */

/**
 * The board's vertical budget, measured from the header along `depthDir`.
 *
 * Named rather than inlined because they have to be read together: a module is
 * five or six hole pitches deep and has to fit a row of pads, a column of
 * rotated pin names, its part number and a row of output terminals into that,
 * and each of these was set by what the one above it leaves. Change one and
 * check the drawing, not just the number.
 */
const SILK_STANDOFF = 16; // header pads -> the pin names' baseline
const LABEL_FRACTION = 0.5; // header -> part number, as a fraction of depth
const TERMINAL_INSET = 12; // far edge -> the output pads
const TERMINAL_LABEL_GAP = 13; // output pad -> its name, back toward the header
const SUBLABEL_STANDOFF = 15; // far edge -> the caption, printed off the board

/**
 * Where a module's far-edge output pads sit, evenly spread across its width.
 *
 * Exported because a figure has to wire *to* these, and computing them twice -
 * once here and once in the drawing next door - is how a lead ends up floating
 * a few pixels off the pad it is supposed to be soldered to.
 */
export function breakoutTerminals(
  footprint: BreakoutFootprint,
  count: number,
): Point[] {
  const { body, bank } = footprint;
  const farEdgeY = bank === "upper" ? body.y : body.y + body.height;
  const depthDir = bank === "upper" ? -1 : 1;
  const step = body.width / (count + 1);
  return Array.from({ length: count }, (_, index) => ({
    x: body.x + step * (index + 1),
    y: farEdgeY - depthDir * TERMINAL_INSET,
  }));
}

export interface BreakoutModuleProps {
  footprint: BreakoutFootprint;
  /** Printed across the board, e.g. `MAX98357A`. */
  label?: string;
  /** A second, quieter line - what the thing is, not what it is called. */
  sublabel?: string;
  /** Header pins to ring, for the ones a figure is about. */
  highlight?: readonly string[];
  /** Names for the far-edge output pads, left to right. */
  terminals?: readonly string[];
}

export function BreakoutModule({
  footprint,
  label,
  sublabel,
  highlight = [],
  terminals = [],
}: BreakoutModuleProps) {
  const { body, pins, bank } = footprint;
  // `depthDir` runs from the header toward the far edge - down the figure for a
  // module in the lower bank, up it for one in the upper. Every piece of the
  // board's furniture is placed along it, either forward from the header (`+`)
  // or back from the far edge (`-`), so there is one sign to get right rather
  // than one per element.
  const farEdgeY = bank === "upper" ? body.y : body.y + body.height;
  const depthDir = bank === "upper" ? -1 : 1;
  const firstPin = pins[0];
  const headerY = firstPin ? footprint.pin(firstPin).y : farEdgeY;
  const silkY = headerY + depthDir * SILK_STANDOFF;
  const pads = breakoutTerminals(footprint, terminals.length);

  return (
    <g>
      <rect
        x={body.x}
        y={body.y}
        width={body.width}
        height={body.height}
        rx={4}
        fill="var(--hw-pcb)"
        stroke="var(--hw-pcb-dark)"
        strokeWidth={1.4}
      />

      {/* The mounting hole these boards carry in one corner. Worth drawing: on
          the real part it is the landmark you count pins from, and because
          there is only one of it, it also tells you which way round the board
          is lying. */}
      <circle
        cx={body.x + 10}
        cy={farEdgeY - depthDir * TERMINAL_INSET}
        r={3.6}
        fill="var(--hw-board)"
        stroke="var(--hw-pcb-dark)"
        strokeWidth={1}
      />

      {pins.map((name) => {
        const at = footprint.pin(name);
        return (
          <g key={`pin-${name}`}>
            <rect
              x={at.x - 6.5}
              y={headerY - 6.5}
              width={13}
              height={13}
              rx={2}
              fill="var(--hw-pad)"
              stroke="var(--hw-pad-ring)"
              strokeWidth={1}
            />
            {highlight.includes(name) ? (
              <circle
                cx={at.x}
                cy={headerY}
                r={10.5}
                fill="none"
                stroke="var(--hw-ink)"
                strokeWidth={1.6}
              />
            ) : null}
            {/* Turned on their side, because these names are longer than the
                0.1" pitch they sit on - printed flat they would overlap. The
                anchor follows the bank: after `rotate(-90)` the text's own +x
                runs *up* the figure, so a module in the lower bank needs `end`
                to grow its names down into its own PCB rather than up off it. */}
            <text
              className="hw-silk"
              x={at.x}
              y={silkY}
              textAnchor={depthDir < 0 ? "start" : "end"}
              transform={`rotate(-90 ${at.x} ${silkY})`}
            >
              {name}
            </text>
          </g>
        );
      })}

      {terminals.map((name, index) => {
        const at = pads[index];
        if (!at) return null;
        return (
          <g key={`terminal-${name}`}>
            <circle
              cx={at.x}
              cy={at.y}
              r={5.5}
              fill="var(--hw-metal)"
              stroke="var(--hw-pad-ring)"
              strokeWidth={1.2}
            />
            <text
              className="hw-silk"
              x={at.x}
              y={at.y - depthDir * TERMINAL_LABEL_GAP}
              textAnchor="middle"
            >
              {name}
            </text>
          </g>
        );
      })}

      {label ? (
        <text
          className="hw-silk"
          fontWeight={700}
          x={body.x + body.width / 2}
          y={headerY + depthDir * (body.height * LABEL_FRACTION)}
          textAnchor="middle"
        >
          {label}
        </text>
      ) : null}
      {/* Outside the far edge rather than on the PCB, which is already carrying
          a header, a column of pin names, a part number and a row of pads. This
          line is a caption anyway - what the thing *is*, not what is printed on
          it - so it takes the figure's label style, not the silkscreen's. */}
      {sublabel ? (
        <text
          className="hw-label-sm"
          x={body.x + body.width / 2}
          y={farEdgeY + depthDir * SUBLABEL_STANDOFF}
          textAnchor="middle"
        >
          {sublabel}
        </text>
      ) : null}
    </g>
  );
}
