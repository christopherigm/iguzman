# Pumpkin House Lantern

A hollow ceramic pumpkin-house decoration (⌀120 × 110 mm) lit from inside by
a Raspberry Pi Pico: four common-cathode RGB LEDs running a candle-flicker
engine, a white flood string for raw brightness, and a fixed-pitch active
buzzer that gets its expression from rhythm rather than pitch.

Runs on 4 × NiMH AA for roughly 20 hours.

---

## 1. Software to install

### To open the schematic

**Nothing.** `schematic.html` is a standalone file — open it in any browser:

```bash
xdg-open hardware/pumpkin-house/schematic.html
```

It has no external dependencies, follows your system light/dark theme, and
prints cleanly if you want it on the bench.

### To put the code on the board

There is **no compile step**. MicroPython is an interpreter running on the
Pico; you copy `.py` files onto the board's filesystem and it executes them.
Nothing to build, no toolchain, no cross-compiler. You need exactly two
things:

**a. MicroPython firmware** — a `.uf2` file for your specific board, from
[micropython.org/download](https://micropython.org/download/). Pick the one
matching what you have:

| Board            | Download page                                     |
| ---------------- | ------------------------------------------------- |
| Pico             | <https://micropython.org/download/RPI_PICO/>      |
| Pico W           | <https://micropython.org/download/RPI_PICO_W/>    |
| Pico 2           | <https://micropython.org/download/RPI_PICO2/>     |
| Pico 2 W         | <https://micropython.org/download/RPI_PICO2_W/>   |

Take the latest stable release, not a nightly.

**b. A tool to copy files.** Either one works — pick by taste:

```bash
# CLI — what the commands below assume
pipx install mpremote          # or: pip install --user mpremote

# GUI — friendlier if you want to poke at things interactively
pipx install thonny            # or apt / flatpak / thonny.org
```

### Linux serial permissions

The Pico appears as `/dev/ttyACM0`. On most distros that is owned by the
`dialout` group, so add yourself once:

```bash
sudo usermod -aG dialout $USER
```

Then **log out and back in** — group changes do not apply to an existing
session. Skipping this produces a "permission denied" on `/dev/ttyACM0`
that looks exactly like a broken cable.

---

## 2. Flash MicroPython (once per board)

1. Unplug the Pico.
2. Hold **BOOTSEL** and plug the USB cable back in. Release BOOTSEL.
3. It mounts as a USB drive called `RPI-RP2`.
4. Drag the `.uf2` onto it. The board reboots on its own and the drive
   disappears — that is success, not an error.

Confirm you have a working interpreter:

```bash
mpremote                    # opens the REPL; Ctrl-] to exit
```

You should get a `>>>` prompt.

---

## 3. Upload the code

From the repo root:

```bash
mpremote cp hardware/pumpkin-house/src/*.py :
mpremote reset
```

The trailing `:` means "the board's filesystem root". MicroPython runs
`main.py` automatically at boot, so the reset is the whole deployment.

`mpremote` auto-detects a single connected board. With more than one
plugged in, name it: `mpremote connect /dev/ttyACM0 cp ...`

**In Thonny instead:** set the interpreter to *MicroPython (Raspberry Pi
Pico)* via the bottom-right corner, then open each file from `src/` and use
**File → Save as… → Raspberry Pi Pico**, keeping the same filename. Files
must land in the root, not in a `src/` folder on the board.

### Verify it took

```bash
mpremote ls
```

Expect `main.py`, `config.py`, `leds.py`, `buzzer.py`, `scenes.py`, `pads.py`.

---

## 4. Testing on the bench

`main.py` guards its entry point, so importing it does **not** start the
show. Connect with `mpremote repl` and drive it by hand:

```python
import main
stage = main.build()

main.demo(stage)                # every scene once, in order

import scenes
scenes.crow(stage)              # a single scene
scenes.witching_hour(stage)     # long form, not in the random rotation
scenes.seance(stage, "HELLO")

import buzzer as fx             # a bare effect, no lighting
fx.caw(stage.buzzer)
fx.ghost_swell(stage.buzzer)    # test this one — it varies between units

stage.all_off()
```

To stop the lantern once it is running the real loop: `mpremote repl`, then
**Ctrl-C**. `main()` clears the LEDs and silences the buzzer in a `finally`
block, so an interrupt never leaves the buzzer screaming.

To stop it running at boot at all, rename `main.py` on the board.

---

## 5. Wiring summary

Full schematic with symbols, resistor arithmetic and the reasoning is in
**`schematic.html`**. The short version:

| GPIO                | Pin              | Connects to                                      |
| ------------------- | ---------------- | ------------------------------------------------ |
| GP0 / GP1 / GP2     | 1 / 2 / 4        | LED 1 anodes — R via 150 Ω, G and B via 68 Ω     |
| GP3 / GP4 / GP5     | 5 / 6 / 7        | LED 2, same values                               |
| GP6 / GP7 / GP8     | 9 / 10 / 11      | LED 3, same values                               |
| GP9 / GP10 / GP11   | 12 / 14 / 15     | LED 4, same values                               |
| GP12                | 16               | Q1 base via 680 Ω — white flood string           |
| GP16                | 21               | Q2 base via 1 kΩ — CYT1036 buzzer                |
| VSYS                | 39               | Cathode of D1 (1N5817) from the battery pack     |
| GND                 | 38 and others    | Common return, including all four LED cathodes   |

Three things that are easy to get wrong:

- **D1 is not optional.** 4 × NiMH reads 5.6 V straight off the charger and
  VSYS tops out at 5.5 V. The Schottky's 0.32 V drop is what makes the pack
  legal. Banded end toward the Pico.
- **The flood and buzzer tap the pack _before_ D1**, on the raw rail, so
  they keep the full voltage. Only the Pico pays the drop.
- **The RGB anodes go straight to GPIO, not through transistors.** With
  common-cathode LEDs an NPN can only sit on the shared cathode, which
  switches all three colours together and destroys colour mixing.

---

## 6. Tuning

Everything adjustable lives in `config.py`. The ones worth touching:

| Setting                 | Effect                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| `CHANNEL_TRIM`          | Per-channel ceiling. Pull red toward `0.6` if you want neutral white; leave at `1.0` for ember work. |
| `FLAME_STEP`            | Flicker speed. Higher is twitchier, lower is a lazier drift.               |
| `FLAME_GUST_CHANCE`     | 1-in-N ticks a lamp dips deep. Lower means a draughtier room.              |
| `FLAME_MIN`             | Floor brightness. Never take it to 0 — a flame that fully dies reads as a fault. |
| `FLOOD_RATIO`           | White flood level as eighths of mean flame. Raise for more overall light.  |

In `main.py`, `AMBIENT_MIN_MS` / `AMBIENT_MAX_MS` set how long the lantern
just burns between scenes, and `scenes.ROTATION` sets which scenes play and
how often. Weights are relative; crickets are weighted heaviest on purpose,
because ambient filler should outnumber set pieces.

If you rewire, note that the RGB pins cannot be reassigned freely: GP0–GP12
each land on their own PWM slice **and** channel, and two GPIOs sharing both
are forced to an identical duty cycle. The mapping in `config.py` is chosen
to avoid that.

---

## 7. Files

| File           | Role                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `main.py`      | Entry point, ambient loop, weighted scene picker, clean shutdown.          |
| `config.py`    | Pin map and tunables. Matches `schematic.html` rev A.                      |
| `pads.py`      | Sets pad drive strength to 12 mA. See the warning below.                   |
| `leds.py`      | Gamma table, `RgbLed`, `Flood`, and the `Flame` flicker engine.            |
| `buzzer.py`    | Gate primitives (`pulse`, `gate`, `sweep`) and the effect library.         |
| `scenes.py`    | `Stage`, the decaying `Wash`, and scenes that lock light to sound.         |

**On `pads.py`:** the RP2040 resets every GPIO pad to 4 mA drive, not 12 mA.
The resistor values on the schematic assume 12 mA, so without this the LEDs
run visibly dimmer than the arithmetic predicts and no amount of PWM tuning
recovers it. `main.build()` calls it before configuring any PWM.

---

## 8. About the buzzer

The CYT1036 is an **active** buzzer — it contains its own oscillator, so
powering it produces roughly 2.3 kHz and nothing else. It cannot play a
melody, and feeding it PWM does not change the pitch.

What you control is the *gate*, and gate rate crosses perceptual boundaries
rather than varying smoothly:

- **below ~20 Hz** — pulses are heard individually → rhythm, ticks, Morse
- **20–120 Hz** — pulses fuse and AM sidebands form → roughness, timbre
- **near 2.3 kHz** — the gate beats against the carrier → intermodulation

That middle band is why a crow call works on a one-note device: a gate
sweeping downward through it reads as a falling, raspy caw. Every effect in
`buzzer.py` is built from that idea.

If the fixed pitch starts to feel limiting, a **passive** piezo disc costs
about a pound and makes pitch a variable — real music-box melodies and
pitch-bent wails. It wires to a PWM pin through a 100 Ω resistor and needs
no transistor. `GP13`, `GP14` and `GP15` are free and each on their own PWM
slice.

---

## 9. Troubleshooting

| Symptom                                      | Cause                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Nothing happens at all                       | Board has no MicroPython, or `main.py` is not in the root. `mpremote ls`. |
| `permission denied: /dev/ttyACM0`            | Not in `dialout`, or you did not log out after adding yourself.       |
| LEDs work but are dim                        | `pads.py` did not run, or `CHANNEL_TRIM` is below 1.0.                |
| Green and blue much dimmer than red          | Expected. They have ~0.4 V of headroom off 3.3 V. See §2 of the schematic. |
| Pico never powers up from battery            | D1 backwards. That is the safe failure mode — flip it.                |
| Buzzer silent, LEDs fine                     | Q2 base resistor, or buzzer polarity — active buzzers are polarised.  |
| Q1 gets warm                                 | Base resistor too small, or a flood LED's 120 Ω is missing.           |
| Board resets when the buzzer fires           | Pack sagging under load. Check cell charge and the D1 connection.     |
| Flicker looks like stepping, not flame       | `FLAME_STEP` too high, or gamma correction bypassed.                  |
