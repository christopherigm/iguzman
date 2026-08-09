import {
  angleDegrees,
  distance,
  formatOhms,
  midpoint,
  resistorBands,
  type Point,
} from "./breadboard-geometry";
import { Lead } from "./wire";
import "./hardware.css";

/**
 * The small two- and three-legged parts: resistors, diodes, transistors,
 * and the active buzzer.
 *
 * Each takes the holes its legs go into and works out its own body position and
 * angle, so a figure never places a body by hand - move the holes and the part
 * follows. Every one of them draws the marking you have to read off the real
 * component to fit it correctly: a resistor's colour bands, a diode's cathode
 * stripe, a transistor's flat face and pinout, the buzzer's `+`.
 */

/**
 * Where a part's printed value goes, given how the part is lying.
 *
 * The offset runs along the body's **normal**, not simply downward, so a part
 * standing vertically (straddling the ravine, which is how most of them are
 * fitted) puts its value beside itself rather than on top of itself. The text
 * anchor follows: a value to the part's right starts there and reads outward.
 */
function valueLabelPosition(
  centre: Point,
  rotationDegrees: number,
  side: 1 | -1,
  gap = 15,
): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const radians = (rotationDegrees * Math.PI) / 180;
  const normalX = -Math.sin(radians);
  const normalY = Math.cos(radians);
  const horizontal = Math.abs(normalX) > 0.5;

  return {
    x: centre.x + normalX * gap * side,
    y: centre.y + normalY * gap * side + (horizontal ? 4 : normalY * side * 4),
    anchor: horizontal ? (normalX * side > 0 ? "start" : "end") : "middle",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Resistor
   ══════════════════════════════════════════════════════════════════════════ */

export interface ResistorProps {
  from: Point;
  to: Point;
  /** Resistance in ohms. Drives both the printed value and the band colours. */
  ohms: number;
  /** Suppress the printed value when the figure calls it out some other way. */
  showValue?: boolean;
  /** Which side of the body the value is printed on. */
  labelSide?: 1 | -1;
}

/**
 * A quarter-watt axial resistor, with its real IEC 60062 colour code.
 *
 * Drawing the actual bands rather than a generic stripe is most of the value of
 * the pictorial view for this part: sorting a bag of resistors means matching
 * bands, and 150 Ω (brown-green-brown) versus 68 Ω (blue-grey-black) is a
 * comparison you can make against the drawing without a calculator.
 */
export function Resistor({
  from,
  to,
  ohms,
  showValue = true,
  labelSide = -1,
}: ResistorProps) {
  const centre = midpoint(from, to);
  const rotation = angleDegrees(from, to);
  const span = distance(from, to);
  const bodyLength = Math.min(span * 0.62, 34);
  const bodyHeight = 11;
  const bands = resistorBands(ohms);

  return (
    <g>
      <Lead from={from} to={centre} />
      <Lead from={to} to={centre} />

      <g transform={`translate(${centre.x},${centre.y}) rotate(${rotation})`}>
        {/* the body, with its swollen ends */}
        <rect
          x={-bodyLength / 2}
          y={-bodyHeight / 2}
          width={bodyLength}
          height={bodyHeight}
          rx={bodyHeight / 2.4}
          fill="var(--hw-resistor)"
          stroke="var(--hw-resistor-shade)"
          strokeWidth={1}
        />
        {bands.map((color, index) => {
          // Three value bands packed toward one end, tolerance band at the
          // other - the spacing that tells you which end to read from.
          const offset =
            index === 3
              ? bodyLength * 0.33
              : -bodyLength * 0.3 + index * bodyLength * 0.19;
          return (
            <rect
              key={`${color}-${index}`}
              x={offset}
              y={-bodyHeight / 2 + 0.6}
              width={3.4}
              height={bodyHeight - 1.2}
              fill={color}
            />
          );
        })}
      </g>

      {showValue
        ? (() => {
            const at = valueLabelPosition(centre, rotation, labelSide);
            return (
              <text
                className="hw-label"
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
              >
                {formatOhms(ohms)}
              </text>
            );
          })()
        : null}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Diode
   ══════════════════════════════════════════════════════════════════════════ */

export interface DiodeProps {
  anode: Point;
  cathode: Point;
  /** Printed part number, e.g. `1N5817`. */
  label?: string;
  /** DO-41 glass/black body. Schottky parts are usually black, signal glass. */
  body?: "black" | "glass";
  labelSide?: 1 | -1;
}

/**
 * An axial diode, banded end toward the cathode.
 *
 * The band is the entire content of this drawing: it is the only marking on the
 * part, fitting it backwards is a one-second mistake, and in this build that
 * mistake means the Pico silently never powers up.
 */
export function Diode({
  anode,
  cathode,
  label,
  body = "black",
  labelSide = -1,
}: DiodeProps) {
  const centre = midpoint(anode, cathode);
  const rotation = angleDegrees(anode, cathode);
  const span = distance(anode, cathode);
  const bodyLength = Math.min(span * 0.6, 30);
  const bodyHeight = 10;

  return (
    <g>
      <Lead from={anode} to={centre} />
      <Lead from={cathode} to={centre} />

      <g transform={`translate(${centre.x},${centre.y}) rotate(${rotation})`}>
        <rect
          x={-bodyLength / 2}
          y={-bodyHeight / 2}
          width={bodyLength}
          height={bodyHeight}
          rx={2}
          fill={body === "black" ? "#26282c" : "#cfd8db"}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={1}
        />
        {/* cathode stripe, at the `cathode` end because rotation points that way */}
        <rect
          x={bodyLength / 2 - 6}
          y={-bodyHeight / 2 + 0.8}
          width={3.6}
          height={bodyHeight - 1.6}
          fill={body === "black" ? "#e8e8e6" : "#1d1f22"}
        />
      </g>

      {label
        ? (() => {
            const at = valueLabelPosition(centre, rotation, labelSide);
            return (
              <text
                className="hw-label"
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
              >
                {label}
              </text>
            );
          })()
        : null}
      {/*
        The band marker is placed **beyond the cathode along the body's own
        axis**, not off to one side. Sideways is where the wire feeding that
        column runs - the cathode's node and its label would be forever fighting
        over the same lane - whereas past the end of the part there is nothing
        but the hole the lead already came out of.
      */}
      {(() => {
        const radians = (rotation * Math.PI) / 180;
        const at = {
          x: cathode.x + Math.cos(radians) * 13,
          y: cathode.y + Math.sin(radians) * 13 + 3.5,
        };
        const anchor =
          Math.abs(Math.cos(radians)) < 0.5
            ? "middle"
            : Math.cos(radians) > 0
              ? "start"
              : "end";
        return (
          <text className="hw-label-sm" x={at.x} y={at.y} textAnchor={anchor}>
            band
          </text>
        );
      })()}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Transistor
   ══════════════════════════════════════════════════════════════════════════ */

export interface TransistorProps {
  /** The three holes, left to right as the part is fitted. */
  emitter: Point;
  base: Point;
  collector: Point;
  /** Printed part number, e.g. `2N2222`. */
  label?: string;
  /** Reference designator, e.g. `Q1`. */
  designator?: string;
}

/**
 * A TO-92 transistor: the half-cylinder body with a flat face.
 *
 * Drawn **flat side toward the reader**, which is the orientation its pinout is
 * quoted in. The legs are labelled E · B · C on the drawing because that order
 * is not universal across part numbers - a 2N2222 and a BC547 in the same
 * package have their emitter and collector swapped, which is a genuinely nasty
 * thing to discover after soldering.
 */
export function Transistor({
  emitter,
  base,
  collector,
  label,
  designator,
}: TransistorProps) {
  const legCentre = midpoint(emitter, collector);
  const rotation = angleDegrees(emitter, collector);
  const width = Math.max(distance(emitter, collector) * 0.92, 26);
  const height = width * 0.78;
  // The can stands clear of its own leg holes rather than sitting on top of
  // them, so all three legs - and the E/B/C letters under them - stay visible.
  // A TO-92's legs splay out below the body exactly like this.
  const centre = { x: legCentre.x, y: legCentre.y - height * 0.85 };

  return (
    <g>
      {[emitter, base, collector].map((leg, index) => (
        <Lead
          key={`leg-${index}`}
          from={leg}
          to={centre}
          bow={0.05}
          bowDirection={leg.x < centre.x ? 1 : -1}
        />
      ))}

      <g transform={`translate(${centre.x},${centre.y}) rotate(${rotation})`}>
        {/* half-cylinder: flat front edge, domed back */}
        <path
          d={`M${-width / 2},${height * 0.34}
              L${width / 2},${height * 0.34}
              L${width / 2},${-height * 0.05}
              A${width / 2},${height * 0.5} 0 0 0 ${-width / 2},${-height * 0.05}
              Z`}
          fill="#2a2d32"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={1}
        />
        <line
          x1={-width / 2}
          y1={height * 0.34}
          x2={width / 2}
          y2={height * 0.34}
          stroke="#4a4e55"
          strokeWidth={1.6}
        />
      </g>

      <g className="hw-label-sm" textAnchor="middle">
        {[
          { at: emitter, text: "E" },
          { at: base, text: "B" },
          { at: collector, text: "C" },
        ].map(({ at, text }) => (
          <text key={text} x={at.x} y={at.y + 16}>
            {text}
          </text>
        ))}
      </g>

      {label || designator ? (
        <text
          className="hw-label"
          x={centre.x}
          y={centre.y - height * 0.62}
          textAnchor="middle"
        >
          {[designator, label].filter(Boolean).join(" · ")}
        </text>
      ) : null}
    </g>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Buzzer
   ══════════════════════════════════════════════════════════════════════════ */

export interface BuzzerProps {
  /** The hole under the `+` marked pin. */
  plus: Point;
  minus: Point;
  label?: string;
  /** Radiate sound rings. */
  sounding?: boolean;
  radius?: number;
}

/**
 * An active buzzer - the black can with a hole in the top and a `+` on its
 * case, which is the only thing distinguishing it from the passive kind.
 *
 * `sounding` radiates rings from the emitter hole. It is worth turning on
 * wherever the surrounding prose is about the buzzer being *active*: this part
 * contains its own oscillator and makes one fixed pitch whenever it has power,
 * and the animation says "it is on or it is off" more directly than a sentence.
 */
export function Buzzer({
  plus,
  minus,
  label = "BZ1",
  sounding = false,
  radius = 22,
}: BuzzerProps) {
  const centre = midpoint(plus, minus);
  // The can stands above its two pins rather than between them.
  const body = { x: centre.x, y: centre.y - radius * 0.72 };

  return (
    <g>
      <Lead from={plus} to={body} bow={0.08} bowDirection={1} />
      <Lead from={minus} to={body} bow={0.08} bowDirection={-1} />

      {sounding
        ? [0, 1, 2].map((ring) => (
            <circle
              key={`ring-${ring}`}
              className="hw-sound-arc"
              cx={body.x}
              cy={body.y}
              r={radius * (1.25 + ring * 0.3)}
              fill="none"
              stroke="var(--hw-ink-soft)"
              strokeWidth={1.6}
            />
          ))
        : null}

      <circle
        cx={body.x}
        cy={body.y}
        r={radius}
        fill="#1e2126"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={1.4}
      />
      <circle
        cx={body.x}
        cy={body.y}
        r={radius * 0.82}
        fill="none"
        stroke="#3a3f47"
        strokeWidth={1.2}
      />
      {/* the emitter hole in the top of the can */}
      <circle cx={body.x} cy={body.y} r={radius * 0.16} fill="#05070a" />
      <text
        className="hw-label-chip"
        x={body.x + radius * 0.44}
        y={body.y - radius * 0.42}
      >
        +
      </text>

      <text
        className="hw-label"
        x={body.x}
        y={body.y - radius - 8}
        textAnchor="middle"
      >
        {label}
      </text>
      <g className="hw-label-sm" textAnchor="middle">
        <text x={plus.x} y={plus.y + 16}>
          +
        </text>
        <text x={minus.x} y={minus.y + 16}>
          −
        </text>
      </g>
    </g>
  );
}
