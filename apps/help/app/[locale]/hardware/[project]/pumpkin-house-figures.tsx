/**
 * The five wiring drawings for the Pumpkin House Lantern tutorial.
 *
 * Four of them were ported from the standalone `schematic.html` that used to
 * live in `hardware/pumpkin-house/`. Their geometry is unchanged - every
 * coordinate, path and label is the original - only the attribute names are
 * React's (`class` → `className`, `stroke-width` → `strokeWidth`, and so on).
 * Fig 5, the I2S amplifier, is newer than that document and was drawn here.
 *
 * Two further drawings came across in that port and have since been dropped:
 * an NPN-vs-GPIO comparison and a buzzer gate-rate axis. Both illustrated an
 * *argument* rather than a connection, and the tutorial makes those points in
 * a sentence. Everything kept here is something you wire while holding it.
 *
 * Colour comes entirely from the semantic stroke classes in
 * `hardware-doc.css` (`wire-raw` for the battery rail, `wire-live` for the
 * post-diode rail, `wire-logic` for GPIO, `part`/`part-fill` for components),
 * so the drawings re-theme with the page instead of being baked light.
 *
 * Each `<svg>` keeps its `role="img"` and the long `aria-label` describing what
 * the circuit does - a schematic is unreadable to a screen reader otherwise,
 * and those descriptions were written to stand on their own.
 */

/** Fig 1 - the power path: pack → switch → branch → diode → VSYS. */
export function PowerPathFigure() {
  return (
    <svg
      viewBox="0 0 900 340"
      role="img"
      aria-label="Power path: a four-cell NiMH pack passes through a slide switch to a node that branches two ways — directly to the raw 4.8 volt rail feeding LEDs and buzzer, and through a 1N5817 Schottky diode which drops 0.32 volts before reaching the Pico's VSYS pin, keeping it under the 5.5 volt maximum."
    >
      {/* battery pack */}
      <text x="60" y="88" className="lbl-hd">
        4 × NiMH AA
      </text>
      <text x="60" y="104" className="lbl-sm">
        4.0 – 5.6 V
      </text>
      <g className="part">
        <line x1="72" y1="128" x2="72" y2="168" />
        <line x1="84" y1="138" x2="84" y2="158" />
        <line x1="96" y1="128" x2="96" y2="168" />
        <line x1="108" y1="138" x2="108" y2="158" />
        <line x1="120" y1="128" x2="120" y2="168" />
        <line x1="132" y1="138" x2="132" y2="158" />
        <line x1="144" y1="128" x2="144" y2="168" />
        <line x1="156" y1="138" x2="156" y2="158" />
      </g>
      <text x="62" y="122" className="lbl-sm">
        +
      </text>

      {/* pack to switch */}
      <path
        className="wire-raw"
        d="M72,148 L72,110 L72,148 M72,148 L48,148 L48,268"
      />
      <path className="wire-raw" d="M156,148 L215,148" />

      {/* slide switch */}
      <circle cx="218" cy="148" r="3" className="node" />
      <path className="wire-raw" d="M221,146 L249,132" />
      <circle cx="252" cy="148" r="3" className="node" />
      <path className="wire-raw" d="M255,148 L340,148" />
      <text x="204" y="182" className="lbl-sm">
        SW1 slide
      </text>

      {/* junction node */}
      <circle cx="340" cy="148" r="4.5" className="node" />
      <text x="316" y="126" className="lbl-hd lbl-raw">
        RAW
      </text>

      {/* branch down to loads */}
      <path className="wire-raw" d="M340,148 L340,236" />
      <rect x="248" y="236" width="188" height="50" className="box" />
      <text x="262" y="258" className="lbl">
        LED flood + buzzer
      </text>
      <text x="262" y="275" className="lbl-sm lbl-raw">
        full 4.0 – 5.6 V, no toll
      </text>

      {/* diode */}
      <path className="wire-raw" d="M340,148 L444,148" />
      <g>
        <polygon points="444,136 444,160 468,148" className="part-fill" />
        <line x1="468" y1="134" x2="468" y2="162" className="part" />
      </g>
      <text x="424" y="116" className="lbl-hd">
        D1 1N5817
      </text>
      <text x="440" y="186" className="lbl-sm">
        −0.32 V
      </text>

      {/* diode to pico */}
      <path className="wire-live" d="M468,148 L648,148" />
      <text x="500" y="128" className="lbl-hd lbl-live">
        3.7 – 5.28 V
      </text>

      {/* pico */}
      <rect x="648" y="98" width="180" height="188" className="box" />
      <text x="666" y="126" className="lbl-hd">
        RASPBERRY PI
      </text>
      <text x="666" y="142" className="lbl-hd">
        PICO / PICO W
      </text>
      <line x1="648" y1="156" x2="828" y2="156" className="box" />
      <circle cx="648" cy="148" r="4" className="node" />
      <text x="666" y="180" className="lbl">
        VSYS · pin 39
      </text>
      <text x="666" y="200" className="lbl-sm">
        accepts 1.8 – 5.5 V
      </text>
      <text x="666" y="252" className="lbl">
        GND · pin 38
      </text>

      {/* ground return */}
      <path className="wire" d="M648,244 L610,244 L610,268 L48,268" />
      <circle cx="648" cy="244" r="4" className="node" />
      <path className="wire" d="M340,286 L340,268" />
      <circle cx="340" cy="268" r="4.5" className="node" />

      {/* ground symbol */}
      <g className="part">
        <line x1="330" y1="300" x2="350" y2="300" />
        <line x1="334" y1="306" x2="346" y2="306" />
        <line x1="338" y1="312" x2="342" y2="312" />
      </g>
      <path className="wire" d="M340,286 L340,300" />

      {/* ceiling annotation */}
      <line x1="500" y1="60" x2="828" y2="60" className="box-dash" />
      <text x="500" y="52" className="lbl-sm">
        VSYS absolute ceiling 5.5 V — the diode is what keeps 5.6 V below it
      </text>
    </svg>
  );
}

/** Fig 2 - one RGB group in detail, with resistor values. */
export function RgbGroupFigure() {
  return (
    <svg
      viewBox="0 0 760 300"
      role="img"
      aria-label="Detailed schematic of one common-cathode RGB LED: GP0 through a 150 ohm resistor to the red anode, GP1 through 68 ohms to green, GP2 through 68 ohms to blue, with the shared cathode returning to a Pico ground pin."
    >
      <text x="30" y="30" className="lbl-hd">
        RGB GROUP 1 OF 4
      </text>

      {/* pico edge */}
      <rect x="30" y="52" width="120" height="196" className="box" />
      <text x="46" y="76" className="lbl-hd">
        PICO
      </text>
      <text x="46" y="112" className="lbl">
        GP0
      </text>
      <text x="46" y="152" className="lbl">
        GP1
      </text>
      <text x="46" y="192" className="lbl">
        GP2
      </text>
      <text x="46" y="232" className="lbl">
        GND
      </text>
      <text x="104" y="112" className="lbl-sm">
        p1
      </text>
      <text x="104" y="152" className="lbl-sm">
        p2
      </text>
      <text x="104" y="192" className="lbl-sm">
        p4
      </text>
      <text x="104" y="232" className="lbl-sm">
        p3
      </text>

      {/* three signal wires */}
      <path className="wire-logic" d="M150,108 L226,108" />
      <path className="wire-logic" d="M150,148 L226,148" />
      <path className="wire-logic" d="M150,188 L226,188" />

      {/* resistors */}
      <g className="part">
        <path d="M226,108 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
        <path d="M226,148 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
        <path d="M226,188 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
      </g>
      <text x="222" y="90" className="lbl-sm">
        R1 · 150 Ω
      </text>
      <text x="222" y="130" className="lbl-sm">
        R2 · 68 Ω
      </text>
      <text x="222" y="170" className="lbl-sm">
        R3 · 68 Ω
      </text>

      <path className="wire-logic" d="M264,108 L326,108" />
      <path className="wire-logic" d="M264,148 L326,148" />
      <path className="wire-logic" d="M264,188 L326,188" />

      {/* LED symbols */}
      <g>
        <polygon points="326,97 326,119 348,108" className="part-fill" />
        <line x1="348" y1="95" x2="348" y2="121" className="part" />
        <polygon points="326,137 326,159 348,148" className="part-fill" />
        <line x1="348" y1="135" x2="348" y2="161" className="part" />
        <polygon points="326,177 326,199 348,188" className="part-fill" />
        <line x1="348" y1="175" x2="348" y2="201" className="part" />
      </g>
      {/* emission arrows on the red die */}
      <g className="part">
        <line x1="332" y1="88" x2="342" y2="76" />
        <polygon points="342,76 336,79 340,82" className="part-fill" />
        <line x1="342" y1="88" x2="352" y2="76" />
        <polygon points="352,76 346,79 350,82" className="part-fill" />
      </g>
      <text x="358" y="102" className="lbl-sm">
        RED V
        <tspan baselineShift="sub" fontSize="8">
          f
        </tspan>{" "}
        2.0 V · 8.7 mA
      </text>
      <text x="358" y="142" className="lbl-sm">
        GRN V
        <tspan baselineShift="sub" fontSize="8">
          f
        </tspan>{" "}
        2.9 V · 5.9 mA
      </text>
      <text x="358" y="182" className="lbl-sm">
        BLU V
        <tspan baselineShift="sub" fontSize="8">
          f
        </tspan>{" "}
        2.9 V · 5.9 mA
      </text>

      {/* cathode bus */}
      <path
        className="wire"
        d="M348,108 L620,108 L620,188 L348,188 M348,148 L620,148"
      />
      <circle cx="620" cy="148" r="3.5" className="node" />
      <path className="wire" d="M620,148 L660,148 L660,244 L150,244" />
      <circle cx="150" cy="244" r="3.5" className="node" />
      <text x="470" y="270" className="lbl-sm">
        common cathode → any Pico GND pin (3, 8, 13, 18, 23, 28, 38)
      </text>
    </svg>
  );
}

/** Fig 3 - the two NPN low-side driver stages (white flood, buzzer). */
export function NpnStagesFigure() {
  return (
    <svg
      viewBox="0 0 880 420"
      role="img"
      aria-label="Two NPN low-side driver stages. Left: GP12 through a 680 ohm base resistor into a 2N2222, switching four white LEDs each with a 120 ohm resistor from the raw rail. Right: GP16 through a 1 kilohm base resistor into a BC547, switching the CYT1036 active buzzer with a 1N4148 flyback diode across it."
    >
      {/* ===== LEFT: white flood ===== */}
      <text x="30" y="30" className="lbl-hd">
        WHITE FLOOD · 4 × 5 mm
      </text>

      <path className="wire-raw" d="M40,66 L340,66" />
      <text x="40" y="56" className="lbl-sm lbl-raw">
        RAW 4.8 V (pre-diode)
      </text>

      <g>
        <path className="wire-raw" d="M70,66 L70,100" />
        <path className="wire-raw" d="M140,66 L140,100" />
        <path className="wire-raw" d="M210,66 L210,100" />
        <path className="wire-raw" d="M280,66 L280,100" />
        <circle cx="70" cy="66" r="3.5" className="node" />
        <circle cx="140" cy="66" r="3.5" className="node" />
        <circle cx="210" cy="66" r="3.5" className="node" />
        <circle cx="280" cy="66" r="3.5" className="node" />
      </g>

      {/* vertical resistors */}
      <g className="part">
        <path d="M70,100  l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
        <path d="M140,100 l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
        <path d="M210,100 l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
        <path d="M280,100 l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
      </g>
      <text x="292" y="128" className="lbl-sm">
        120 Ω each
      </text>

      {/* LEDs pointing down */}
      <g>
        <path className="wire-raw" d="M70,136 L70,150" />
        <path className="wire-raw" d="M140,136 L140,150" />
        <path className="wire-raw" d="M210,136 L210,150" />
        <path className="wire-raw" d="M280,136 L280,150" />
        <polygon points="59,150 81,150 70,168" className="part-fill" />
        <line x1="57" y1="168" x2="83" y2="168" className="part" />
        <polygon points="129,150 151,150 140,168" className="part-fill" />
        <line x1="127" y1="168" x2="153" y2="168" className="part" />
        <polygon points="199,150 221,150 210,168" className="part-fill" />
        <line x1="197" y1="168" x2="223" y2="168" className="part" />
        <polygon points="269,150 291,150 280,168" className="part-fill" />
        <line x1="267" y1="168" x2="293" y2="168" className="part" />
      </g>
      <text x="292" y="164" className="lbl-sm">
        warm white
      </text>

      {/* collector bus */}
      <path
        className="wire"
        d="M70,168 L70,206 L280,206 L280,168 M140,168 L140,206 M210,168 L210,206"
      />
      <circle cx="140" cy="206" r="3.5" className="node" />
      <circle cx="210" cy="206" r="3.5" className="node" />
      <path className="wire" d="M175,206 L175,244" />
      <circle cx="175" cy="206" r="3.5" className="node" />

      {/* NPN Q1 */}
      <circle cx="175" cy="272" r="26" className="part" />
      <line x1="163" y1="254" x2="163" y2="290" className="part" />
      <path className="wire" d="M175,246 L175,260 L163,266" />
      <path className="wire" d="M163,278 L175,285 L175,306" />
      <polygon points="170,277 175,288 166,285" className="part-fill" />
      <text x="208" y="268" className="lbl">
        Q1
      </text>
      <text x="208" y="286" className="lbl-sm">
        2N2222 / S8050
      </text>

      {/* base drive */}
      <path className="wire-logic" d="M137,272 L96,272" />
      <g className="part">
        <path d="M96,272 l-4,0 l-3,-8 l-6,16 l-6,-16 l-6,16 l-6,-16 l-3,8 l-4,0" />
      </g>
      <path className="wire-logic" d="M58,272 L30,272" />
      <text x="52" y="252" className="lbl-sm">
        680 Ω
      </text>
      <text x="26" y="296" className="lbl-sm lbl-logic">
        GP12 (PWM)
      </text>

      {/* gnd */}
      <path className="wire" d="M175,306 L175,340" />
      <g className="part">
        <line x1="163" y1="340" x2="187" y2="340" />
        <line x1="167" y1="347" x2="183" y2="347" />
        <line x1="172" y1="354" x2="178" y2="354" />
      </g>
      <text x="30" y="384" className="lbl-sm">
        I
        <tspan baselineShift="sub" fontSize="8">
          C
        </tspan>{" "}
        ≈ 50 mA nominal · BC547 would work but sits close to its 100 mA limit
      </text>

      {/* divider */}
      <line x1="440" y1="16" x2="440" y2="400" className="box-dash" />

      {/* ===== RIGHT: buzzer ===== */}
      <text x="490" y="30" className="lbl-hd">
        BUZZER · CYT1036 ACTIVE
      </text>

      <path className="wire-raw" d="M500,66 L800,66" />
      <text x="500" y="56" className="lbl-sm lbl-raw">
        RAW 4.8 V (pre-diode)
      </text>

      <path className="wire-raw" d="M620,66 L620,110" />
      <circle cx="620" cy="66" r="3.5" className="node" />

      {/* buzzer body */}
      <rect x="580" y="110" width="80" height="58" className="box" />
      <text x="596" y="136" className="lbl">
        BZ1
      </text>
      <text x="590" y="154" className="lbl-sm">
        ≈2.3 kHz
      </text>
      <text x="586" y="106" className="lbl-sm">
        +
      </text>

      {/* flyback diode */}
      <path className="wire-raw" d="M740,66 L740,110" />
      <circle cx="740" cy="66" r="3.5" className="node" />
      <g>
        <line x1="728" y1="118" x2="752" y2="118" className="part" />
        <polygon points="728,142 752,142 740,118" className="part-fill" />
      </g>
      <path className="wire" d="M740,142 L740,192" />
      <text x="762" y="134" className="lbl-sm">
        D2
      </text>
      <text x="762" y="150" className="lbl-sm">
        1N4148
      </text>

      {/* buzzer minus to collector */}
      <path className="wire" d="M620,168 L620,192 L740,192" />
      <circle cx="740" cy="192" r="3.5" className="node" />
      <path className="wire" d="M620,192 L620,236" />
      <circle cx="620" cy="192" r="3.5" className="node" />

      {/* NPN Q2 */}
      <circle cx="620" cy="264" r="26" className="part" />
      <line x1="608" y1="246" x2="608" y2="282" className="part" />
      <path className="wire" d="M620,238 L620,252 L608,258" />
      <path className="wire" d="M608,270 L620,277 L620,298" />
      <polygon points="615,269 620,280 611,277" className="part-fill" />
      <text x="653" y="260" className="lbl">
        Q2
      </text>
      <text x="653" y="278" className="lbl-sm">
        BC547
      </text>

      {/* base drive */}
      <path className="wire-logic" d="M582,264 L541,264" />
      <g className="part">
        <path d="M541,264 l-4,0 l-3,-8 l-6,16 l-6,-16 l-6,16 l-6,-16 l-3,8 l-4,0" />
      </g>
      <path className="wire-logic" d="M503,264 L478,264" />
      <text x="500" y="244" className="lbl-sm">
        1 kΩ
      </text>
      <text x="474" y="288" className="lbl-sm lbl-logic">
        GP16 (digital)
      </text>

      {/* gnd */}
      <path className="wire" d="M620,298 L620,332" />
      <g className="part">
        <line x1="608" y1="332" x2="632" y2="332" />
        <line x1="612" y1="339" x2="628" y2="339" />
        <line x1="617" y1="346" x2="623" y2="346" />
      </g>
      <text x="474" y="384" className="lbl-sm">
        ≈30 mA — well over the 12 mA a GPIO pin can source, hence Q2
      </text>
    </svg>
  );
}

/** Fig 4 - the two buttons, on internal pull-ups. */
export function ButtonsFigure() {
  return (
    <svg
      viewBox="0 0 780 320"
      role="img"
      aria-label="Two momentary pushbuttons on internal pull-ups. GP17 and GP18 each sit at the bottom of a pull-up resistor inside the RP2040, so each pin idles at 3.3 volts; its button shorts the pin to ground when pressed, pulling it low. No external resistors are required, and GND pin 23 sits physically between pins 22 and 24 so one ground jumper serves both buttons."
    >
      <text x="30" y="30" className="lbl-hd">
        POWER + SCENE · ACTIVE LOW
      </text>

      {/* pico edge */}
      <rect x="30" y="58" width="150" height="188" className="box" />
      <text x="48" y="84" className="lbl-hd">
        PICO
      </text>
      <text x="48" y="128" className="lbl">
        GP17
      </text>
      <text x="48" y="188" className="lbl">
        GP18
      </text>
      <text x="48" y="228" className="lbl">
        GND
      </text>
      <text x="134" y="128" className="lbl-sm">
        p22
      </text>
      <text x="134" y="188" className="lbl-sm">
        p24
      </text>
      <text x="134" y="228" className="lbl-sm">
        p23
      </text>

      {/* the internal pull-ups, drawn inside a dashed boundary because they
          are on the die - there is nothing here for you to fit */}
      <rect x="228" y="42" width="250" height="182" className="box-dash" />
      <text x="238" y="34" className="lbl-sm">
        inside the RP2040 — Pin.PULL_UP
      </text>

      <path className="wire-live" d="M330,58 L330,88 M416,58 L416,88" />
      <path className="wire-live" d="M300,58 L446,58" />
      <text x="300" y="50" className="lbl-sm lbl-live">
        3.3 V
      </text>

      <g className="part">
        <path d="M330,88 l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
        <path d="M416,88 l0,4 l-8,3 l16,6 l-16,6 l16,6 l-8,3 l0,4" />
      </g>
      <text x="248" y="118" className="lbl-sm">
        ≈50 kΩ each
      </text>

      <path className="wire-logic" d="M330,124 L330,128 L180,128" />
      <path className="wire-logic" d="M416,124 L416,188 L180,188" />
      <circle cx="330" cy="128" r="3.5" className="node" />
      <circle cx="416" cy="188" r="3.5" className="node" />

      {/* the two buttons */}
      <path className="wire-logic" d="M330,128 L560,128" />
      <path className="wire-logic" d="M416,188 L560,188" />

      <g>
        {/* SW2 - power */}
        <circle cx="563" cy="128" r="3" className="node" />
        <path className="part" d="M566,126 L604,112" />
        <circle cx="607" cy="128" r="3" className="node" />
        <path className="part" d="M578,104 L578,96 M570,100 L586,100" />
        <text x="548" y="92" className="lbl-hd">
          SW2 · POWER
        </text>
        <text x="548" y="160" className="lbl-sm">
          momentary
        </text>
      </g>
      <g>
        {/* SW3 - scene */}
        <circle cx="563" cy="188" r="3" className="node" />
        <path className="part" d="M566,186 L604,172" />
        <circle cx="607" cy="188" r="3" className="node" />
        <path className="part" d="M578,164 L578,156 M570,160 L586,160" />
        <text x="548" y="152" className="lbl-hd">
          SW3 · SCENE
        </text>
        <text x="548" y="220" className="lbl-sm">
          momentary
        </text>
      </g>

      {/* the shared return */}
      <path className="wire" d="M607,128 L680,128 L680,188 L607,188" />
      <circle cx="680" cy="188" r="3.5" className="node" />
      <path className="wire" d="M680,188 L680,246 L180,246" />
      <circle cx="180" cy="246" r="3.5" className="node" />

      <g className="part">
        <line x1="670" y1="262" x2="690" y2="262" />
        <line x1="674" y1="268" x2="686" y2="268" />
        <line x1="678" y1="274" x2="682" y2="274" />
      </g>
      <path className="wire" d="M680,246 L680,262" />

      <text x="30" y="292" className="lbl-sm">
        Idle: the pull-up holds the pin at 3.3 V, so the firmware reads 1.
        Pressed: the switch shorts it to 0 V and the falling edge fires the
        interrupt.
      </text>
      <text x="30" y="310" className="lbl-sm">
        No external resistors — GP17 and GP18 are pins 22 and 24, and the GND on
        pin 23 between them is the return for both.
      </text>
    </svg>
  );
}

/** Fig 5 - the I2S amplifier stage (MAX98357A + 8 Ω cone), and the GAIN strap. */
export function AmpStageFigure() {
  return (
    <svg
      viewBox="0 0 960 600"
      role="img"
      aria-label="The I2S amplifier stage. GP13, GP14 and GP15 carry bit clock, word select and serial data to a MAX98357A breakout; GP22 drives its SD shutdown pin. The module is powered from the raw pack rail, not the Pico's 3.3 volt regulator, with a 470 microfarad bulk capacitor across its supply, and its bridge-tied outputs drive an 8 ohm speaker with neither side grounded. A second drop from the same rail reaches the module's GAIN pad through a 100 kilohm resistor, which is the only volume control in the build: the table below the drawing lists all five states of that pad - 100 kilohm to ground is 15 decibels, straight to ground 12, floating 9, straight to VIN 6, and 100 kilohm to VIN 3 decibels, which is the state this board fits. Nothing in the firmware attenuates anything."
    >
      <text x="30" y="30" className="lbl-hd">
        SPEAKER · MAX98357A CLASS-D · I²S · GAIN STRAP
      </text>

      {/* ── power in, off the raw rail rather than 3V3 ──────────────────── */}
      <path className="wire-raw" d="M300,64 L900,64" />
      <text x="300" y="52" className="lbl-sm lbl-raw">
        RAW 4.0 – 5.6 V (pre-diode) — never the Pico&apos;s 3V3 pin
      </text>

      {/* ── the Pico's four signals ─────────────────────────────────────── */}
      <rect x="30" y="92" width="150" height="336" className="box" />
      <text x="48" y="118" className="lbl-hd">
        PICO
      </text>
      <text x="48" y="158" className="lbl">
        GP13
      </text>
      <text x="48" y="198" className="lbl">
        GP14
      </text>
      <text x="48" y="238" className="lbl">
        GP15
      </text>
      <text x="48" y="278" className="lbl">
        GP22
      </text>
      <text x="134" y="158" className="lbl-sm">
        p17
      </text>
      <text x="134" y="198" className="lbl-sm">
        p19
      </text>
      <text x="134" y="238" className="lbl-sm">
        p20
      </text>
      <text x="134" y="278" className="lbl-sm">
        p29
      </text>
      <text x="48" y="396" className="lbl">
        GND
      </text>
      <text x="134" y="396" className="lbl-sm">
        p38
      </text>

      <path className="wire-logic" d="M180,152 L376,152" />
      <path className="wire-logic" d="M180,192 L376,192" />
      <path className="wire-logic" d="M180,232 L376,232" />
      <path className="wire-logic" d="M180,272 L376,272" />

      <text x="206" y="144" className="lbl-sm lbl-logic">
        BCLK — bit clock
      </text>
      <text x="206" y="184" className="lbl-sm lbl-logic">
        LRC — word select, and it must be BCLK + 1
      </text>
      <text x="206" y="224" className="lbl-sm lbl-logic">
        DIN — serial data
      </text>
      <text x="206" y="264" className="lbl-sm lbl-logic">
        SD — shutdown / mode, not the data line
      </text>

      {/* ── the module ──────────────────────────────────────────────────── */}
      <rect x="376" y="122" width="184" height="212" className="box" />
      <text x="394" y="148" className="lbl-hd">
        U1 MAX98357A
      </text>
      <text x="394" y="166" className="lbl-sm">
        3 W class D, no DAC needed
      </text>
      <circle cx="376" cy="152" r="3.5" className="node" />
      <circle cx="376" cy="192" r="3.5" className="node" />
      <circle cx="376" cy="232" r="3.5" className="node" />
      <circle cx="376" cy="272" r="3.5" className="node" />
      <text x="394" y="304" className="lbl-sm">
        full-scale samples in
      </text>
      <text x="394" y="320" className="lbl-sm">
        R7 sets what comes out
      </text>

      {/* VIN: a plain drop off the rail. */}
      <path className="wire-raw" d="M440,64 L440,122" />
      <circle cx="440" cy="64" r="3.5" className="node" />
      <text x="446" y="110" className="lbl-sm">
        VIN
      </text>

      {/* GAIN: the same rail, through 100 kΩ. Drawn as a second drop beside
          VIN because that is exactly what it is - the pad is *strapped*, and
          which rail it is strapped to through which resistor is the whole
          volume control. */}
      <path className="wire-raw" d="M530,64 L530,74" />
      <circle cx="530" cy="64" r="3.5" className="node" />
      <path className="part" d="M530,74 l-9,5 l18,7 l-18,7 l18,7 l-18,7 l9,5" />
      <path className="wire-raw" d="M530,112 L530,122" />
      <text x="548" y="88" className="lbl-hd">
        R7 100 kΩ
      </text>
      <text x="548" y="106" className="lbl-sm">
        GAIN → VIN = 3 dB
      </text>

      {/* Bulk capacitor across the supply. It is drawn out past the speaker
          rather than beside the module because that is the only clear lane
          between the rail and the ground bus - everything left of it is either
          a signal line, the module itself or an output. On the board it belongs
          as close to VIN as its legs will reach. */}
      <path className="wire-raw" d="M790,64 L790,132" />
      <circle cx="790" cy="64" r="3.5" className="node" />
      <g className="part">
        <line x1="772" y1="132" x2="808" y2="132" />
        <path d="M772,152 a18,18 0 0 0 36,0" />
      </g>
      <text x="818" y="102" className="lbl-hd">
        C1 470 µF
      </text>
      <text x="818" y="122" className="lbl-sm">
        stripe = −, to GND
      </text>
      <text x="818" y="138" className="lbl-sm">
        fit it beside VIN
      </text>
      <path className="wire" d="M790,152 L790,390" />

      {/* ── the speaker, bridge-tied ────────────────────────────────────── */}
      <path className="wire" d="M560,180 L646,180" />
      <path className="wire" d="M560,240 L646,240" />
      <text x="566" y="172" className="lbl-sm">
        OUT+
      </text>
      <text x="566" y="264" className="lbl-sm">
        OUT−
      </text>

      <rect x="646" y="150" width="34" height="70" className="box" />
      <polygon points="680,150 730,122 730,248 680,220" className="part-fill" />
      <path className="wire" d="M646,220 L646,240" />
      <text x="666" y="282" className="lbl-hd">
        SPK1
      </text>
      <text x="646" y="300" className="lbl-sm">
        8 Ω · 3 W · 40 mm
      </text>

      {/* ── ground ──────────────────────────────────────────────────────── */}
      <path className="wire" d="M376,334 L376,390 L912,390" />
      <circle cx="376" cy="334" r="3.5" className="node" />
      <circle cx="790" cy="390" r="4.5" className="node" />
      <path className="wire" d="M180,390 L376,390" />
      <circle cx="180" cy="390" r="3.5" className="node" />
      <text x="188" y="412" className="lbl-sm">
        Pico GND — one thick lead to the pack, not daisy-chained
      </text>
      <g className="part">
        <line x1="900" y1="406" x2="924" y2="406" />
        <line x1="904" y1="413" x2="920" y2="413" />
        <line x1="909" y1="420" x2="915" y2="420" />
      </g>
      <path className="wire" d="M912,390 L912,406" />

      {/* ── the five states of the pad ──────────────────────────────────── */}
      <text x="30" y="454" className="lbl-hd">
        VOLUME IS THIS ONE RESISTOR — THE PAD HAS FIVE STATES
      </text>
      <text x="30" y="478" className="lbl-sm">
        GAIN tied to
      </text>
      <text x="250" y="478" className="lbl-sm">
        gain
      </text>
      <text x="340" y="478" className="lbl-sm">
        vs. floating
      </text>
      <text x="470" y="478" className="lbl-sm">
        ≈ 8 Ω @ 4.8 V
      </text>
      <path className="wire" d="M30,486 L900,486" />

      <text x="30" y="506" className="lbl-sm">
        100 kΩ → GND
      </text>
      <text x="250" y="506" className="lbl-sm">
        15 dB
      </text>
      <text x="340" y="506" className="lbl-sm">
        +6 dB
      </text>
      <text x="470" y="506" className="lbl-sm">
        ≈1.4 W
      </text>
      <text x="600" y="506" className="lbl-sm">
        the rail&apos;s ceiling — clips at full scale
      </text>

      <text x="30" y="526" className="lbl-sm">
        straight to GND
      </text>
      <text x="250" y="526" className="lbl-sm">
        12 dB
      </text>
      <text x="340" y="526" className="lbl-sm">
        +3 dB
      </text>
      <text x="470" y="526" className="lbl-sm">
        ≈0.7 W
      </text>

      <text x="30" y="546" className="lbl-sm">
        nothing (floating)
      </text>
      <text x="250" y="546" className="lbl-sm">
        9 dB
      </text>
      <text x="340" y="546" className="lbl-sm">
        —
      </text>
      <text x="470" y="546" className="lbl-sm">
        ≈0.35 W
      </text>
      <text x="600" y="546" className="lbl-sm">
        what a bare module does
      </text>

      <text x="30" y="566" className="lbl-sm">
        straight to VIN
      </text>
      <text x="250" y="566" className="lbl-sm">
        6 dB
      </text>
      <text x="340" y="566" className="lbl-sm">
        −3 dB
      </text>
      <text x="470" y="566" className="lbl-sm">
        ≈0.18 W
      </text>

      <text x="30" y="586" className="lbl-hd">
        100 kΩ → VIN
      </text>
      <text x="250" y="586" className="lbl-hd">
        3 dB
      </text>
      <text x="340" y="586" className="lbl-hd">
        −6 dB
      </text>
      <text x="470" y="586" className="lbl-hd">
        ≈0.09 W
      </text>
      <text x="600" y="586" className="lbl-hd">
        R7 — what this board fits
      </text>
    </svg>
  );
}
