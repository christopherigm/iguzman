import {
  breadboardLayout,
  breakoutFootprint,
  picoFootprint,
} from "@repo/ui/hardware/breadboard-geometry";
import { Breadboard, PictorialFigure } from "@repo/ui/hardware/breadboard";
import { PicoBoard } from "@repo/ui/hardware/pico";
import { Callout, Wire } from "@repo/ui/hardware/wire";
import { Led, RgbLed } from "@repo/ui/hardware/led";
import {
  Buzzer,
  Capacitor,
  Diode,
  Pushbutton,
  Resistor,
  Transistor,
} from "@repo/ui/hardware/discretes";
import { BreakoutModule, breakoutTerminals } from "@repo/ui/hardware/modules";
import {
  BatteryPack,
  SlideSwitch,
  Speaker,
  batteryPackLeads,
  slideSwitchTerminals,
  speakerTerminals,
} from "@repo/ui/hardware/power-parts";

/**
 * The beginner view of the five Pumpkin House wiring drawings.
 *
 * These are the *same five circuits* as `pumpkin-house-figures.tsx`, drawn as
 * parts on a solderless breadboard instead of as schematic symbols. Neither
 * view replaces the other and both stay in the document: a schematic says what
 * is connected to what and is the faster read once you can read one, while this
 * says which hole the leg goes in, which way round the banded end faces, and
 * what the thing in your hand looks like.
 *
 * ── How to edit these ──────────────────────────────────────────────────────
 *
 * Everything is addressed by **breadboard hole**, never by pixel: `hole(12,"b")`
 * is column 12, row b, and every part and wire takes those points. So moving a
 * component is changing a column number, and the legs, bodies and labels follow
 * on their own. That is the difference from the schematic figures next door,
 * where the geometry is hand-placed path data and moving one symbol means
 * re-deriving a dozen `d=` strings.
 *
 * Three rules the breadboard imposes, which explain layouts that would
 * otherwise look arbitrary:
 *
 * 1. **A column is a node.** Five holes in a column, on one side of the ravine,
 *    are one electrical point. Two legs share a node by sharing a column - which
 *    is why a resistor spans *columns*, and why a part can never have both legs
 *    in the same column.
 * 2. **The Pico eats a node per column and covers four rows.** Its pins are
 *    already in row h and row c, and its body lies over d, e, f and g. Only rows
 *    i/j (upper) and b/a (lower) are reachable, which is what `footprint.tap()`
 *    returns.
 * 3. **Build each stage on the side its pin is on.** GP0-GP12 are lower-row
 *    pins, GP16 is an upper-row pin. Following that keeps jumpers short and
 *    stops a stage's wiring having to cross over the Pico. The amplifier in
 *    Fig 5 is where that rule runs out: its three I2S lines are lower-row pins
 *    but every GPIO left over for its enable line is on the far edge, so one
 *    jumper has to cross - drawn on top of the Pico, because that is where it
 *    lies.
 *
 * The prose, values and pin assignments are the build sheet's; nothing here is a
 * new claim about the circuit.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Fig 1 - the power path
   ══════════════════════════════════════════════════════════════════════════ */

export function PowerPathPictorial() {
  const board = breadboardLayout({ columns: 34, x: 250, y: 60 });
  const pico = picoFootprint({ layout: board, column: 12 });
  const { hole } = board;

  const pack = { x: 24, y: 44 };
  const leads = batteryPackLeads(pack);
  const sw = { x: 150, y: 168 };
  const terminals = slideSwitchTerminals(sw);

  return (
    <PictorialFigure
      width={950}
      height={430}
      label="Breadboard view of the power path: a four-cell AA holder feeds the board's top red rail, its negative lead returns through a slide switch to the blue rail, a 1N5817 diode bridges the red rail to the Pico's VSYS column with its banded end toward the Pico, and the Pico's ground pin is jumpered to the blue rail. A branch off the red rail, upstream of the diode, feeds the LED flood and buzzer at the full pack voltage."
    >
      <Breadboard layout={board} />

      {/* ── off-board: pack and switch ─────────────────────────────────── */}
      <BatteryPack {...pack} sublabel="4.0 – 5.6 V" />
      <SlideSwitch {...sw} label="SW1" />

      <Wire from={leads.positive} to={hole(2, "+t")} color="red" flow />
      <Wire
        from={leads.negative}
        to={terminals.left}
        color="black"
        bow={0.16}
      />
      <Wire from={terminals.right} to={hole(2, "-t")} color="black" flow />

      {/* ── red rail → diode → VSYS column ─────────────────────────────── */}
      <Wire from={hole(4, "+t")} to={hole(4, "j")} color="red" flow />
      <Diode
        anode={hole(4, "h")}
        cathode={hole(8, "h")}
        label="D1 · 1N5817"
        labelSide={1}
      />
      {/* Column 8's node is the diode's cathode; column 13's is VSYS. */}
      <Wire from={hole(8, "j")} to={hole(13, "j")} color="orange" flow />

      {/* ── ground return ──────────────────────────────────────────────── */}
      <Wire from={hole(14, "j")} to={hole(14, "-t")} color="black" flow />

      <PicoBoard footprint={pico} highlight={[39, 38]} labels="used" />

      {/* ── the branch that does NOT go through the diode ───────────────── */}
      <Wire
        from={hole(22, "+t")}
        to={{ x: board.columnX(22), y: 34 }}
        color="red"
        bow={0}
      />
      <text className="hw-label" x={board.columnX(22) + 10} y={30}>
        to LED flood + buzzer — the full 4.0–5.6 V, upstream of D1
      </text>

      <Callout at={hole(8, "h")} to={hole(6, "e")} anchor="middle">
        banded end toward the Pico
      </Callout>

      <text
        className="hw-label"
        x={board.x + 4}
        y={board.y + board.height + 24}
      >
        top red rail = RAW pack voltage · top blue rail = common ground
      </text>
    </PictorialFigure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Fig 2 - one RGB group
   ══════════════════════════════════════════════════════════════════════════ */

export function RgbGroupPictorial() {
  const board = breadboardLayout({ columns: 40, x: 40, y: 60 });
  const pico = picoFootprint({ layout: board, column: 20 });
  const { hole } = board;

  // The four legs are one pitch apart on the part itself, so they occupy four
  // consecutive columns - which is also exactly why each colour needs its own
  // resistor rather than one shared one on the cathode.
  const leg = { red: 8, cathode: 9, green: 10, blue: 11 };

  return (
    <PictorialFigure
      width={830}
      height={420}
      label="Breadboard view of one common-cathode RGB LED group. The LED's four legs sit in four consecutive columns of the lower bank. Three resistors straddle the ravine, one in each anode column: 150 ohms for red, 68 ohms each for green and blue. Jumpers run from GP0, GP1 and GP2 on the Pico to the upper end of each resistor, and the shared cathode column is jumpered back to a Pico ground pin."
    >
      <Breadboard layout={board} />

      {/* ── the three ballast resistors, each straddling the ravine ────── */}
      <Resistor
        from={hole(leg.red, "f")}
        to={hole(leg.red, "e")}
        ohms={150}
        showValue={false}
      />
      <Resistor
        from={hole(leg.green, "f")}
        to={hole(leg.green, "e")}
        ohms={68}
        showValue={false}
      />
      <Resistor
        from={hole(leg.blue, "f")}
        to={hole(leg.blue, "e")}
        ohms={68}
        showValue={false}
      />

      {/* Values called out into the empty rows rather than printed beside the
          bodies: one pitch apart, green's and blue's labels would collide. */}
      <Callout at={hole(leg.red, "e")} to={hole(5, "d")} anchor="end">
        150 Ω → red
      </Callout>
      <Callout at={hole(leg.green, "e")} to={hole(5, "c")} anchor="end">
        68 Ω → green
      </Callout>
      <Callout at={hole(leg.blue, "e")} to={hole(5, "b")} anchor="end">
        68 Ω → blue
      </Callout>

      <RgbLed
        id="rgb1"
        red={hole(leg.red, "b")}
        cathode={hole(leg.cathode, "b")}
        green={hole(leg.green, "b")}
        blue={hole(leg.blue, "b")}
        radius={13}
        state={{ red: "flicker", green: "pulse", blue: "off" }}
      />

      {/* ── GPIO jumpers, entering the upper bank above each resistor ──── */}
      <Wire
        from={pico.tap("GP0", "a")}
        to={hole(leg.red, "j")}
        color="green"
        bow={0.1}
      />
      <Wire
        from={pico.tap("GP1", "a")}
        to={hole(leg.green, "i")}
        color="yellow"
        bow={0.08}
      />
      <Wire
        from={pico.tap("GP2", "a")}
        to={hole(leg.blue, "h")}
        color="blue"
        bow={0.06}
      />

      {/* ── the shared return ──────────────────────────────────────────── */}
      <Wire
        from={hole(leg.cathode, "a")}
        to={pico.tap(3, "b")}
        color="black"
        bowDirection={-1}
        flow
      />

      <PicoBoard footprint={pico} highlight={[1, 2, 3, 4]} labels="used" />

      <Callout
        at={hole(leg.cathode, "a")}
        to={{ x: board.columnX(leg.cathode), y: board.y + board.height + 24 }}
        anchor="middle"
      >
        common cathode → any Pico GND pin
      </Callout>
    </PictorialFigure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Fig 3 - the two NPN driver stages
   ══════════════════════════════════════════════════════════════════════════ */

export function NpnStagesPictorial() {
  const board = breadboardLayout({ columns: 50, x: 40, y: 76 });
  const pico = picoFootprint({ layout: board, column: 3 });
  const { hole } = board;

  // Each flood LED sits on `base` (resistor in), `base+2` (anode) and `base+3`
  // (cathode). The bases skip every sixth column, because that is where the
  // power rail's moulding has its gap and there is no hole to feed from.
  const floodBases = [31, 35, 40, 44];

  return (
    <PictorialFigure
      width={1010}
      height={450}
      label="Breadboard view of the two NPN low-side driver stages. In the lower bank, four white LEDs each with a 120 ohm resistor hang off the red raw rail, their cathodes bussed together into the collector of a 2N2222 whose base is fed from GP12 through 680 ohms and whose emitter returns to the blue ground rail. In the upper bank, an active buzzer and its 1N4148 flyback diode hang off the raw rail into the collector of a BC547 driven from GP16 through 1 kilohm."
    >
      <Breadboard layout={board} />

      {/* Bridge the top rails to the bottom ones, so one red rail is RAW and
          one blue rail is ground for the whole board. */}
      <Wire from={hole(1, "+t")} to={hole(1, "+b")} color="red" bow={0.03} />
      <Wire from={hole(2, "-t")} to={hole(2, "-b")} color="black" bow={0.03} />

      <text className="hw-label" x={board.x + 6} y={board.y - 34}>
        red rails = RAW 4.0–5.6 V, upstream of D1 · blue rails = common ground
      </text>
      <text className="hw-label" x={board.columnX(28)} y={board.y - 12}>
        BUZZER · GP16 · upper bank
      </text>
      <text
        className="hw-label"
        x={board.columnX(28)}
        y={board.y + board.height + 26}
      >
        WHITE FLOOD · GP12 · lower bank · 120 Ω on every LED
      </text>

      {/* ══ WHITE FLOOD - lower bank ══════════════════════════════════════ */}
      {floodBases.map((base) => (
        <g key={`flood-${base}`}>
          <Wire
            from={hole(base, "+b")}
            to={hole(base, "b")}
            color="red"
            bow={0.05}
          />
          <Resistor
            from={hole(base, "a")}
            to={hole(base + 2, "a")}
            ohms={120}
            showValue={false}
          />
          <Led
            id={`flood-${base}`}
            anode={hole(base + 2, "b")}
            cathode={hole(base + 3, "b")}
            color="#ffe6a8"
            state="pulse"
            polarity={false}
          />
        </g>
      ))}

      {/* cathode bus: every white cathode onto one node, then into Q1 */}
      <Wire from={hole(34, "e")} to={hole(38, "e")} color="yellow" bow={0.06} />
      <Wire from={hole(38, "d")} to={hole(43, "d")} color="yellow" bow={0.06} />
      <Wire from={hole(43, "e")} to={hole(47, "e")} color="yellow" bow={0.06} />
      <Wire from={hole(27, "d")} to={hole(34, "d")} color="yellow" bow={0.05} />

      <Transistor
        emitter={hole(25, "e")}
        base={hole(26, "e")}
        collector={hole(27, "e")}
        designator="Q1"
        label="2N2222"
      />
      <Resistor
        from={hole(23, "c")}
        to={hole(26, "c")}
        ohms={680}
        labelSide={1}
      />
      <Wire from={pico.tap(16, "a")} to={hole(23, "a")} color="purple" flow />
      <Wire from={hole(25, "a")} to={hole(25, "-b")} color="black" flow />

      {/* ══ BUZZER - upper bank ═══════════════════════════════════════════ */}
      <Wire from={pico.tap(21, "i")} to={hole(26, "i")} color="orange" flow />
      <Resistor
        from={hole(26, "h")}
        to={hole(32, "h")}
        ohms={1000}
        labelSide={-1}
      />
      <Transistor
        emitter={hole(31, "g")}
        base={hole(32, "g")}
        collector={hole(33, "g")}
        designator="Q2"
        label="BC547"
      />
      <Wire from={hole(31, "j")} to={hole(31, "-t")} color="black" flow />

      {/* The buzzer's minus pin faces Q2 and its plus faces the rail, so the
          collector jumper runs beside the can rather than under it. */}
      <Wire from={hole(41, "+t")} to={hole(41, "h")} color="red" flow />
      <Buzzer plus={hole(41, "f")} minus={hole(38, "f")} label="BZ1" sounding />
      <Wire from={hole(38, "h")} to={hole(33, "h")} color="grey" bow={0.04} />
      <Diode
        anode={hole(38, "i")}
        cathode={hole(41, "i")}
        label="D2 · 1N4148"
        body="glass"
        labelSide={-1}
      />

      {/* the Pico's own ground, onto the same blue rail */}
      <Wire from={pico.tap(18, "b")} to={hole(20, "-b")} color="black" flow />

      <PicoBoard footprint={pico} highlight={[16, 21, 18, 23]} labels="used" />
    </PictorialFigure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Fig 4 - the two buttons
   ══════════════════════════════════════════════════════════════════════════ */

export function ButtonsPictorial() {
  const board = breadboardLayout({ columns: 44, x: 40, y: 80 });
  const pico = picoFootprint({ layout: board, column: 3 });
  const { hole } = board;

  // A tactile switch is the one part here that *has* to straddle the ravine -
  // its 6.5 mm axis is what spans it - so each button necessarily puts one of
  // its two nodes in the upper bank and the other in the lower one. The GPIO
  // jumper therefore comes in from above and the ground jumper leaves below.
  const power = 27;
  const scene = 35;

  return (
    <PictorialFigure
      width={900}
      height={440}
      label="Breadboard view of the two buttons. Each 6 mm tactile switch straddles the ravine, so its upper pair of legs is one node and its lower pair the other. A jumper runs from GP17 to the upper node of the power button and from GP18 to the upper node of the scene button; each lower node is jumpered down to the blue ground rail, which is bridged to the top blue rail where the Pico's own ground pin plugs in. There are no resistors anywhere in this drawing - the pull-ups are inside the RP2040."
    >
      <Breadboard layout={board} />

      {/* One blue rail for the whole board, as in Fig 3. */}
      <Wire from={hole(1, "-t")} to={hole(1, "-b")} color="black" bow={0.03} />

      <text className="hw-label" x={board.x + 6} y={board.y - 34}>
        no resistors in this figure — the pull-ups are on the RP2040 die
      </text>
      <text className="hw-label" x={board.columnX(power)} y={board.y - 12}>
        SW2 · POWER · GP17
      </text>
      <text className="hw-label" x={board.columnX(scene)} y={board.y - 12}>
        SW3 · SCENE · GP18
      </text>

      {/* ── the two buttons, each across the ravine ─────────────────────── */}
      <Pushbutton a={hole(power, "f")} b={hole(power, "e")} designator="SW2" />
      <Pushbutton a={hole(scene, "f")} b={hole(scene, "e")} designator="SW3" />

      {/* ── GPIO in, above the ravine ───────────────────────────────────── */}
      <Wire
        from={pico.tap(22, "i")}
        to={hole(power, "j")}
        color="purple"
        bow={0.08}
      />
      <Wire
        from={pico.tap(24, "j")}
        to={hole(scene, "j")}
        color="green"
        bow={0.12}
      />

      {/* ── ground out, below it ────────────────────────────────────────── */}
      <Wire from={hole(power, "a")} to={hole(power, "-b")} color="black" flow />
      <Wire from={hole(scene, "a")} to={hole(scene, "-b")} color="black" flow />

      {/* The Pico's own ground - pin 23, which is physically between the two
          signal pins, so on the real board this is one short jumper. */}
      <Wire from={pico.tap(23, "i")} to={hole(20, "-t")} color="black" flow />

      <PicoBoard footprint={pico} highlight={[22, 23, 24]} labels="used" />

      {/* Both leaders land right of the last leg or below the board - the
          only regions here that are not either under the Pico's body or in a
          lane one of the four jumpers already runs down. */}
      <Callout
        at={hole(scene + 2, "f")}
        to={hole(scene + 5, "h")}
        anchor="start"
      >
        4 legs, 2 nodes
      </Callout>
      <Callout
        at={hole(power, "e")}
        to={{ x: board.columnX(power), y: board.y + board.height + 26 }}
        anchor="start"
      >
        the pair sharing a digit is already connected inside the switch
      </Callout>
    </PictorialFigure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The pinout reference
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The whole 40-pin map on the board itself - the one figure that uses
 * `labels="all"`, and deliberately the one with no breadboard under it. With
 * nothing plugged in there is nothing for forty name chips to cover, which is
 * the trade the `labelPlacement` default encodes.
 */
export function PicoPinoutPictorial() {
  const board = breadboardLayout({ columns: 22, x: 0, y: 0 });
  const pico = picoFootprint({ layout: board, column: 2 });

  return (
    <PictorialFigure
      width={420}
      height={320}
      label="The Raspberry Pi Pico's full 40-pin map, drawn on the board itself. Pins 1 to 20 run along the lower edge starting from GP0 beside the USB connector; pins 21 to 40 run back along the upper edge, ending with VSYS and VBUS at the USB end. Chips are coloured by function: green for GPIO, dark for ground, red for power, dark green for the ADC reference and pink for system control."
    >
      <PicoBoard footprint={pico} labels="all" labelStandoff={14} />
    </PictorialFigure>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Fig 5 - the I2S amplifier stage
   ══════════════════════════════════════════════════════════════════════════ */

/** The MAX98357A header, in the order it is printed on the board. */
const AMP_PINS = ["LRC", "BCLK", "DIN", "GAIN", "SD", "GND", "VIN"] as const;

export function AmpStagePictorial() {
  const board = breadboardLayout({ columns: 42, x: 40, y: 90 });
  const pico = picoFootprint({ layout: board, column: 3 });
  // Row `a` because a single-row module has to go in the outermost row of a
  // bank or its own PCB covers every hole you were about to wire to. The
  // consequence is that it overhangs the bottom rails, which is why RAW and
  // ground are taken off the *top* pair in this figure.
  const amp = breakoutFootprint({
    layout: board,
    column: 27,
    pins: AMP_PINS,
    row: "a",
    depth: 6,
  });
  const { hole } = board;

  const outputs = breakoutTerminals(amp, 2);
  const speaker = { x: 846, y: 394 };
  const speakerLeads = speakerTerminals(speaker);

  return (
    <PictorialFigure
      width={990}
      height={524}
      label="Breadboard view of the amplifier stage. A seven-pin MAX98357A module plugs into the outermost row of the lower bank, its PCB overhanging the bottom edge of the board, with the pin names LRC, BCLK, DIN, GAIN, SD, GND and VIN printed along its header. Three jumpers run from GP13, GP14 and GP15 to BCLK, LRC and DIN — the first two crossing, because the header's order is not the Pico's — and a fourth from GP22 on the far edge of the Pico, over the board, to SD. VIN and GND go up to the top red and blue rails, with a 470 microfarad electrolytic across them, and the module's two output pads run to an 8 ohm speaker sitting off the board. A quarter-watt 100 kilohm resistor lies in the lower bank between the GAIN column and a column five along, and a red jumper carries that far end up to the same top red rail VIN is on - strapping GAIN to VIN through 100 kilohms, which is the module's quietest gain setting and the only volume control in the build."
    >
      <Breadboard layout={board} />

      {/* Stacked rather than side by side: the rail legend is long enough
          that a second caption on the same line runs into it. */}
      <text className="hw-label" x={board.x + 6} y={board.y - 56}>
        top red rail = RAW 4.0–5.6 V, upstream of D1 · top blue rail = common
        ground
      </text>
      <text className="hw-label" x={board.x + 6} y={board.y - 32}>
        SPEAKER · GP13/14/15 + GP22 + R7 · lower bank
      </text>

      {/* ── the three I2S lines ─────────────────────────────────────────── */}
      {/* Each lands in its own row so the two that have to cross stay legible.
          Wire colour means nothing here - read the silkscreen. */}
      <Wire
        from={pico.tap(17, "b")}
        to={hole(28, "b")}
        color="yellow"
        bow={0.1}
      />
      <Wire
        from={pico.tap(19, "a")}
        to={hole(27, "c")}
        color="green"
        bow={0.1}
        bowDirection={-1}
      />
      <Wire
        from={pico.tap(20, "b")}
        to={hole(29, "d")}
        color="blue"
        bow={0.06}
      />

      {/* ── power and ground, off the top rails ─────────────────────────── */}
      <Wire from={amp.tap("VIN", "b")} to={hole(33, "+t")} color="red" flow />
      <Wire from={amp.tap("GND", "c")} to={hole(32, "-t")} color="black" flow />
      <Wire from={pico.tap(23, "i")} to={hole(24, "-t")} color="black" flow />

      {/* The bulk capacitor sits across the rails beside the module rather than
          across its two pins: a 470 µF radial has 5 mm legs, which is two holes,
          and the rails are where it can actually reach. */}
      <Capacitor
        positive={hole(37, "+t")}
        negative={hole(37, "-t")}
        label="C1 · 470 µF"
      />

      <BreakoutModule
        footprint={amp}
        label="MAX98357A"
        sublabel="I²S class-D amp"
        highlight={["BCLK", "LRC", "DIN", "GAIN", "SD"]}
        terminals={["OUT+", "OUT−"]}
      />

      {/* ── the speaker, off the board on flying leads ──────────────────── */}
      <Wire from={outputs[0]!} to={speakerLeads.positive} color="grey" />
      <Wire from={outputs[1]!} to={speakerLeads.negative} color="grey" />
      <Speaker {...speaker} label="SPK1" sublabel="8 Ω · 3 W · 40 mm" />

      {/* ── the GAIN strap ──────────────────────────────────────────────
          The resistor lies across five columns of the lower bank with one leg
          in GAIN's own column, and a jumper takes the far end up to the same
          red rail VIN is on. Drawn on the board rather than tacked to the
          module's pad because that is how it is actually built, and because a
          resistor sitting in the bank is a thing you can see is 100 kΩ - the
          bands read brown-black-yellow. */}
      <Resistor
        from={hole(30, "c")}
        to={hole(35, "c")}
        ohms={100000}
        showValue={false}
      />
      <Wire from={hole(35, "b")} to={hole(35, "+t")} color="red" bow={0.05} />
      <Callout
        at={hole(30, "c")}
        to={{ x: board.columnX(12), y: board.y + board.height + 26 }}
        anchor="middle"
      >
        R7 100 kΩ · GAIN → VIN = 3 dB, the quietest of five states
      </Callout>

      <PicoBoard
        footprint={pico}
        highlight={[17, 19, 20, 29, 23]}
        labels="used"
      />

      {/* Drawn AFTER the Pico, and that is not a layering trick - this jumper
          genuinely lies across the board. Every GPIO still free after the LEDs,
          the flood, the buzzer and the buttons is on the Pico's far edge, so the
          amp's enable line is the one wire in this build that has nowhere else
          to go. */}
      <Wire
        from={pico.tap(29, "i")}
        to={hole(31, "e")}
        color="purple"
        bow={0.22}
        bowDirection={-1}
      />

      <Callout at={hole(31, "e")} to={hole(35, "g")} anchor="start">
        GP22 → SD, over the Pico
      </Callout>
      <Callout
        at={outputs[1]!}
        to={{ x: board.columnX(20), y: board.y + board.height + 84 }}
        anchor="middle"
      >
        neither output is ground — do not tie one to the blue rail
      </Callout>
    </PictorialFigure>
  );
}
