import { CodeBlock } from "@repo/ui/core-elements/code-block";
import { Typography } from "@repo/ui/core-elements/typography";
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
  RgbOptionsFigure,
  RgbGroupFigure,
  NpnStagesFigure,
  GateRateFigure,
} from "./pumpkin-house-figures";

/**
 * The Pumpkin House Lantern build sheet.
 *
 * This is the merge of two documents that used to live in
 * `hardware/pumpkin-house/`: the `README.md` (toolchain, flashing, tuning,
 * troubleshooting) and the standalone `schematic.html` (the circuit and the
 * reasoning behind it). The how-to comes first because that is the order you
 * need it in at the bench, and the numbered build sheet follows.
 *
 * Four edits were made in the merge, all forced by putting the two documents on
 * one page:
 *
 * - The README's "To open the schematic" step said to `xdg-open` a file that no
 *   longer exists. It now points down the page.
 * - Its wiring summary said "the full schematic is in schematic.html"; it points
 *   at §05 instead, and its troubleshooting row citing "§2 of the schematic"
 *   now cites §02.
 * - Its "Files" table said `config.py` matches "schematic.html rev A"; it says
 *   "the rev A build sheet below".
 * - Its whole "About the buzzer" section was dropped as a duplicate: §07 covers
 *   the fixed carrier, the three perceptual gate bands (as Fig 5) and the
 *   passive-piezo alternative, in more detail and with the drawing. Nothing in
 *   it was unique to the README.
 *
 * Everything else is the source text, unchanged.
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
      {/* ══════════ Part one: getting it running ══════════ */}

      <DocSection title="Software to install">
        <DocH3>To read the schematic</DocH3>
        <P>
          <strong>Nothing.</strong> It is the second half of this page - every
          figure, resistor value and pin assignment is below, and it follows the
          light/dark theme you have set in the navbar.
        </P>

        <DocH3>To put the code on the board</DocH3>
        <P>
          There is <strong>no compile step</strong>. MicroPython is an
          interpreter running on the Pico; you copy <code>.py</code> files onto
          the board&rsquo;s filesystem and it executes them. Nothing to build,
          no toolchain, no cross-compiler. You need exactly two things:
        </P>
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
          . Pick the one matching what you have:
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

        <P>Take the latest stable release, not a nightly.</P>
        <P>
          <strong>b. A tool to copy files.</strong> Either one works - pick by
          taste:
        </P>
        <CodeBlock language="bash" code={MPREMOTE_INSTALL} />

        <DocH3>Linux serial permissions</DocH3>
        <P>
          The Pico appears as <code>/dev/ttyACM0</code>. On most distros that is
          owned by the <code>dialout</code> group, so add yourself once:
        </P>
        <CodeBlock language="bash" code={DIALOUT} />
        <P>
          Then <strong>log out and back in</strong> - group changes do not apply
          to an existing session. Skipping this produces a &ldquo;permission
          denied&rdquo; on <code>/dev/ttyACM0</code> that looks exactly like a
          broken cable.
        </P>
      </DocSection>

      <DocSection title="Flash MicroPython (once per board)">
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
          You should get a <code>&gt;&gt;&gt;</code> prompt.
        </P>
      </DocSection>

      <DocSection title="Upload the code">
        <P>From the repo root:</P>
        <CodeBlock language="bash" code={UPLOAD} />
        <P>
          The trailing <code>:</code> means &ldquo;the board&rsquo;s filesystem
          root&rdquo;. MicroPython runs <code>main.py</code> automatically at
          boot, so the reset is the whole deployment.
        </P>
        <P>
          <code>mpremote</code> auto-detects a single connected board. With more
          than one plugged in, name it:{" "}
          <code>mpremote connect /dev/ttyACM0 cp ...</code>
        </P>
        <P>
          <strong>In Thonny instead:</strong> set the interpreter to{" "}
          <em>MicroPython (Raspberry Pi Pico)</em> via the bottom-right corner,
          then open each file from <code>src/</code> and use{" "}
          <strong>File → Save as… → Raspberry Pi Pico</strong>, keeping the same
          filename. Files must land in the root, not in a <code>src/</code>{" "}
          folder on the board.
        </P>

        <DocH3>Verify it took</DocH3>
        <CodeBlock language="bash" code={VERIFY} />
        <P>
          Expect <code>main.py</code>, <code>config.py</code>,{" "}
          <code>leds.py</code>, <code>buzzer.py</code>, <code>scenes.py</code>,{" "}
          <code>pads.py</code>.
        </P>
      </DocSection>

      <DocSection title="Testing on the bench">
        <P>
          <code>main.py</code> guards its entry point, so importing it does{" "}
          <strong>not</strong> start the show. Connect with{" "}
          <code>mpremote repl</code> and drive it by hand:
        </P>
        <CodeBlock language="python" code={BENCH_TEST} />
        <P>
          To stop the lantern once it is running the real loop:{" "}
          <code>mpremote repl</code>, then <strong>Ctrl-C</strong>.{" "}
          <code>main()</code> clears the LEDs and silences the buzzer in a{" "}
          <code>finally</code> block, so an interrupt never leaves the buzzer
          screaming.
        </P>
        <P>
          To stop it running at boot at all, rename <code>main.py</code> on the
          board.
        </P>
      </DocSection>

      <DocSection title="Wiring summary">
        <P>
          The full schematic - symbols, resistor arithmetic and the reasoning -
          is the build sheet below, starting at §01. The short version:
        </P>

        <DocTable>
          <thead>
            <tr>
              <th className="mono">GPIO</th>
              <th className="mono">Pin</th>
              <th>Connects to</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">GP0 / GP1 / GP2</td>
              <td className="mono">1 / 2 / 4</td>
              <td>LED 1 anodes - R via 150 Ω, G and B via 68 Ω</td>
            </tr>
            <tr>
              <td className="mono">GP3 / GP4 / GP5</td>
              <td className="mono">5 / 6 / 7</td>
              <td>LED 2, same values</td>
            </tr>
            <tr>
              <td className="mono">GP6 / GP7 / GP8</td>
              <td className="mono">9 / 10 / 11</td>
              <td>LED 3, same values</td>
            </tr>
            <tr>
              <td className="mono">GP9 / GP10 / GP11</td>
              <td className="mono">12 / 14 / 15</td>
              <td>LED 4, same values</td>
            </tr>
            <tr>
              <td className="mono">GP12</td>
              <td className="mono">16</td>
              <td>Q1 base via 680 Ω - white flood string</td>
            </tr>
            <tr>
              <td className="mono">GP16</td>
              <td className="mono">21</td>
              <td>Q2 base via 1 kΩ - CYT1036 buzzer</td>
            </tr>
            <tr>
              <td className="mono">VSYS</td>
              <td className="mono">39</td>
              <td>Cathode of D1 (1N5817) from the battery pack</td>
            </tr>
            <tr>
              <td className="mono">GND</td>
              <td className="mono">38 and others</td>
              <td>Common return, including all four LED cathodes</td>
            </tr>
          </tbody>
        </DocTable>

        <P>Three things that are easy to get wrong:</P>
        <ul>
          <li>
            <strong>D1 is not optional.</strong> 4 × NiMH reads 5.6 V straight
            off the charger and VSYS tops out at 5.5 V. The Schottky&rsquo;s
            0.32 V drop is what makes the pack legal. Banded end toward the
            Pico.
          </li>
          <li>
            <strong>
              The flood and buzzer tap the pack <em>before</em> D1
            </strong>
            , on the raw rail, so they keep the full voltage. Only the Pico pays
            the drop.
          </li>
          <li>
            <strong>
              The RGB anodes go straight to GPIO, not through transistors.
            </strong>{" "}
            With common-cathode LEDs an NPN can only sit on the shared cathode,
            which switches all three colours together and destroys colour
            mixing.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Tuning">
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
          </tbody>
        </DocTable>
        <P>
          In <code>main.py</code>, <code>AMBIENT_MIN_MS</code> /{" "}
          <code>AMBIENT_MAX_MS</code> set how long the lantern just burns
          between scenes, and <code>scenes.ROTATION</code> sets which scenes
          play and how often. Weights are relative; crickets are weighted
          heaviest on purpose, because ambient filler should outnumber set
          pieces.
        </P>
        <P>
          If you rewire, note that the RGB pins cannot be reassigned freely:
          GP0&ndash;GP12 each land on their own PWM slice <strong>and</strong>{" "}
          channel, and two GPIOs sharing both are forced to an identical duty
          cycle. The mapping in <code>config.py</code> is chosen to avoid that.
        </P>
      </DocSection>

      <DocSection title="Files">
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
                shutdown.
              </td>
            </tr>
            <tr>
              <td className="mono">config.py</td>
              <td>
                Pin map and tunables. Matches the rev A build sheet below.
              </td>
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
                that lock light to sound.
              </td>
            </tr>
          </tbody>
        </DocTable>
        <P>
          <strong>
            On <code>pads.py</code>:
          </strong>{" "}
          the RP2040 resets every GPIO pad to 4 mA drive, not 12 mA. The
          resistor values on the build sheet assume 12 mA, so without this the
          LEDs run visibly dimmer than the arithmetic predicts and no amount of
          PWM tuning recovers it. <code>main.build()</code> calls it before
          configuring any PWM.
        </P>
      </DocSection>

      <DocSection title="Troubleshooting">
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
                Expected. They have ~0.4 V of headroom off 3.3 V. See §02.
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
          </tbody>
        </DocTable>
      </DocSection>

      {/* ══════════ Part two: the build sheet ══════════ */}

      <Typography
        as="p"
        variant="none"
        className="hw-eyebrow"
        marginTop={72}
        marginBottom={12}
      >
        The build sheet · rev A
      </Typography>

      <DocSection num="01" title="How many cells">
        <P>
          More cells will not make the LEDs brighter. Brightness is set by{" "}
          <em>current</em> through the die; extra series voltage is simply
          burned off as heat in the ballast resistor. What extra cells buy you
          is <strong>headroom</strong> - and headroom is exactly what your green
          and blue dice are short of.
        </P>
        <P>
          The binding constraint is the Pico:{" "}
          <strong>VSYS accepts 1.8 V &ndash; 5.5 V</strong>, and that ceiling is
          not negotiable.
        </P>

        <DocTable>
          <thead>
            <tr>
              <th>Pack</th>
              <th className="mono">Off charger</th>
              <th className="mono">Nominal</th>
              <th className="mono">End of life</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">3 × NiMH</td>
              <td className="mono">4.20 V</td>
              <td className="mono">3.60 V</td>
              <td className="mono">3.00 V</td>
              <td>Safe, but blue/green starve as it sags</td>
            </tr>
            <tr>
              <td className="mono">4 × NiMH</td>
              <td className="mono">5.60 V</td>
              <td className="mono">4.80 V</td>
              <td className="mono">4.00 V</td>
              <td>
                <span className="bad">5.60 V exceeds VSYS</span> - needs the
                diode below
              </td>
            </tr>
            <tr>
              <td className="mono">4 × NiMH + 1N5817</td>
              <td className="mono">5.28 V</td>
              <td className="mono">4.50 V</td>
              <td className="mono">3.70 V</td>
              <td>
                <span className="ok">Recommended</span> - in spec across the
                whole discharge
              </td>
            </tr>
            <tr>
              <td className="mono">5 × NiMH</td>
              <td className="mono">7.00 V</td>
              <td className="mono">6.00 V</td>
              <td className="mono">5.00 V</td>
              <td>
                <span className="bad">Never</span> - no diode saves this
              </td>
            </tr>
          </tbody>
        </DocTable>

        <P>
          So: <strong>four cells</strong>, with a Schottky diode between the
          pack and VSYS. The diode costs you ~0.32 V, which is precisely what
          pulls the fresh-off-charger 5.6 V back under the ceiling - and it also
          lets you plug in USB for development without the pack fighting the USB
          rail.
        </P>
        <P>
          The trick that makes four cells worth it: the{" "}
          <strong>
            LED and buzzer loads tap the pack <em>before</em> the diode
          </strong>
          , on the raw 4.8 V rail. They get the full voltage and its headroom;
          only the Pico pays the 0.32 V toll.
        </P>

        <DocFigure
          captionLabel="Fig 1"
          caption="The diode is not a formality. Straight off the charger the pack sits at 5.6 V, above the VSYS maximum; the 1N5817's 0.32 V forward drop lands it at 5.28 V. The loads branch upstream of the diode so they keep the full rail."
        >
          <PowerPathFigure />
        </DocFigure>
      </DocSection>

      <DocSection num="02" title="Why the RGB LEDs hang off GPIO">
        <P>
          This is the one place your parts combination forces a decision. A{" "}
          <strong>common-cathode</strong> RGB LED has three separate anodes and
          one shared cathode. An NPN transistor switches on the <em>low</em>{" "}
          side - between the load and ground - so the only place an NPN can sit
          is on that shared cathode. Which means it switches all three colours
          together. You get an on/off lamp, not a colour mixer.
        </P>
        <P>
          Per-colour switching from the 4.8 V rail would need high-side
          switches: a PNP or P-MOSFET per channel, each with its own NPN
          pre-driver to level-shift 3.3 V logic against a 4.8 V emitter. Six
          transistors per LED. Not worth it for a decoration.
        </P>

        <DocFigure
          captionLabel="Fig 2"
          caption="The difference is where the switch can physically sit. An NPN can only interrupt the shared cathode, collapsing three colours into one channel; driving each anode from its own GPIO keeps them separate. The RP2040 sources up to 12 mA per pin, which is enough."
        >
          <RgbOptionsFigure />
        </DocFigure>

        <DocNote tag="The cost of Option B">
          <P>
            GPIO pins output 3.3 V. Red (V<sub>f</sub> ≈ 2.0 V) has plenty of
            headroom; green and blue (V<sub>f</sub> ≈ 3.0&ndash;3.2 V) have
            almost none, so they run at maybe 6 mA and dim noticeably as the
            pack drains. For a jack-o&rsquo;-lantern this barely matters - you
            want amber and ember, which is red at full with a touch of green.
            Blue is a garnish. Save your transistors for the white flood channel
            in §04, which is where the real lumens come from.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="03" title="RGB channel — schematic and values">
        <P>
          One group, repeated four times. Each LED gets its own three resistors
          - never share a resistor across colours or across LEDs, or the
          lowest-V
          <sub>f</sub> die hogs the current and the others go dark.
        </P>

        <DocFigure
          captionLabel="Fig 3"
          caption="One RGB group. Build four of these on GP0–GP11; the pin assignments are in §05. Currents shown are at nominal Vf — real dice vary, and green/blue will read a few mA either side."
        >
          <RgbGroupFigure />
        </DocFigure>

        <DocNote kind="warn" tag="Easy to miss">
          <P>
            The RP2040&rsquo;s pads default to{" "}
            <strong>4 mA drive strength</strong>, not 12 mA. Left alone, your
            LEDs run visibly dimmer than the maths predicts and the calculated
            resistor values will not deliver their currents. Set the drive to 12
            mA on every LED pin at startup - see §06.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="04" title="Flood channel and buzzer — the NPN stages">
        <P>
          Both of these run off the raw pack rail, both are low-side switched,
          and both are what your NPNs are actually good for. The white flood is
          where the brightness lives: a white 5 mm die at 12 mA off 4.8 V puts
          out far more usable light than an RGB die scraping along on 3.3 V, and
          bounced off the inside of the ceramic it reads as a genuine glow
          rather than three visible dots.
        </P>

        <DocFigure
          captionLabel="Fig 4"
          caption="Both stages switch the low side of a load hung off the raw rail. D2 is a flyback clamp: magnetic-type active buzzers contain a coil, and killing the current in one produces a reverse spike that will slowly destroy Q2 without it."
        >
          <NpnStagesFigure />
        </DocFigure>

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
            <tr>
              <td className="mono">Q1</td>
              <td>NPN — flood driver</td>
              <td className="mono">2N2222</td>
              <td className="mono">S8050 equally fine; BC547 is marginal</td>
            </tr>
            <tr>
              <td className="mono">Q2</td>
              <td>NPN — buzzer driver</td>
              <td className="mono">BC547</td>
              <td className="mono">any of the three works here</td>
            </tr>
          </tbody>
        </DocTable>
      </DocSection>

      <DocSection num="05" title="Pin map">
        <P>
          The RP2040 has eight PWM slices of two channels each -{" "}
          <strong>16 independent PWM outputs</strong>, and two GPIOs landing on
          the same slice <em>and</em> channel are forced to the same duty cycle.
          GP0&ndash;GP12 gives thirteen genuinely independent channels, which is
          exactly four RGB LEDs plus the flood. The buzzer sits on GP16 as a
          plain digital output, timed in software, so it never fights the LEDs
          over a shared slice frequency.
        </P>

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
      </DocSection>

      <DocSection num="06" title="Setting pad drive strength">
        <P>
          MicroPython&rsquo;s <code>Pin</code> class doesn&rsquo;t expose drive
          strength, so poke <code>PADS_BANK0</code> directly. Bits 5:4 of each
          pad&rsquo;s control register select 2 / 4 / 8 / 12 mA; the reset value
          is 4 mA.
        </P>
        <CodeBlock language="python" code={PAD_DRIVE} />
        <P>
          Leave GP12 and GP16 alone - they only ever drive transistor bases
          through a resistor, and 4 mA is more than enough for that.
        </P>
      </DocSection>

      <DocSection num="07" title="What the buzzer can actually do">
        <P>
          The CYT1036 is an <strong>active</strong> buzzer: it contains its own
          oscillator, so applying power produces one fixed pitch of roughly 2.3
          kHz and nothing else. You cannot play a melody on it. Feeding it PWM
          does not change the note, because the note isn&rsquo;t yours to
          change.
        </P>
        <P>
          What you <em>do</em> control is the gate - when the carrier is on and
          when it is off. And the rate at which you gate it changes what the ear
          hears categorically, not just gradually. This is the whole design
          space:
        </P>

        <DocFigure
          captionLabel="Fig 5"
          caption="The carrier is fixed at ~2.3 kHz; only the gate is yours. Crossing roughly 20 Hz, gating stops being heard as separate events and starts being heard as tone colour — which is what makes a raspy crow call possible on a one-note device."
        >
          <GateRateFigure />
        </DocFigure>

        <DocH3>Effects worth building</DocH3>

        <DocTable>
          <thead>
            <tr>
              <th>Effect</th>
              <th>Gate pattern</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Crow caw</strong>
              </td>
              <td className="mono">
                sweep 70 → 25 Hz over 260 ms;
                <br />
                repeat ×2, 180 ms apart
              </td>
              <td>
                The descending gate sweep is what sells it. Two calls read as a
                bird; one reads as a malfunction.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Creaking hinge</strong>
              </td>
              <td className="mono">ramp 8 → 40 Hz over 1.4 s</td>
              <td>
                Slow start, accelerating. Pair with a door-shaped light sweep
                across the windows.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Heartbeat</strong>
              </td>
              <td className="mono">
                45 ms on · 120 off ·
                <br />
                35 on · 900 rest
              </td>
              <td>
                The most effective of the lot under a dim amber pulse. Speed it
                up gradually for tension.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Cricket</strong>
              </td>
              <td className="mono">
                3 × (12 ms on, 18 off),
                <br />
                every 2.2 s
              </td>
              <td>
                Convincing out of proportion to its simplicity. Good ambient
                filler between set pieces.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Bat squeaks</strong>
              </td>
              <td className="mono">
                4–6 blips of 8–20 ms,
                <br />
                gaps 100–400 ms, randomised
              </td>
              <td>
                Randomness is the point - anything periodic stops sounding
                alive.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Clock striking twelve</strong>
              </td>
              <td className="mono">
                10 ms tick at 1 Hz, then
                <br />
                12 × 140 ms at 1.2 s
              </td>
              <td>
                Long-form. Run it once an hour and let the ticking carry the
                time between.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Spirit telegraph</strong>
              </td>
              <td className="mono">
                Morse — dot 60 ms,
                <br />
                dash 180 ms, gap 60 ms
              </td>
              <td>
                Spell something. Flash one LED in lockstep with the buzzer and
                it becomes a message.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Addams Family</strong>
              </td>
              <td className="mono">4 beats + 2 short snaps</td>
              <td>
                The closest you get to a tune: that figure is carried entirely
                by rhythm, so a fixed pitch loses nothing.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Shave and a Haircut</strong>
              </td>
              <td className="mono">7 beats, classic timing</td>
              <td>Same principle. Recognisable on one note.</td>
            </tr>
            <tr>
              <td>
                <strong>Ghost swell</strong>
              </td>
              <td className="mono">sweep gate 400 → 1200 Hz</td>
              <td>
                Intermodulation territory. Varies wildly between buzzer units -
                test yours, keep it if it&rsquo;s eerie.
              </td>
            </tr>
          </tbody>
        </DocTable>

        <DocNote tag="The thing that actually sells it">
          <P>
            Drive the LEDs from the same envelope as the buzzer. A caw with a
            red flare on each syllable, an amber swell on every heartbeat, the
            flood dropping to nothing a half-second before the hinge creaks.
            Sound and light on separate timelines read as two cheap effects;
            locked together they read as one thing that&rsquo;s alive. This is
            worth more than any refinement to either channel alone.
          </P>
        </DocNote>

        <P>
          If the fixed pitch starts to feel limiting, a passive piezo disc costs
          about a pound and turns pitch into a variable - real music-box
          melodies, pitch-bent wails, the lot. It wires to a PWM pin through a
          100 Ω resistor and needs no transistor. Your spare GP13 is already
          sitting there.
        </P>
      </DocSection>

      <DocSection num="08" title="Power budget">
        <DocTable>
          <thead>
            <tr>
              <th>Load</th>
              <th className="mono">Average</th>
              <th>Assumption</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pico W, radio deinitialised</td>
              <td className="mono">30 mA</td>
              <td>Non-W Pico is ~22 mA; leaving Wi-Fi up costs 50–70 mA</td>
            </tr>
            <tr>
              <td>4 × RGB, amber flicker</td>
              <td className="mono">32 mA</td>
              <td>Red ~70 % duty, green ~30 %, blue idle</td>
            </tr>
            <tr>
              <td>4 × white flood</td>
              <td className="mono">30 mA</td>
              <td>12.5 mA each at ~60 % PWM</td>
            </tr>
            <tr>
              <td>Buzzer</td>
              <td className="mono">0.6 mA</td>
              <td>30 mA at ~2 % duty over an evening</td>
            </tr>
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td className="mono">
                <strong>≈ 93 mA</strong>
              </td>
              <td>—</td>
            </tr>
          </tbody>
        </DocTable>

        <P>
          On 1900 mAh Eneloop-class cells that&rsquo;s about{" "}
          <strong>20 hours</strong> - several nights of use. If you want more,
          wire a second four-cell pack in <em>parallel</em> with the first (both
          packs through their own diode into the same node) for roughly 40 hours
          at identical brightness. Parallel adds runtime; it never adds light.
        </P>

        <DocNote kind="warn" tag="Use low-self-discharge cells">
          <P>
            Ordinary NiMH loses 15&ndash;20 % in the first day and keeps going.
            Charge a standard pack in early October and it will be flat by the
            31st. Eneloop-type LSD cells hold ~85 % for a year, which is the
            difference between a decoration that works and one you have to
            remember to service.
          </P>
        </DocNote>
      </DocSection>

      <DocSection num="09" title="Build notes">
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
            down over a warm base.
          </li>
          <li>
            A ping-pong ball or a twist of baking parchment over the flood works
            as well as any purpose-made diffuser.
          </li>
        </ul>

        <DocH3>Mechanical</DocH3>
        <ul>
          <li>
            Slide switch in the pack&rsquo;s <strong>negative</strong> lead,
            mounted where you can reach it through the base.
          </li>
          <li>
            Don&rsquo;t glue the battery holder in. A 4×AA holder is roughly 60
            × 58 × 17 mm and needs to come out.
          </li>
          <li>
            Total dissipation is under 1 W across the whole build, so heat
            inside the sealed ceramic is a non-issue.
          </li>
          <li>
            Ceramic is an insulator, but any grit or moisture inside isn&rsquo;t
            - sleeve the pack terminals.
          </li>
        </ul>

        <DocH3>Two alternatives to the power switch</DocH3>
        <ul>
          <li>
            Tying <strong>3V3_EN (pin 37)</strong> to GND shuts the Pico&rsquo;s
            regulator down cleanly and drops it to microamps - but the flood and
            buzzer hang off the raw rail, so they stay live. Only useful
            alongside a rail switch, not instead of one.
          </li>
          <li>
            A PIR sensor on a spare GPIO with the Pico in{" "}
            <code>lightsleep</code> gets you motion-triggered effects and
            stretches the pack across a whole season. Worth doing on version
            two.
          </li>
        </ul>

        <DocH3>Before powering up</DocH3>
        <ol>
          <li>
            Confirm your RGB LEDs really are common cathode: with a multimeter
            in diode mode, the longest leg should be the one that lights all
            three dice when the <em>black</em> probe touches it.
          </li>
          <li>
            Check D1&rsquo;s orientation - banded end toward the Pico. Backwards
            means the Pico simply never powers up; that&rsquo;s the safe
            failure.
          </li>
          <li>
            Measure VSYS with the pack fresh off the charger before trusting
            anything to it. You are looking for a number below 5.5 V.
          </li>
          <li>
            Bring the flood channel up on its own first. If Q1 gets warm, your
            base resistor is too small or a flood resistor is missing.
          </li>
        </ol>
      </DocSection>
    </>
  );
}
