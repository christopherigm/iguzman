/**
 * The five schematic drawings for the Pumpkin House Lantern build sheet.
 *
 * Ported from the standalone `schematic.html` that used to live in
 * `hardware/pumpkin-house/`. The geometry is unchanged - every coordinate,
 * path and label is the original - only the attribute names are React's
 * (`class` → `className`, `stroke-width` → `strokeWidth`, and so on).
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

/** Fig 2 - low-side NPN vs. anodes straight off GPIO. */
export function RgbOptionsFigure() {
  return (
    <svg
      viewBox="0 0 900 360"
      role="img"
      aria-label="Comparison of two wiring options for a common-cathode RGB LED. On the left, a single NPN transistor on the shared cathode switches all three colour dice together, giving only on and off. On the right, each anode is driven by its own GPIO pin through its own resistor, giving three independent PWM channels and full colour mixing."
    >
      {/* ============ LEFT: low-side NPN ============ */}
      <text x="40" y="34" className="lbl-hd">
        OPTION A — NPN ON THE COMMON CATHODE
      </text>

      <path className="wire-raw" d="M60,68 L300,68" />
      <text x="60" y="58" className="lbl-sm lbl-raw">
        RAW 4.8 V
      </text>

      {/* three branches down */}
      <g>
        <path className="wire-raw" d="M110,68 L110,104" />
        <path className="wire-raw" d="M180,68 L180,104" />
        <path className="wire-raw" d="M250,68 L250,104" />
        <circle cx="110" cy="68" r="3.5" className="node" />
        <circle cx="180" cy="68" r="3.5" className="node" />
        <circle cx="250" cy="68" r="3.5" className="node" />
      </g>

      {/* resistors (vertical zigzags) */}
      <g className="part">
        <path d="M110,104 l0,4 l-7,3 l14,6 l-14,6 l14,6 l-7,3 l0,4" />
        <path d="M180,104 l0,4 l-7,3 l14,6 l-14,6 l14,6 l-7,3 l0,4" />
        <path d="M250,104 l0,4 l-7,3 l14,6 l-14,6 l14,6 l-7,3 l0,4" />
      </g>

      {/* LED triangles pointing down */}
      <g>
        <path className="wire-raw" d="M110,140 L110,156" />
        <path className="wire-raw" d="M180,140 L180,156" />
        <path className="wire-raw" d="M250,140 L250,156" />
        <polygon points="99,156 121,156 110,174" className="part-fill" />
        <line x1="97" y1="174" x2="123" y2="174" className="part" />
        <polygon points="169,156 191,156 180,174" className="part-fill" />
        <line x1="167" y1="174" x2="193" y2="174" className="part" />
        <polygon points="239,156 261,156 250,174" className="part-fill" />
        <line x1="237" y1="174" x2="263" y2="174" className="part" />
      </g>
      <text x="100" y="196" className="lbl-sm">
        R
      </text>
      <text x="170" y="196" className="lbl-sm">
        G
      </text>
      <text x="240" y="196" className="lbl-sm">
        B
      </text>

      {/* shared cathode bus */}
      <path
        className="wire"
        d="M110,174 L110,212 L250,212 L250,174 M180,174 L180,212"
      />
      <circle cx="180" cy="212" r="3.5" className="node" />
      <text x="262" y="216" className="lbl-sm">
        shared cathode
      </text>

      {/* NPN */}
      <path className="wire" d="M180,212 L180,244" />
      <circle cx="180" cy="268" r="24" className="part" />
      <line x1="170" y1="252" x2="170" y2="284" className="part" />
      <path className="wire" d="M180,244 L180,258 L170,264" />
      <path className="wire" d="M170,272 L180,278 L180,296" />
      <polygon points="176,272 180,281 172,279" className="part-fill" />
      <path className="wire-logic" d="M146,268 L110,268" />
      <text x="60" y="272" className="lbl-sm lbl-logic">
        GPIO
      </text>

      {/* gnd */}
      <path className="wire" d="M180,296 L180,308" />
      <g className="part">
        <line x1="170" y1="308" x2="190" y2="308" />
        <line x1="174" y1="314" x2="186" y2="314" />
        <line x1="178" y1="320" x2="182" y2="320" />
      </g>

      <text x="290" y="264" className="lbl" fill="var(--rust)">
        one switch,
      </text>
      <text x="290" y="282" className="lbl" fill="var(--rust)">
        three dice —
      </text>
      <text x="290" y="300" className="lbl" fill="var(--rust)">
        no mixing
      </text>

      {/* divider */}
      <line x1="450" y1="20" x2="450" y2="340" className="box-dash" />

      {/* ============ RIGHT: GPIO direct ============ */}
      <text x="490" y="34" className="lbl-hd">
        OPTION B — ANODES STRAIGHT OFF GPIO
      </text>

      {/* three GPIO sources */}
      <text x="490" y="94" className="lbl-sm lbl-logic">
        GP0
      </text>
      <text x="490" y="164" className="lbl-sm lbl-logic">
        GP1
      </text>
      <text x="490" y="234" className="lbl-sm lbl-logic">
        GP2
      </text>
      <path className="wire-logic" d="M528,90 L586,90" />
      <path className="wire-logic" d="M528,160 L586,160" />
      <path className="wire-logic" d="M528,230 L586,230" />

      {/* resistors horizontal */}
      <g className="part">
        <path d="M586,90 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
        <path d="M586,160 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
        <path d="M586,230 l4,0 l3,-8 l6,16 l6,-16 l6,16 l6,-16 l3,8 l4,0" />
      </g>
      <text x="584" y="72" className="lbl-sm">
        150 Ω
      </text>
      <text x="584" y="142" className="lbl-sm">
        68 Ω
      </text>
      <text x="584" y="212" className="lbl-sm">
        68 Ω
      </text>

      {/* wires to LEDs */}
      <path className="wire-logic" d="M624,90 L664,90" />
      <path className="wire-logic" d="M624,160 L664,160" />
      <path className="wire-logic" d="M624,230 L664,230" />

      {/* LED triangles pointing right */}
      <g>
        <polygon points="664,79 664,101 684,90" className="part-fill" />
        <line x1="684" y1="77" x2="684" y2="103" className="part" />
        <polygon points="664,149 664,171 684,160" className="part-fill" />
        <line x1="684" y1="147" x2="684" y2="173" className="part" />
        <polygon points="664,219 664,241 684,230" className="part-fill" />
        <line x1="684" y1="217" x2="684" y2="243" className="part" />
      </g>
      <text x="700" y="82" className="lbl-sm">
        R
      </text>
      <text x="700" y="152" className="lbl-sm">
        G
      </text>
      <text x="700" y="222" className="lbl-sm">
        B
      </text>

      {/* common cathode bus to gnd */}
      <path
        className="wire"
        d="M684,90 L740,90 L740,230 L684,230 M684,160 L740,160"
      />
      <circle cx="740" cy="160" r="3.5" className="node" />
      <path className="wire" d="M740,160 L790,160 L790,282" />
      <g className="part">
        <line x1="780" y1="282" x2="800" y2="282" />
        <line x1="784" y1="288" x2="796" y2="288" />
        <line x1="788" y1="294" x2="792" y2="294" />
      </g>
      <text x="748" y="128" className="lbl-sm">
        shared cathode → GND
      </text>

      <text x="490" y="290" className="lbl" fill="var(--verdigris)">
        three independent PWM channels
      </text>
      <text x="490" y="308" className="lbl-sm">
        full colour mixing, zero transistors
      </text>
    </svg>
  );
}

/** Fig 3 - one RGB group in detail, with resistor values. */
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

/** Fig 4 - the two NPN low-side driver stages (white flood, buzzer). */
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

/** Fig 5 - the gate-rate axis and its three perceptual zones. */
export function GateRateFigure() {
  return (
    <svg
      viewBox="0 0 880 300"
      role="img"
      aria-label="A gate-rate axis from 1 hertz to 3 kilohertz divided into three perceptual zones: below 20 hertz the gating is heard as rhythm, between 20 and 120 hertz it fuses into timbre and roughness via amplitude-modulation sidebands, and near the 2.3 kilohertz carrier it produces intermodulation warbles."
    >
      <text x="30" y="28" className="lbl-hd">
        GATE RATE → PERCEPTUAL ZONE
      </text>

      {/* example gate waveforms */}
      <g className="wire-logic">
        <path d="M60,74 L60,54 L96,54 L96,74 L146,74 L146,54 L182,54 L182,74 L232,74" />
      </g>
      <g className="wire-logic">
        <path d="M340,74 L340,54 L352,54 L352,74 L364,74 L364,54 L376,54 L376,74 L388,74 L388,54 L400,54 L400,74 L412,74 L412,54 L424,54 L424,74 L436,74 L436,54 L448,54 L448,74 L460,74 L460,54 L472,54 L472,74 L484,74" />
      </g>
      <g className="wire-logic">
        <path d="M620,74 L620,54 L625,54 L625,74 L630,74 L630,54 L635,54 L635,74 L640,74 L640,54 L645,54 L645,74 L650,74 L650,54 L655,54 L655,74 L660,74 L660,54 L665,54 L665,74 L670,74 L670,54 L675,54 L675,74 L680,74 L680,54 L685,54 L685,74 L690,74 L690,54 L695,54 L695,74 L700,74 L700,54 L705,54 L705,74 L710,74 L710,54 L715,54 L715,74 L720,74 L720,54 L725,54 L725,74 L730,74 L730,54 L735,54 L735,74 L740,74 L740,54 L745,54 L745,74 L750,74 L750,54 L755,54 L755,74 L760,74 L760,54 L765,54 L765,74 L770,74" />
      </g>

      {/* axis */}
      <line x1="40" y1="130" x2="840" y2="130" className="wire" />
      <g className="part">
        <line x1="40" y1="126" x2="40" y2="134" />
        <line x1="306" y1="122" x2="306" y2="138" />
        <line x1="572" y1="122" x2="572" y2="138" />
        <line x1="840" y1="126" x2="840" y2="134" />
      </g>
      <text x="30" y="152" className="lbl-sm">
        1 Hz
      </text>
      <text x="286" y="152" className="lbl-sm">
        20 Hz
      </text>
      <text x="550" y="152" className="lbl-sm">
        120 Hz
      </text>
      <text x="806" y="152" className="lbl-sm">
        3 kHz
      </text>

      {/* zone bars */}
      <rect x="40" y="176" width="262" height="30" className="box" />
      <rect
        x="308"
        y="176"
        width="260"
        height="30"
        fill="none"
        stroke="var(--ember)"
        strokeWidth="1.6"
      />
      <rect
        x="574"
        y="176"
        width="266"
        height="30"
        fill="none"
        stroke="var(--verdigris)"
        strokeWidth="1.6"
      />

      <text x="54" y="196" className="lbl">
        RHYTHM
      </text>
      <text x="322" y="196" className="lbl lbl-live">
        TIMBRE · ROUGHNESS
      </text>
      <text x="588" y="196" className="lbl lbl-logic">
        INTERMODULATION
      </text>

      <text x="40" y="232" className="lbl-sm">
        Individual pulses are
      </text>
      <text x="40" y="248" className="lbl-sm">
        heard separately —
      </text>
      <text x="40" y="264" className="lbl-sm">
        beeps, ticks, Morse,
      </text>
      <text x="40" y="280" className="lbl-sm">
        heartbeats.
      </text>

      <text x="308" y="232" className="lbl-sm">
        Pulses fuse. AM sidebands
      </text>
      <text x="308" y="248" className="lbl-sm">
        appear around the carrier
      </text>
      <text x="308" y="264" className="lbl-sm">
        and it turns raspy — this is
      </text>
      <text x="308" y="280" className="lbl-sm">
        where the crow lives.
      </text>

      <text x="574" y="232" className="lbl-sm">
        Gate and carrier beat against
      </text>
      <text x="574" y="248" className="lbl-sm">
        each other, producing sum and
      </text>
      <text x="574" y="264" className="lbl-sm">
        difference tones. Unpredictable
      </text>
      <text x="574" y="280" className="lbl-sm">
        per unit — but free to try.
      </text>
    </svg>
  );
}
