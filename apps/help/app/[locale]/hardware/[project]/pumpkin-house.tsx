import { CodeBlock } from "@repo/ui/core-elements/code-block";
import {
  P,
  DocSection,
  DocH3,
  DocNote,
  DocFigure,
  DocTable,
} from "./doc-primitives";
import {
  PowerPathFigure,
  RgbGroupFigure,
  NpnStagesFigure,
  ButtonsFigure,
} from "./pumpkin-house-figures";
import {
  PowerPathPictorial,
  RgbGroupPictorial,
  NpnStagesPictorial,
  ButtonsPictorial,
  PicoPinoutPictorial,
} from "./pumpkin-house-pictorial";
import { DocDualFigure } from "./doc-dual-figure";

/**
 * The Pumpkin House Lantern build tutorial.
 *
 * Shaped as a tutorial, in the order you actually work: what you are building,
 * what to buy, what to install, eight numbered build steps, then a reference
 * tail for the things you look up at the bench rather than read once.
 *
 * This descends from two documents that used to live in `hardware/pumpkin-house/`
 * - a `README.md` (toolchain, flashing, tuning, troubleshooting) and a standalone
 * `schematic.html` (the circuit and the reasoning behind it) - which were first
 * merged onto this page and are now condensed into it. The engineering rationale
 * that filled most of the merged version survives as callouts attached to the
 * step it affects: why four cells and a Schottky (step 02), why the RGB anodes
 * hang off GPIO instead of transistors (step 03), why the buttons are read from
 * an interrupt (step 05), why the pads need 12 mA drive (the reference tail).
 * The dropped material was the long-form argument around those conclusions,
 * plus a catalogue of buzzer gate patterns that `buzzer.py` already implements.
 *
 * Only **one** numbered section sequence exists here, per `apps/help/CLAUDE.md`:
 * the build steps carry 01-08 and everything around them is titled but
 * unnumbered, so a bare "step 03" in the prose is unambiguous.
 */

const MPREMOTE_INSTALL =
  "# CLI - what the commands below assume\n" +
  "pipx install mpremote          # or: pip install --user mpremote\n" +
  "\n" +
  "# GUI - friendlier if you want to poke at things interactively\n" +
  "pipx install thonny            # or apt / flatpak / thonny.org";

const DIALOUT = "sudo usermod -aG dialout $USER";

const REPL_CHECK =
  "mpremote                    # opens the REPL; Ctrl-] to exit";

const UPLOAD =
  "mpremote cp hardware/pumpkin-house/src/*.py :\n" + "mpremote reset";

const VERIFY = "mpremote ls";

const BENCH_TEST =
  "import main\n" +
  "stage = main.build()\n" +
  "\n" +
  "main.demo(stage)                # every scene once, in order\n" +
  "\n" +
  "import scenes\n" +
  "scenes.crow(stage)              # a single scene\n" +
  "scenes.witching_hour(stage)     # long form, not in the random rotation\n" +
  'scenes.seance(stage, "HELLO")\n' +
  "\n" +
  "import buzzer as fx             # a bare effect, no lighting\n" +
  "fx.caw(stage.buzzer)\n" +
  "fx.ghost_swell(stage.buzzer)    # test this one - it varies between units\n" +
  "\n" +
  "stage.all_off()";

const BUTTON_TEST =
  "# Are the switches wired the right way round? Both should print 1 at\n" +
  "# rest and 0 while held - a pin stuck at 0 is the shorted pair.\n" +
  "from machine import Pin\n" +
  "import config\n" +
  "\n" +
  "power = Pin(config.POWER_PIN, Pin.IN, Pin.PULL_UP)\n" +
  "scene = Pin(config.SCENE_PIN, Pin.IN, Pin.PULL_UP)\n" +
  "print(power.value(), scene.value())\n" +
  "\n" +
  "# Then the firmware's own view of them, with the show running:\n" +
  "stage.powered()                 # False until the first press of SW2\n" +
  "stage.controls.set_power(True)  # wake it without a press, for the bench\n" +
  "stage.buzzer.toggle_mute()      # what press 2 of the cycle does\n" +
  "stage.buzzer.is_muted()\n" +
  "stage.controls.poll()           # serve whatever the interrupts latched\n" +
  "stage.interrupted()             # True if a press is waiting to be served";

const PAD_DRIVE =
  "import machine\n" +
  "\n" +
  "PADS_BANK0 = 0x4001C000\n" +
  "\n" +
  "def set_drive_12ma(gpio):\n" +
  "    addr = PADS_BANK0 + 0x04 + 4 * gpio\n" +
  "    machine.mem32[addr] = (machine.mem32[addr] & ~(0b11 << 4)) | (0b11 << 4)\n" +
  "\n" +
  "for pin in range(0, 12):      # GP0-GP11, the RGB anodes\n" +
  "    set_drive_12ma(pin)";

export function PumpkinHouseDoc() {
  return (
    <>
      {/* ══════════ Orientation ══════════ */}

      <DocSection title="What you're building">
        <P>
          A ceramic pumpkin house lit from the inside by four RGB LEDs and four
          white floods, with an active buzzer for sound, all driven by a
          Raspberry Pi Pico running MicroPython off four AA cells. The firmware
          burns a continuous flame flicker and drops set pieces into it at
          random - a crow call with a red flare on each syllable, a heartbeat
          under an amber pulse, green crickets between them.
        </P>
        <P>
          Two buttons on the outside of the case drive it.{" "}
          <strong>Power</strong> is a three-press cycle - on, sound on/off, off
          - and answers every press with a colour before it acts: white for
          awake, green or red for audible or silent, purple for going to sleep.{" "}
          <strong>Scene</strong> cuts straight to the next set piece, and
          pressing it again during one skips on to the following, which is the
          fastest way to audition the whole show while you are still tuning it.
        </P>
        <P>
          <strong>The lantern boots asleep.</strong> Flick the pack&rsquo;s
          slide switch and nothing lights until someone presses power - a
          decoration you have to switch on is a decoration that does not run its
          cells down in a cupboard. The slide switch is still the real cut-off;
          the power button leaves the Pico running at a few milliamps.
        </P>
        <P>
          It draws about <strong>93 mA</strong>, which is roughly{" "}
          <strong>20 hours</strong> - several nights - on 1900 mAh cells. Total
          dissipation is under a watt, so heat inside the sealed ceramic is a
          non-issue. Expect two evenings: one to wire and test on the bench, one
          to fit it into the enclosure.
        </P>
        <P>
          There is <strong>no compile step</strong> anywhere in this build.
          MicroPython is an interpreter running on the Pico; you copy{" "}
          <code>.py</code> files onto the board and it executes them.
        </P>
      </DocSection>

      <DocSection title="Hardware you need">
        <DocTable>
          <thead>
            <tr>
              <th className="mono">Qty</th>
              <th>Part</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">1</td>
              <td>Raspberry Pi Pico</td>
              <td>
                Pico, Pico W, Pico 2 or Pico 2 W all work. On a W, deinitialise
                the radio - leaving Wi-Fi up costs 50&ndash;70 mA.
              </td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td>RGB LED, 5 mm, common cathode</td>
              <td>
                <strong>Common cathode specifically</strong> - common anode will
                not work with this circuit. Verify before wiring, see step 08.
              </td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td>White LED, 5 mm</td>
              <td>The flood channel. This is where the actual lumens are.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>CYT1036 active buzzer</td>
              <td>Polarised. Any 3&ndash;5 V active buzzer substitutes.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>2N2222 NPN transistor</td>
              <td>
                Q1, flood driver. S8050 is equally fine; BC547 is marginal here.
              </td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>BC547 NPN transistor</td>
              <td>Q2, buzzer driver. Any of the three works in this slot.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>1N5817 Schottky diode</td>
              <td>
                D1, pack to VSYS. Not optional - see step 02. Do not substitute
                a 1N4001; you need the low forward drop.
              </td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>1N4148 diode</td>
              <td>D2, flyback clamp across the buzzer.</td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td>150 Ω resistor</td>
              <td>RGB red anodes, one per LED.</td>
            </tr>
            <tr>
              <td className="mono">8</td>
              <td>68 Ω resistor</td>
              <td>RGB green and blue anodes, two per LED.</td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td>120 Ω resistor</td>
              <td>White floods, one per LED.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>680 Ω resistor</td>
              <td>Q1 base.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>1 kΩ resistor</td>
              <td>Q2 base.</td>
            </tr>
            <tr>
              <td className="mono">4</td>
              <td>AA NiMH cells, low self-discharge</td>
              <td>Eneloop-class. See the warning below - this one matters.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>4×AA battery holder</td>
              <td>Roughly 60 × 58 × 17 mm. Don&rsquo;t glue it in.</td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>Slide switch</td>
              <td>Goes in the pack&rsquo;s negative lead.</td>
            </tr>
            <tr>
              <td className="mono">2</td>
              <td>Momentary pushbutton, 6 mm tactile</td>
              <td>
                SW2 power, SW3 scene. Any normally-open momentary switch works -
                the firmware supplies the pull-up. Panel-mount buttons are
                easier to fit through ceramic; see step 05.
              </td>
            </tr>
            <tr>
              <td className="mono">1</td>
              <td>Ceramic pumpkin house</td>
              <td>
                The reference build is ⌀120 × 110 mm with cut-out windows.
              </td>
            </tr>
            <tr>
              <td className="mono">—</td>
              <td>Perfboard, hookup wire, heatshrink</td>
              <td>Plus a multimeter with a diode-test mode for step 07.</td>
            </tr>
          </tbody>
        </DocTable>

        <DocNote kind="warn" tag="Buy low-self-discharge cells">
          <P>
            Ordinary NiMH loses 15&ndash;20 % in the first day and keeps going.
            Charge a standard pack in early October and it will be flat by the
            31st. Eneloop-type LSD cells hold ~85 % for a year, which is the
            difference between a decoration that works and one you have to
            remember to service.
          </P>
        </DocNote>
      </DocSection>

      <DocSection title="Software you need">
        <P>
          <strong>a. MicroPython firmware</strong> - a <code>.uf2</code> file
          for your specific board, from{" "}
          <a
            href="https://micropython.org/download/"
            target="_blank"
            rel="noopener noreferrer"
          >
            micropython.org/download
          </a>
          . Take the latest stable release, not a nightly:
        </P>

        <DocTable>
          <thead>
            <tr>
              <th>Board</th>
              <th>Download page</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">Pico</td>
              <td>
                <a
                  href="https://micropython.org/download/RPI_PICO/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  micropython.org/download/RPI_PICO
                </a>
              </td>
            </tr>
            <tr>
              <td className="mono">Pico W</td>
              <td>
                <a
                  href="https://micropython.org/download/RPI_PICO_W/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  micropython.org/download/RPI_PICO_W
                </a>
              </td>
            </tr>
            <tr>
              <td className="mono">Pico 2</td>
              <td>
                <a
                  href="https://micropython.org/download/RPI_PICO2/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  micropython.org/download/RPI_PICO2
                </a>
              </td>
            </tr>
            <tr>
              <td className="mono">Pico 2 W</td>
              <td>
                <a
                  href="https://micropython.org/download/RPI_PICO2_W/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  micropython.org/download/RPI_PICO2_W
                </a>
              </td>
            </tr>
          </tbody>
        </DocTable>

        <P>
          <strong>b. A tool to copy files onto the board.</strong> Either works
          - pick by taste:
        </P>
        <CodeBlock language="bash" code={MPREMOTE_INSTALL} />

        <P>
          <strong>c. On Linux, serial permissions.</strong> The Pico appears as{" "}
          <code>/dev/ttyACM0</code>, owned by the <code>dialout</code> group on
          most distros, so add yourself once:
        </P>
        <CodeBlock language="bash" code={DIALOUT} />
        <P>
          Then <strong>log out and back in</strong> - group changes do not apply
          to an existing session. Skipping this produces a &ldquo;permission
          denied&rdquo; on <code>/dev/ttyACM0</code> that looks exactly like a
          broken cable.
        </P>
      </DocSection>

      {/* ══════════ The build ══════════ */}

      <DocSection num="01" title="Flash MicroPython onto the Pico">
        <P>Once per board, before anything is wired to it:</P>
        <ol>
          <li>Unplug the Pico.</li>
          <li>
            Hold <strong>BOOTSEL</strong> and plug the USB cable back in.
            Release BOOTSEL.
          </li>
          <li>
            It mounts as a USB drive called <code>RPI-RP2</code>.
          </li>
          <li>
            Drag the <code>.uf2</code> onto it. The board reboots on its own and
            the drive disappears - that is success, not an error.
          </li>
        </ol>
        <P>Confirm you have a working interpreter:</P>
        <CodeBlock language="bash" code={REPL_CHECK} />
        <P>
          You should get a <code>&gt;&gt;&gt;</code> prompt. If you don&rsquo;t,
          fix that now - every later step assumes it.
        </P>
      </DocSection>

      <DocSection num="02" title="Build the power path">
        <P>
          Four AA NiMH cells, a slide switch in the <strong>negative</strong>{" "}
          lead, then the rail splits two ways: the LED and buzzer loads tap the
          pack directly, and a separate branch goes through the 1N5817 into the
          Pico&rsquo;s <strong>VSYS</strong> (pin 39). Pack negative and Pico
          GND (pin 38) are common.
        </P>

        <DocDualFigure
          captionLabel="Fig 1"
          caption="The diode is not a formality. Straight off the charger the pack sits at 5.6 V, above the VSYS maximum; the 1N5817's 0.32 V forward drop lands it at 5.28 V. The loads branch upstream of the diode so they keep the full rail."
          pictorialCaption="The same power path on a breadboard. The pack feeds the top red rail and returns through the switch to the blue one; D1 bridges the red rail into the Pico's VSYS column with its banded end facing the board. Everything hanging off the red rail to the right of D1's feed is upstream of it and keeps the full pack voltage."
          schematic={<PowerPathFigure />}
          pictorial={<PowerPathPictorial />}
        />

        <P>
          Fit D1 with its <strong>banded end toward the Pico</strong>. Backwards
          means the Pico simply never powers up - that is the safe failure mode,
          so if nothing comes on later, flip it before suspecting anything else.
        </P>

        <DocNote tag="Why four cells and a diode">
          <P>
            VSYS accepts <strong>1.8 V &ndash; 5.5 V</strong> and that ceiling
            is not negotiable. Three cells stay in spec but starve green and
            blue as they sag; four cells read 5.6 V fresh off the charger, which
            is over the limit; five cells are unsalvageable. Four cells{" "}
            <em>plus the Schottky</em> sit at 5.28 V fresh and 3.70 V flat - in
            spec across the whole discharge. The diode also lets you plug in USB
            for development without the pack fighting the USB rail. Note that
            extra cells never buy brightness, only headroom: brightness is set
            by current through the die, and surplus voltage is burned off as
            heat in the ballast resistor.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="03" title="Wire the four RGB LEDs">
        <P>
          One group, repeated four times, on GP0&ndash;GP11. Each anode gets its
          own resistor - <strong>150 Ω for red, 68 Ω for green and blue</strong>{" "}
          - and all four cathodes go to any Pico GND pin. Never share a resistor
          across colours or across LEDs, or the lowest-V<sub>f</sub> die hogs
          the current and the others go dark.
        </P>

        <DocDualFigure
          captionLabel="Fig 2"
          caption="One RGB group. Build four of these on GP0–GP11; the full pin assignment is in the reference below. Currents shown are at nominal Vf — real dice vary, and green/blue will read a few mA either side."
          pictorialCaption="The same group on a breadboard. The LED's four legs are one pitch apart, so they land in four consecutive columns — and because a column is one node, each anode gets its own resistor straddling the ravine into its own column. Leg order on the part is red · cathode · green · blue, with the cathode the long one."
          schematic={<RgbGroupFigure />}
          pictorial={<RgbGroupPictorial />}
        />

        <DocNote tag="Why these run straight off GPIO">
          <P>
            A common-cathode RGB LED has three anodes and one shared cathode,
            and an NPN switches the <em>low</em> side - so the only place an NPN
            can sit is on that shared cathode, where it switches all three
            colours together. That gives an on/off lamp, not a colour mixer.
            Per-colour switching from the 4.8 V rail would need a PNP or
            P-MOSFET per channel plus an NPN pre-driver each: six transistors
            per LED. The cost of driving the anodes directly instead is that
            green and blue (V
            <sub>f</sub> ≈ 3.0&ndash;3.2 V) have almost no headroom against a
            3.3 V pin and run dimmer than red. For a jack-o&rsquo;-lantern that
            barely matters - you want amber and ember, which is red at full with
            a touch of green. Save the transistors for the flood in step 04.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="04" title="Wire the flood and the buzzer">
        <P>
          Both run off the <strong>raw pack rail</strong>, upstream of D1, and
          both are low-side switched by an NPN. The white flood is where the
          brightness lives: a white die at 12 mA off 4.8 V puts out far more
          usable light than an RGB die scraping along on 3.3 V.
        </P>
        <ul>
          <li>
            <strong>Flood:</strong> GP12 (pin 16) → 680 Ω → Q1 base. Four white
            LEDs, each with its own 120 Ω, from the raw rail into Q1&rsquo;s
            collector; emitter to GND.
          </li>
          <li>
            <strong>Buzzer:</strong> GP16 (pin 21) → 1 kΩ → Q2 base. Buzzer from
            the raw rail into Q2&rsquo;s collector; emitter to GND.{" "}
            <strong>D2 goes across the buzzer</strong>, cathode to the raw rail.
          </li>
        </ul>

        <DocDualFigure
          captionLabel="Fig 3"
          caption="Both stages switch the low side of a load hung off the raw rail. D2 is a flyback clamp: magnetic-type active buzzers contain a coil, and killing the current in one produces a reverse spike that will slowly destroy Q2 without it."
          pictorialCaption="Both stages on one board. The flood is built in the lower bank because GP12 is a lower-row pin and the buzzer in the upper bank because GP16 is an upper-row one; the two rail bridges at columns 1 and 2 make the top and bottom rails one raw rail and one ground. Watch the TO-92 legs: a 2N2222 and a BC547 have their emitter and collector swapped."
          schematic={<NpnStagesFigure />}
          pictorial={<NpnStagesPictorial />}
        />

        <P>
          The buzzer is <strong>active</strong> - it contains its own
          oscillator, so it produces one fixed pitch of roughly 2.3 kHz and
          nothing else. You cannot play a melody on it; what the firmware
          controls is the <em>gate</em>, and gating faster than about 20 Hz
          stops being heard as rhythm and starts being heard as tone colour,
          which is what makes a raspy crow call possible on a one-note device.{" "}
          <code>buzzer.py</code> ships the effect library. If the fixed pitch
          starts to feel limiting, a passive piezo disc turns pitch into a
          variable; it wires to a PWM pin through 100 Ω and needs no transistor,
          and spare GP13 is already sitting there.
        </P>
      </DocSection>

      <DocSection num="05" title="Wire the two buttons">
        <P>
          This is the cheapest stage on the board: two switches, two jumpers, a
          shared ground, and <strong>no other components at all</strong>. Each
          button shorts its GPIO to GND when pressed, and the pull-up that makes
          that readable is inside the RP2040 - the firmware turns it on with{" "}
          <code>Pin.PULL_UP</code>, so the pin idles at 3.3 V and reads{" "}
          <code>1</code> until you press it.
        </P>
        <ul>
          <li>
            <strong>Power (SW2):</strong> GP17 (pin 22) → one side of the
            switch; the other side → GND.
          </li>
          <li>
            <strong>Scene (SW3):</strong> GP18 (pin 24) → one side of the
            switch; the other side → GND.
          </li>
        </ul>
        <P>
          Those two pins were chosen for where they sit rather than for anything
          electrical: <strong>GND on pin 23 falls between them</strong>, so one
          jumper off that pin is the return for both buttons, and they leave
          GP13&ndash;GP15 free as the three spare PWM channels.
        </P>

        <DocDualFigure
          captionLabel="Fig 4"
          caption="Both buttons are active-low. The pull-up resistors are drawn inside a dashed boundary because they are on the RP2040 die — there is nothing here for you to fit, and adding an external pull-up on top of the internal one is harmless but pointless."
          pictorialCaption="The same two buttons on a breadboard. A 6 mm tactile switch has four legs and only two nodes: the pair on one side of the ravine is already connected inside the part, and the switch is between the two sides — which is why it has to straddle the ravine, and why the legs carry a digit each here. The GPIO jumper comes in above and the ground jumper leaves below."
          schematic={<ButtonsFigure />}
          pictorial={<ButtonsPictorial />}
        />

        <P>
          <strong>Check the orientation before you trust it.</strong> A tactile
          switch has four legs but only two nodes, and rotating one a quarter
          turn wires the already-connected pair across your circuit - giving a
          button that reads as permanently held. With a multimeter on
          continuity, the two legs you are actually using must read{" "}
          <em>open</em> until you press. This failure looks exactly like a
          firmware bug, so rule it out first.
        </P>

        <DocNote tag="Why the firmware reads these from an interrupt">
          <P>
            Everything else in this build blocks. A single buzzer pulse holds
            the CPU for up to 230 ms, and a scene can run for twenty seconds; a
            loop that samples the pin when it gets a moment would simply not see
            a tap that started and ended inside one of those. So{" "}
            <code>buttons.py</code> registers a falling-edge{" "}
            <code>Pin.irq</code> whose handler does two things and stops -
            debounce, then set a flag. It never touches the buzzer or the LEDs,
            because both of those sleep, and sleeping inside an interrupt is how
            you get a lantern that stops responding to anything at all. Acting
            on the flag happens back in normal code, in <code>Stage.idle</code>{" "}
            - the one callback that keeps getting a turn while a scene is
            blocking.
          </P>
        </DocNote>

        <DocH3>What SW2 does: one button, three jobs</DocH3>
        <P>
          SW2 is a <strong>cycle</strong>, not a toggle. There is no display on
          a ceramic pumpkin, so each press paints its own answer across the
          whole lantern first - the flood to 100% and every RGB group to one
          flat colour - and only then does the thing it says:
        </P>
        <DocTable>
          <thead>
            <tr>
              <th className="mono">Press</th>
              <th>What it does</th>
              <th>Confirmation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">1</td>
              <td>Wake up &mdash; the show starts</td>
              <td>White, 400 ms</td>
            </tr>
            <tr>
              <td className="mono">2</td>
              <td>Sound on / off</td>
              <td>Green if now audible, red if now silent &mdash; 400 ms</td>
            </tr>
            <tr>
              <td className="mono">3</td>
              <td>Sleep &mdash; dark and silent until pressed again</td>
              <td>Purple, 2 s, then black</td>
            </tr>
          </tbody>
        </DocTable>
        <P>
          A fourth press starts the cycle over. The cycle is{" "}
          <strong>positional</strong> - press three is always &ldquo;off&rdquo;,
          never &ldquo;off unless the sound happens to be muted&rdquo; - because
          a button whose next action depends on hidden state is a button nobody
          can use in the dark.
        </P>

        <DocNote tag="Two consequences worth knowing before you retune it">
          <P>
            <strong>There is one sound toggle per cycle</strong>, so the mute
            state has to survive going off and coming back - otherwise the
            second press of every cycle would be the only one that ever silenced
            it, and a lantern you muted at 10pm would be loud again the moment
            you woke it. <code>_muted</code> lives on the Buzzer and nothing in{" "}
            <code>buttons.py</code> resets it. The practical effect is that
            sound alternates cycle to cycle: mute on this one, unmute on the
            next.
          </P>
          <P>
            <strong>Press 3 cuts whatever is playing.</strong>{" "}
            <code>Stage.interrupted()</code> counts the power button as well as
            the scene button, so the buzzer&rsquo;s blocking primitives bail out
            and the running scene unwinds through its own <code>release()</code>{" "}
            - which checks the power state and goes dark instead of handing the
            flame back. Without that check the lantern relights for the fraction
            of a second it takes <code>main.run</code> to notice, and that reads
            as a fault rather than an off switch.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="06" title="Upload the firmware">
        <P>From the repo root, with the Pico on USB:</P>
        <CodeBlock language="bash" code={UPLOAD} />
        <P>
          The trailing <code>:</code> means &ldquo;the board&rsquo;s filesystem
          root&rdquo;. MicroPython runs <code>main.py</code> automatically at
          boot, so the reset is the whole deployment. <code>mpremote</code>{" "}
          auto-detects a single connected board; with more than one plugged in,
          name it: <code>mpremote connect /dev/ttyACM0 cp ...</code>
        </P>
        <P>
          <strong>In Thonny instead:</strong> set the interpreter to{" "}
          <em>MicroPython (Raspberry Pi Pico)</em> via the bottom-right corner,
          then open each file from <code>src/</code> and use{" "}
          <strong>File → Save as… → Raspberry Pi Pico</strong>, keeping the same
          filename. Files must land in the root, not in a <code>src/</code>{" "}
          folder on the board.
        </P>
        <P>Verify it took:</P>
        <CodeBlock language="bash" code={VERIFY} />
        <P>
          Expect <code>main.py</code>, <code>config.py</code>,{" "}
          <code>leds.py</code>, <code>buzzer.py</code>, <code>scenes.py</code>,{" "}
          <code>pads.py</code>, <code>buttons.py</code>. All seven, in the root.
        </P>
      </DocSection>

      <DocSection num="07" title="Test on the bench">
        <P>
          <code>main.py</code> guards its entry point, so importing it does{" "}
          <strong>not</strong> start the show. Connect with{" "}
          <code>mpremote repl</code> and drive it by hand before the boards go
          anywhere near the enclosure:
        </P>
        <CodeBlock language="python" code={BENCH_TEST} />
        <P>
          Bring the flood channel up on its own first. If Q1 gets warm, your
          base resistor is too small or one of the flood resistors is missing -
          stop and fix that before running the full demo.
        </P>

        <DocH3>Then the buttons</DocH3>
        <CodeBlock language="python" code={BUTTON_TEST} />
        <P>
          Both pins should print <code>1</code> at rest and <code>0</code> while
          held. A pin stuck at <code>0</code> is the rotated switch from step
          05, not a bad pin. Then press <strong>power</strong> four times slowly
          and watch the confirmations walk white → green or red → purple →
          white: that one sequence proves the switch, the debounce, the flood
          channel and all three RGB channels in one go.
        </P>
        <P>
          With the show running, press <strong>scene</strong> repeatedly: it
          should walk <code>scenes.SEQUENCE</code> in order, one press per
          scene, cutting the current one short rather than queueing behind it.
          The sound leg of the power button should kill the sound instantly
          while the lighting carries on at exactly the same pace - muting gates
          the carrier and changes no durations, so a scene looks identical
          silenced.
        </P>
        <DocNote tag="Nothing happens when you call a scene by hand">
          <P>
            Expected: a Stage built at the REPL is <em>asleep</em>, exactly as
            the lantern is at boot, and every effect aborts against{" "}
            <code>Stage.interrupted()</code> the instant it starts. Call{" "}
            <code>stage.controls.set_power(True)</code> first - there is no
            button to press up there. <code>main.demo(stage)</code> does it for
            you.
          </P>
        </DocNote>
        <P>
          To stop the lantern once it is running the real loop:{" "}
          <code>mpremote repl</code>, then <strong>Ctrl-C</strong>.{" "}
          <code>main()</code> clears the LEDs and silences the buzzer in a{" "}
          <code>finally</code> block, so an interrupt never leaves the buzzer
          screaming. To stop it running at boot at all, rename{" "}
          <code>main.py</code> on the board.
        </P>
      </DocSection>

      <DocSection num="08" title="Assemble it in the pumpkin">
        <DocH3>Check these five things before powering up</DocH3>
        <ol>
          <li>
            Confirm your RGB LEDs really are common cathode: with a multimeter
            in diode mode, the longest leg should be the one that lights all
            three dice when the <em>black</em> probe touches it.
          </li>
          <li>Check D1&rsquo;s orientation - banded end toward the Pico.</li>
          <li>
            Measure VSYS with the pack fresh off the charger. You are looking
            for a number below 5.5 V.
          </li>
          <li>Sleeve the pack terminals. Ceramic insulates; grit does not.</li>
          <li>
            Check each button on continuity: the two legs you wired must read
            open until pressed.
          </li>
        </ol>

        <DocH3>Optics</DocH3>
        <ul>
          <li>
            <strong>Diffuse everything.</strong> Sand the LED domes flat with
            400-grit until they&rsquo;re milky. This is the single highest-value
            thing you can do - it converts four visible point sources into a
            glow, and costs nothing.
          </li>
          <li>
            <strong>Aim at the ceramic, not out the windows.</strong> Point the
            LEDs at the inner wall and let the bounce light the openings. Direct
            line-of-sight to a die looks like an LED; bounced light looks like a
            fire.
          </li>
          <li>
            Put the white flood low and the RGB group higher, so colour washes
            down over a warm base. A ping-pong ball or a twist of baking
            parchment over the flood works as well as any purpose-made diffuser.
          </li>
        </ul>

        <DocH3>Mechanical</DocH3>
        <ul>
          <li>
            Mount the slide switch where you can reach it through the base.
          </li>
          <li>
            <strong>
              Put the two buttons where a hand lands, not where the wiring is
              short.
            </strong>{" "}
            They are the only part of this build anyone but you will touch, so
            they want to be reachable without picking the lantern up or tipping
            it over - the back of the case at hand height beats the underside.
            Give them different shapes or spacing so power and scene are
            distinguishable in the dark; power is the one a stranger will reach
            for, so make it the obvious one. Leave enough slack in the two
            jumpers that the board can still come out of the case with the
            buttons attached.
          </li>
          <li>
            Don&rsquo;t glue the battery holder in - it has to come out to
            recharge.
          </li>
        </ul>

        <DocNote tag="The thing that actually sells it">
          <P>
            Drive the LEDs from the same envelope as the buzzer. A caw with a
            red flare on each syllable, an amber swell on every heartbeat, the
            flood dropping to nothing a half-second before the hinge creaks.
            Sound and light on separate timelines read as two cheap effects;
            locked together they read as one thing that&rsquo;s alive. This is
            worth more than any refinement to either channel alone - and it is
            what <code>scenes.py</code> exists to do.
          </P>
        </DocNote>
      </DocSection>

      {/* ══════════ Reference ══════════ */}

      <DocSection title="Reference">
        <DocH3>Pin map</DocH3>
        <P>
          The RP2040 has eight PWM slices of two channels each - 16 independent
          PWM outputs - and two GPIOs landing on the same slice <em>and</em>{" "}
          channel are forced to the same duty cycle. GP0&ndash;GP12 gives
          thirteen genuinely independent channels: exactly four RGB LEDs plus
          the flood. The buzzer sits on GP16 as a plain digital output, timed in
          software, so it never fights the LEDs over a shared slice frequency.
          This is why the RGB pins cannot be reassigned freely if you rewire.
          The two buttons are inputs and so care about none of this - GP17 and
          GP18 were picked for the GND on pin 23 sitting between them, and to
          leave GP13&ndash;GP15 free.
        </P>

        <DocFigure
          captionLabel="Fig 5"
          caption="The whole 40-pin map on the board, for when the table below is not the thing you want. Pins 1–20 run along one long edge starting at GP0 beside the USB connector, and 21–40 back along the other, so pin 21 (GP16) sits directly opposite pin 20 (GP15)."
        >
          <PicoPinoutPictorial />
        </DocFigure>

        <DocTable>
          <thead>
            <tr>
              <th className="mono">GPIO</th>
              <th className="mono">Pin</th>
              <th className="mono">Slice·Ch</th>
              <th>Function</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">GP0 / GP1 / GP2</td>
              <td className="mono">1 / 2 / 4</td>
              <td className="mono">0A 0B 1A</td>
              <td>LED 1 — red / green / blue</td>
              <td>PWM</td>
            </tr>
            <tr>
              <td className="mono">GP3 / GP4 / GP5</td>
              <td className="mono">5 / 6 / 7</td>
              <td className="mono">1B 2A 2B</td>
              <td>LED 2 — red / green / blue</td>
              <td>PWM</td>
            </tr>
            <tr>
              <td className="mono">GP6 / GP7 / GP8</td>
              <td className="mono">9 / 10 / 11</td>
              <td className="mono">3A 3B 4A</td>
              <td>LED 3 — red / green / blue</td>
              <td>PWM</td>
            </tr>
            <tr>
              <td className="mono">GP9 / GP10 / GP11</td>
              <td className="mono">12 / 14 / 15</td>
              <td className="mono">4B 5A 5B</td>
              <td>LED 4 — red / green / blue</td>
              <td>PWM</td>
            </tr>
            <tr>
              <td className="mono">GP12</td>
              <td className="mono">16</td>
              <td className="mono">6A</td>
              <td>White flood — Q1 base</td>
              <td>PWM</td>
            </tr>
            <tr>
              <td className="mono">GP16</td>
              <td className="mono">21</td>
              <td className="mono">—</td>
              <td>Buzzer — Q2 base</td>
              <td>Digital out</td>
            </tr>
            <tr>
              <td className="mono">GP17</td>
              <td className="mono">22</td>
              <td className="mono">—</td>
              <td>Power button — SW2</td>
              <td>Input, pull-up</td>
            </tr>
            <tr>
              <td className="mono">GP18</td>
              <td className="mono">24</td>
              <td className="mono">—</td>
              <td>Scene button — SW3</td>
              <td>Input, pull-up</td>
            </tr>
            <tr>
              <td className="mono">GP13 / GP14 / GP15</td>
              <td className="mono">17 / 19 / 20</td>
              <td className="mono">6B 7A 7B</td>
              <td>Spare independent PWM</td>
              <td>—</td>
            </tr>
            <tr>
              <td className="mono">VSYS</td>
              <td className="mono">39</td>
              <td className="mono">—</td>
              <td>Cathode of D1</td>
              <td>Power in</td>
            </tr>
            <tr>
              <td className="mono">GND</td>
              <td className="mono">38 · 3 · 8 · 13 · 18 · 23 · 28</td>
              <td className="mono">—</td>
              <td>Common return</td>
              <td>—</td>
            </tr>
          </tbody>
        </DocTable>

        <P>
          GP0 and GP1 are the default UART0 pins. That is harmless here - the
          REPL runs over USB CDC on a separate interface - but if you ever want
          a hardware serial console, move LED 1 to the spare channels and give
          up the flood&rsquo;s independence.
        </P>

        <DocH3>Component values and where they come from</DocH3>

        <DocTable>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Part</th>
              <th className="mono">Value</th>
              <th>Working</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">R1,4,7,10</td>
              <td>Resistor — RGB red anode</td>
              <td className="mono">150 Ω</td>
              <td className="mono">(3.3 − 2.0) / 0.15 kΩ = 8.7 mA</td>
            </tr>
            <tr>
              <td className="mono">R2,3,…</td>
              <td>Resistor — RGB green &amp; blue</td>
              <td className="mono">68 Ω</td>
              <td className="mono">
                worst-case V<sub>f</sub> 2.6 V → 10.3 mA, under the 12 mA pad
                limit
              </td>
            </tr>
            <tr>
              <td className="mono">R13–16</td>
              <td>Resistor — white flood</td>
              <td className="mono">120 Ω</td>
              <td className="mono">
                fresh 19 mA · nominal 12.5 mA · flat 5.8 mA
              </td>
            </tr>
            <tr>
              <td className="mono">R17</td>
              <td>Base resistor — Q1</td>
              <td className="mono">680 Ω</td>
              <td className="mono">
                I<sub>B</sub> 3.7 mA at forced β = 20 for I<sub>C</sub> 77 mA
              </td>
            </tr>
            <tr>
              <td className="mono">R18</td>
              <td>Base resistor — Q2</td>
              <td className="mono">1 kΩ</td>
              <td className="mono">
                I<sub>B</sub> 2.5 mA — hard saturation for a 30 mA load
              </td>
            </tr>
            <tr>
              <td className="mono">D1</td>
              <td>Schottky — pack to VSYS</td>
              <td className="mono">1N5817</td>
              <td className="mono">
                V<sub>f</sub> ≈ 0.32 V at 150 mA
              </td>
            </tr>
            <tr>
              <td className="mono">D2</td>
              <td>Flyback across BZ1</td>
              <td className="mono">1N4148</td>
              <td className="mono">cathode to RAW</td>
            </tr>
          </tbody>
        </DocTable>

        <DocH3>Firmware files</DocH3>

        <DocTable>
          <thead>
            <tr>
              <th>File</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">main.py</td>
              <td>
                Entry point, ambient loop, weighted scene picker, clean
                shutdown. <code>AMBIENT_MIN_MS</code> /{" "}
                <code>AMBIENT_MAX_MS</code> set how long the lantern just burns
                between scenes.
              </td>
            </tr>
            <tr>
              <td className="mono">config.py</td>
              <td>Pin map and tunables. Matches the rev A values above.</td>
            </tr>
            <tr>
              <td className="mono">pads.py</td>
              <td>Sets pad drive strength to 12 mA. See the warning below.</td>
            </tr>
            <tr>
              <td className="mono">leds.py</td>
              <td>
                Gamma table, <code>RgbLed</code>, <code>Flood</code>, and the{" "}
                <code>Flame</code> flicker engine.
              </td>
            </tr>
            <tr>
              <td className="mono">buzzer.py</td>
              <td>
                Gate primitives (<code>pulse</code>, <code>gate</code>,{" "}
                <code>sweep</code>) and the effect library.
              </td>
            </tr>
            <tr>
              <td className="mono">scenes.py</td>
              <td>
                <code>Stage</code>, the decaying <code>Wash</code>, and scenes
                that lock light to sound. <code>scenes.ROTATION</code> sets
                which play and how often - weights are relative, and crickets
                are heaviest on purpose because ambient filler should outnumber
                set pieces. <code>scenes.SEQUENCE</code> is the separate ordered
                list the scene button walks; see the note below.
              </td>
            </tr>
            <tr>
              <td className="mono">buttons.py</td>
              <td>
                <code>Button</code> (one debounced switch, latched from a pin
                interrupt) and <code>Controls</code>, which owns both, runs the
                power button&rsquo;s three-press cycle, and paints each
                press&rsquo;s confirmation colour. It holds the lamps and the
                flood for that reason - the confirmation belongs to the button,
                not to the show, so no scene has to know about it.
              </td>
            </tr>
          </tbody>
        </DocTable>

        <DocNote tag="SEQUENCE and ROTATION are deliberately two lists">
          <P>
            <code>ROTATION</code> is what the ambient loop picks from, with
            weights. <code>SEQUENCE</code> is every scene in order, and it is
            what the scene button walks and what <code>main.demo()</code> plays.
            Deriving the second from the first would look tidier and would be
            wrong: commenting a scene out of the rotation while you tune it is
            the normal state of this file, and the button has to keep reaching
            it. Add a new scene to both.
          </P>
        </DocNote>

        <DocNote kind="warn" tag="Why pads.py exists">
          <P>
            The RP2040 resets every GPIO pad to <strong>4 mA</strong> drive, not
            12 mA, and MicroPython&rsquo;s <code>Pin</code> class doesn&rsquo;t
            expose drive strength. The resistor values above assume 12 mA, so
            without this the LEDs run visibly dimmer than the arithmetic
            predicts and no amount of PWM tuning recovers it.{" "}
            <code>main.build()</code> calls it before configuring any PWM. Bits
            5:4 of each pad&rsquo;s control register select 2 / 4 / 8 / 12 mA:
          </P>
          <CodeBlock language="python" code={PAD_DRIVE} />
          <P>
            Leave GP12 and GP16 alone - they only ever drive transistor bases
            through a resistor, and 4 mA is more than enough for that.
          </P>
        </DocNote>

        <DocH3>Tuning</DocH3>
        <P>
          Everything adjustable lives in <code>config.py</code>. The ones worth
          touching:
        </P>
        <DocTable>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">CHANNEL_TRIM</td>
              <td>
                Per-channel ceiling. Pull red toward <code>0.6</code> if you
                want neutral white; leave at <code>1.0</code> for ember work.
              </td>
            </tr>
            <tr>
              <td className="mono">FLAME_STEP</td>
              <td>
                Flicker speed. Higher is twitchier, lower is a lazier drift.
              </td>
            </tr>
            <tr>
              <td className="mono">FLAME_GUST_CHANCE</td>
              <td>
                1-in-N ticks a lamp dips deep. Lower means a draughtier room.
              </td>
            </tr>
            <tr>
              <td className="mono">FLAME_MIN</td>
              <td>
                Floor brightness. Never take it to 0 - a flame that fully dies
                reads as a fault.
              </td>
            </tr>
            <tr>
              <td className="mono">FLOOD_RATIO</td>
              <td>
                White flood level as eighths of mean flame. Raise for more
                overall light.
              </td>
            </tr>
            <tr>
              <td className="mono">BUTTON_DEBOUNCE_MS</td>
              <td>
                How long after an accepted press further edges are ignored.
                Raise it if a button registers twice; past ~250 ms it starts
                swallowing deliberate double presses.
              </td>
            </tr>
            <tr>
              <td className="mono">
                POWER_ON_RGB
                <br />
                SOUND_ON_RGB
                <br />
                SOUND_OFF_RGB
                <br />
                POWER_OFF_RGB
              </td>
              <td>
                The four confirmation colours. These are drive levels, not
                matched output - red has the most headroom off 3.3 V and reads
                brightest, so if the white confirmation looks pink, pull the red
                term <em>here</em> down toward <code>150</code>. Don&rsquo;t
                reach for <code>CHANNEL_TRIM</code>: the ember colours are tuned
                against it.
              </td>
            </tr>
            <tr>
              <td className="mono">
                CONFIRM_MS
                <br />
                POWER_OFF_CONFIRM_MS
              </td>
              <td>
                How long a confirmation holds - 400 ms for on and sound, 2 s for
                off. The hold is blocking, so raising the first one stalls the
                show by that much on every sound toggle.
              </td>
            </tr>
            <tr>
              <td className="mono">CONFIRM_FLOOD</td>
              <td>
                Flood level behind a confirmation, 0&ndash;255. Full by default
                so a press is unmissable from across a porch.
              </td>
            </tr>
          </tbody>
        </DocTable>

        <DocH3>Troubleshooting</DocH3>
        <DocTable>
          <thead>
            <tr>
              <th>Symptom</th>
              <th>Cause</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nothing happens at all</td>
              <td>
                Board has no MicroPython, or <code>main.py</code> is not in the
                root. <code>mpremote ls</code>.
              </td>
            </tr>
            <tr>
              <td className="mono">permission denied: /dev/ttyACM0</td>
              <td>
                Not in <code>dialout</code>, or you did not log out after adding
                yourself.
              </td>
            </tr>
            <tr>
              <td>LEDs work but are dim</td>
              <td>
                <code>pads.py</code> did not run, or <code>CHANNEL_TRIM</code>{" "}
                is below 1.0.
              </td>
            </tr>
            <tr>
              <td>Green and blue much dimmer than red</td>
              <td>
                Expected. They have ~0.4 V of headroom off 3.3 V — see the
                callout in step 03.
              </td>
            </tr>
            <tr>
              <td>Pico never powers up from battery</td>
              <td>D1 backwards. That is the safe failure mode - flip it.</td>
            </tr>
            <tr>
              <td>Buzzer silent, LEDs fine</td>
              <td>
                Q2 base resistor, or buzzer polarity - active buzzers are
                polarised.
              </td>
            </tr>
            <tr>
              <td>Q1 gets warm</td>
              <td>
                Base resistor too small, or a flood LED&rsquo;s 120 Ω is
                missing.
              </td>
            </tr>
            <tr>
              <td>Board resets when the buzzer fires</td>
              <td>
                Pack sagging under load. Check cell charge and the D1
                connection.
              </td>
            </tr>
            <tr>
              <td>Flicker looks like stepping, not flame</td>
              <td>
                <code>FLAME_STEP</code> too high, or gamma correction bypassed.
              </td>
            </tr>
            <tr>
              <td>A button does nothing at all</td>
              <td>
                Wired to the wrong pin, or its ground leg never reached GND.
                Check with the snippet in step 07 before suspecting the
                firmware.
              </td>
            </tr>
            <tr>
              <td>A button behaves as if permanently held</td>
              <td>
                The switch is a quarter turn out, so its already-connected pair
                is across the circuit. It must straddle the ravine - step 05.
              </td>
            </tr>
            <tr>
              <td>One press fires twice</td>
              <td>
                Contact bounce past the debounce window. Raise{" "}
                <code>BUTTON_DEBOUNCE_MS</code>.
              </td>
            </tr>
            <tr>
              <td>Muting also changes the lights</td>
              <td>
                It shouldn&rsquo;t - mute only gates the carrier. A scene
                driving its lighting from something other than the
                buzzer&rsquo;s callbacks is the bug.
              </td>
            </tr>
            <tr>
              <td>Dead on power-up, but the power button wakes it</td>
              <td>
                Not a fault. It boots asleep on purpose - see step 05. Wire the
                slide switch as the real cut-off.
              </td>
            </tr>
            <tr>
              <td>The white confirmation looks pink</td>
              <td>
                Expected at <code>(255, 255, 255)</code> - red has the most
                headroom of the three. Lower the red term in{" "}
                <code>POWER_ON_RGB</code>, not <code>CHANNEL_TRIM</code>.
              </td>
            </tr>
            <tr>
              <td>It relights for an instant after the purple</td>
              <td>
                A scene handing the flame back on its way out.{" "}
                <code>Stage.release()</code> must check <code>powered()</code>{" "}
                and go dark instead of calling <code>flame.resume()</code>.
              </td>
            </tr>
            <tr>
              <td>Pressing the power button during a scene stacks colours</td>
              <td>
                The confirmation hold is re-entrant. It must sleep with{" "}
                <code>sleep_ms</code>, never the buzzer&rsquo;s{" "}
                <code>rest()</code> - <code>rest()</code> runs the idle
                callback, which calls <code>poll()</code>, which is what is
                already running.
              </td>
            </tr>
          </tbody>
        </DocTable>
      </DocSection>
    </>
  );
}
