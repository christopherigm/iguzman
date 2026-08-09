/**
 * The coordinate system every pictorial hardware drawing is built on.
 *
 * A solderless breadboard is a grid, so the honest way to draw one is to make
 * the grid the API: a figure asks for the hole it wants by column and row, and
 * every part, leg and jumper wire lands on a real coordinate rather than a
 * number somebody counted off a screenshot. That is the whole reason these
 * drawings can be edited later - the schematic figures they sit beside are
 * hand-placed paths, and moving one component in those means re-deriving a
 * dozen `d=` strings by hand.
 *
 * Deliberately **React-free**, like `core-elements/mercator` and
 * `core-elements/breakpoints`: it is arithmetic, and a build script or a test
 * should be able to import it without pulling in the renderer.
 *
 * ── The physical board this models ──────────────────────────────────────────
 *
 * A standard 0.1"-pitch board, drawn top to bottom:
 *
 *     ┌──────────────────────────────────────┐
 *     │  + · · · · ·   · · · · ·   · · · · · │  top power rails
 *     │  − · · · · ·   · · · · ·   · · · · · │
 *     │  j · · · · · · · · · · · · · · · · · │  ┐
 *     │  i · · · · · · · · · · · · · · · · · │  │ upper bank: a column of
 *     │  h · · · · · · · · · · · · · · · · · │  │ five holes is one node
 *     │  g · · · · · · · · · · · · · · · · · │  │
 *     │  f · · · · · · · · · · · · · · · · · │  ┘
 *     │ ════════════ ravine ═══════════════  │  the two banks are isolated
 *     │  e · · · · · · · · · · · · · · · · · │  ┐
 *     │  d · · · · · · · · · · · · · · · · · │  │ lower bank
 *     │  … a                                 │  ┘
 *     │  −   … bottom power rails …          │
 *     └──────────────────────────────────────┘
 *
 * Row spacing is one pitch within a bank and **three** across the ravine
 * (0.3"), which is what lets a DIP part straddle it with its two pin rows in
 * different nodes. The Pico's two pin rows are 0.7" apart - exactly seven
 * pitches - which is why `picoFootprint` defaults to rows `h` and `c`.
 *
 * ── One simplification, stated plainly ─────────────────────────────────────
 *
 * Real boards offset the power-rail holes by half a pitch from the main grid
 * and break each rail into segments. The offset is dropped here: rail holes
 * share the main columns, so a wire from a rail to a row is vertical and the
 * arithmetic stays trivial. The segment gaps are kept (five holes, a gap,
 * five holes) because they are what make the drawing read as a breadboard.
 */

/** Centre-to-centre hole spacing, in SVG user units. One 0.1" pitch. */
export const HOLE_PITCH = 18;

/** Drawn radius of a hole's socket opening. */
export const HOLE_RADIUS = 3.1;

/** A point in the figure's SVG user space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The rows a hole can be in: the ten lettered terminal rows, plus the four
 * power rails (`+`/`−`, top and bottom).
 */
export type BreadboardRow =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "+t"
  | "-t"
  | "+b"
  | "-b";

/** The ten terminal rows, top to bottom as drawn. */
export const TERMINAL_ROWS: readonly BreadboardRow[] = [
  "j",
  "i",
  "h",
  "g",
  "f",
  "e",
  "d",
  "c",
  "b",
  "a",
];

/** The four power-rail rows, top to bottom as drawn. */
export const RAIL_ROWS: readonly BreadboardRow[] = ["+t", "-t", "-b", "+b"];

/**
 * Each row's distance from the board's top edge, in pitches.
 *
 * The two numbers that matter and must not drift: `e` − `f` is **3** (the
 * ravine), and every other in-bank gap is **1**. Everything else is margin.
 */
const ROW_PITCH_OFFSET: Record<BreadboardRow, number> = {
  "+t": 1,
  "-t": 2,
  j: 3.6,
  i: 4.6,
  h: 5.6,
  g: 6.6,
  f: 7.6,
  // ravine centre sits at 9.1
  e: 10.6,
  d: 11.6,
  c: 12.6,
  b: 13.6,
  a: 14.6,
  "-b": 16.2,
  "+b": 17.2,
};

/** Total board height, in pitches, including the margin below the last rail. */
const BOARD_PITCH_HEIGHT = 18.2;

/** Board margin to the left of column 1 and right of the last column. */
const BOARD_PITCH_EDGE = 1.2;

/** Where the ravine's centre line falls, in pitches from the top edge. */
const RAVINE_PITCH_CENTRE = 9.1;

/** How tall the ravine is drawn, in pitches. */
const RAVINE_PITCH_HEIGHT = 1.5;

/**
 * A placed board: everything a figure needs to draw it and to address it.
 *
 * Created by {@link breadboardLayout}. Holding the origin on the object rather
 * than in a module-level variable is what lets one figure carry two boards
 * (a Pico board wired across to a driver board) without either of them
 * knowing about the other.
 */
export interface BreadboardLayout {
  /** Board top-left corner in the figure's SVG space. */
  x: number;
  y: number;
  /** Number of numbered columns. A full-size board is 63; a half-size, 30. */
  columns: number;
  /** Overall drawn size, including the margin outside the outermost holes. */
  width: number;
  height: number;
  /** Absolute centre of the hole at (column, row). Columns are 1-based. */
  hole: (column: number, row: BreadboardRow) => Point;
  /** Absolute x of a column's centre line - for a label or a leg drawn free. */
  columnX: (column: number) => number;
  /** Absolute y of a row's centre line. */
  rowY: (row: BreadboardRow) => number;
  /** The ravine's top and bottom edges, for drawing it. */
  ravine: { top: number; bottom: number };
}

/** Place a board of `columns` columns with its top-left corner at (x, y). */
export function breadboardLayout({
  columns,
  x = 0,
  y = 0,
}: {
  columns: number;
  x?: number;
  y?: number;
}): BreadboardLayout {
  const columnX = (column: number) =>
    x + (BOARD_PITCH_EDGE + column - 1) * HOLE_PITCH;
  const rowY = (row: BreadboardRow) => y + ROW_PITCH_OFFSET[row] * HOLE_PITCH;

  return {
    x,
    y,
    columns,
    width: (columns - 1 + BOARD_PITCH_EDGE * 2) * HOLE_PITCH,
    height: BOARD_PITCH_HEIGHT * HOLE_PITCH,
    hole: (column, row) => ({ x: columnX(column), y: rowY(row) }),
    columnX,
    rowY,
    ravine: {
      top: y + (RAVINE_PITCH_CENTRE - RAVINE_PITCH_HEIGHT / 2) * HOLE_PITCH,
      bottom: y + (RAVINE_PITCH_CENTRE + RAVINE_PITCH_HEIGHT / 2) * HOLE_PITCH,
    },
  };
}

/**
 * Whether a power rail carries a hole at this column.
 *
 * Rails run in groups of five with a gap between groups, exactly as the real
 * moulding does - `column % 6 === 0` is the gap.
 */
export function railHasHole(column: number): boolean {
  return column % 6 !== 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Raspberry Pi Pico footprint
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The 40 pin names, in pin order (index 0 is pin 1).
 *
 * Pins 1-20 run down one long edge and 21-40 back up the other, which is why
 * the second half reads bottom-to-top relative to the board: pin 21 (GP16) is
 * physically opposite pin 20 (GP15).
 */
export const PICO_PIN_NAMES = [
  // 1-20
  "GP0",
  "GP1",
  "GND",
  "GP2",
  "GP3",
  "GP4",
  "GP5",
  "GND",
  "GP6",
  "GP7",
  "GP8",
  "GP9",
  "GND",
  "GP10",
  "GP11",
  "GP12",
  "GP13",
  "GND",
  "GP14",
  "GP15",
  // 21-40
  "GP16",
  "GP17",
  "GND",
  "GP18",
  "GP19",
  "GP20",
  "GP21",
  "GND",
  "GP22",
  "RUN",
  "GP26",
  "GP27",
  "GND",
  "GP28",
  "ADC_VREF",
  "3V3(OUT)",
  "3V3_EN",
  "GND",
  "VSYS",
  "VBUS",
] as const;

/** What a pin is for - drives the colour of its label chip. */
export type PicoPinKind = "gpio" | "ground" | "power" | "adc" | "system";

/** Classify a pin by name. */
export function picoPinKind(name: string): PicoPinKind {
  if (name === "GND") return "ground";
  if (name === "VBUS" || name === "VSYS" || name === "3V3(OUT)") return "power";
  if (name === "ADC_VREF") return "adc";
  if (name === "RUN" || name === "3V3_EN") return "system";
  return "gpio";
}

/**
 * A Pico placed on a board.
 *
 * `pin()` takes either a pin **number** (1-40) or a pin **name**. Prefer the
 * number for `GND`, which appears eight times - by name you get the first one,
 * which is pin 3 and is rarely the one you meant.
 */
export interface PicoFootprint {
  /** Leftmost column the board occupies. */
  column: number;
  /** The rows its two pin rows sit in. */
  topRow: BreadboardRow;
  bottomRow: BreadboardRow;
  /** Absolute body rectangle, for drawing. */
  body: { x: number; y: number; width: number; height: number };
  /** Where a pin's hole is. */
  pin: (pin: number | string) => Point;
  /** Which hole (column/row) a pin occupies - for wiring to a free hole. */
  pinHole: (pin: number | string) => { column: number; row: BreadboardRow };
  /**
   * The free hole a wire to this pin actually plugs into.
   *
   * You cannot wire to a Pico pin directly - the pin is already in that hole.
   * You wire to another hole in the same five-hole node, and on a board this is
   * a much shorter list than it looks: the Pico's body covers four of the ten
   * terminal rows. With the default `h`/`c` placement only **i, j** (upper) and
   * **b, a** (lower) are reachable; d, e, f and g are underneath the board.
   *
   * `tap` picks the nearest reachable row on the pin's own side, or takes an
   * explicit one when a figure needs two wires off the same pin.
   */
  tap: (pin: number | string, row?: BreadboardRow) => Point;
  /** The reachable rows on each side, nearest the board first. */
  freeRows: { top: BreadboardRow[]; bottom: BreadboardRow[] };
}

/** How many columns a Pico occupies. 20 pins per edge at one pitch each. */
export const PICO_COLUMNS = 20;

/**
 * The Pico is 51 × 21 mm with its pin rows 0.7" apart, so the body overhangs
 * each pin row by ~0.635 pitch and each end pin by ~0.54 pitch.
 */
const PICO_BODY_OVERHANG_ACROSS = 0.635;
const PICO_BODY_OVERHANG_ALONG = 0.54;

/**
 * Place a Pico lying **lengthwise** across the ravine, USB to the left.
 *
 * Rotating the familiar portrait pinout a quarter turn anticlockwise puts pin 1
 * at the bottom-left and pin 40 at the top-left, which is what these defaults
 * encode. `topRow`/`bottomRow` must stay seven pitches apart (`h`/`c`, `j`/`e`,
 * `f`/`a` - any of them) or the drawn body will not line up with its pins.
 */
export function picoFootprint({
  layout,
  column,
  topRow = "h",
  bottomRow = "c",
}: {
  layout: BreadboardLayout;
  column: number;
  topRow?: BreadboardRow;
  bottomRow?: BreadboardRow;
}): PicoFootprint {
  const resolve = (pin: number | string): number => {
    if (typeof pin === "number") return pin;
    const index = PICO_PIN_NAMES.indexOf(
      pin as (typeof PICO_PIN_NAMES)[number],
    );
    if (index < 0) throw new Error(`Unknown Pico pin: ${pin}`);
    return index + 1;
  };

  const pinHole = (
    pin: number | string,
  ): { column: number; row: BreadboardRow } => {
    const n = resolve(pin);
    return n <= 20
      ? { column: column + n - 1, row: bottomRow }
      : { column: column + (40 - n), row: topRow };
  };

  const topY = layout.rowY(topRow);
  const bottomY = layout.rowY(bottomRow);
  const leftX = layout.columnX(column);
  const rightX = layout.columnX(column + PICO_COLUMNS - 1);

  // Rows a bank offers, ordered outward from the ravine, minus the one the
  // Pico's own pins occupy and everything its body lies over.
  const upperBank: BreadboardRow[] = ["f", "g", "h", "i", "j"];
  const lowerBank: BreadboardRow[] = ["e", "d", "c", "b", "a"];
  const bodyTopIndex = upperBank.indexOf(topRow);
  const bodyBottomIndex = lowerBank.indexOf(bottomRow);
  const freeRows = {
    top: upperBank.slice(bodyTopIndex + 1),
    bottom: lowerBank.slice(bodyBottomIndex + 1),
  };

  return {
    column,
    topRow,
    bottomRow,
    body: {
      x: leftX - PICO_BODY_OVERHANG_ALONG * HOLE_PITCH,
      y: topY - PICO_BODY_OVERHANG_ACROSS * HOLE_PITCH,
      width: rightX - leftX + PICO_BODY_OVERHANG_ALONG * 2 * HOLE_PITCH,
      height: bottomY - topY + PICO_BODY_OVERHANG_ACROSS * 2 * HOLE_PITCH,
    },
    pin: (pin) => {
      const { column: c, row } = pinHole(pin);
      return layout.hole(c, row);
    },
    pinHole,
    tap: (pin, row) => {
      const { column: c, row: pinRow } = pinHole(pin);
      const side = pinRow === topRow ? freeRows.top : freeRows.bottom;
      const chosen = row ?? side[0];
      if (!chosen) throw new Error("This Pico placement leaves no free rows");
      return layout.hole(c, chosen);
    },
    freeRows,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Resistor colour code
   ══════════════════════════════════════════════════════════════════════════ */

/** The IEC 60062 digit colours, indexed by digit. */
const BAND_COLORS = [
  "#1b1b1b", // 0 black
  "#7b4a1e", // 1 brown
  "#c8352a", // 2 red
  "#d97b28", // 3 orange
  "#e0c33c", // 4 yellow
  "#3f8f4a", // 5 green
  "#2f5fb5", // 6 blue
  "#7d4fa8", // 7 violet
  "#8d8d8d", // 8 grey
  "#f2f2f2", // 9 white
] as const;

/** Gold - the ±5% tolerance band every part in these builds uses. */
const BAND_TOLERANCE_GOLD = "#c9a227";

/**
 * The four band colours for a resistance in ohms.
 *
 * Drawing the real colour code rather than a generic stripe is the point of a
 * pictorial figure: a beginner matching bands against the part in their hand is
 * doing exactly what the drawing is for. Values below 10 Ω (which would need a
 * gold multiplier) are outside what these builds use and fall back to a black
 * multiplier - the geometry is still right, only the third band would lie.
 */
export function resistorBands(ohms: number): string[] {
  let multiplier = Math.max(0, Math.floor(Math.log10(ohms)) - 1);
  let significand = Math.round(ohms / 10 ** multiplier);
  // A significand that rounds up to 100 (e.g. 99.6 Ω) carries into 10 × 10^n+1.
  if (significand >= 100) {
    significand = Math.round(significand / 10);
    multiplier += 1;
  }

  const digit = (index: number) => BAND_COLORS[index] ?? BAND_COLORS[0];

  return [
    digit(Math.floor(significand / 10)),
    digit(significand % 10),
    digit(Math.min(multiplier, 9)),
    BAND_TOLERANCE_GOLD,
  ];
}

/** Format an ohm value the way it is printed on a parts list. */
export function formatOhms(ohms: number): string {
  if (ohms >= 1000) {
    const k = ohms / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)} kΩ`;
  }
  return `${ohms} Ω`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Small geometry helpers shared by the part renderers
   ══════════════════════════════════════════════════════════════════════════ */

/** Midpoint of two points. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle of a→b in degrees, for orienting a part along its own leads. */
export function angleDegrees(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
