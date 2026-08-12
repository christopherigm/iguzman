"""Pumpkin-house lantern - entry point.

MicroPython runs main.py automatically at boot, so copying this onto the
board is the whole deployment step.

The loop is deliberately mostly quiet: a long stretch of flame with nothing
happening, then one scene, then quiet again. A lantern that performs
constantly stops being atmospheric and starts being a novelty toy.

**It boots asleep.** Power on the pack and nothing lights: the first press of
the power button is what starts the show, the second toggles sound, the
third puts it back to sleep, and each press answers with a colour before it
does anything (white, green or red, purple). Meanwhile the scene button cuts
straight to the next scene in `scenes.SEQUENCE`, and pressing it again during
a scene skips on to the one after. Both buttons are read from `Stage.idle`,
so they work in the middle of an effect and not only between them - see
`buttons.py` for the cycle and why it is positional.

Bench testing from the REPL, which will not auto-run the loop:

    import main
    stage = main.build()
    stage.controls.set_power(True)      # no button to press up here
    main.demo(stage)                    # every scene once, in order
    import scenes; scenes.crow(stage)   # just the one
    stage.buzzer.toggle_mute()          # what press 2 does
    stage.all_off()

Without that `set_power(True)`, a Stage built by hand is asleep - every
effect aborts against `Stage.interrupted()` the moment it starts and the
scenes appear to do nothing at all. `demo()` does it for you.
"""

import urandom
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

import buttons
import buzzer as fx
import config
import leds as light
import pads
import scenes

# How long the lantern simply burns between scenes.
AMBIENT_MIN_MS = 20_000
AMBIENT_MAX_MS = 60_000


def radio_off():
    """Drop the Pico W's radio, which this project never uses and which
    costs ~20 mA of the pack's ~93 mA budget. No-op on a non-W Pico."""
    try:
        import network
    except ImportError:
        return
    try:
        network.WLAN(network.STA_IF).active(False)
        network.WLAN(network.AP_IF).active(False)
    except (AttributeError, OSError):
        pass


def build():
    """Bring up the hardware and return a Stage wired to it."""
    # Must happen before any PWM is configured: pads reset to 4 mA drive and
    # the resistor values on the schematic assume 12 mA.
    pads.set_drive_many(pin for group in config.RGB_PINS for pin in group)

    lamps = [light.RgbLed(group) for group in config.RGB_PINS]
    flood = light.Flood(config.FLOOD_PIN)
    flame = light.Flame(lamps, flood)
    buzz = fx.Buzzer(config.BUZZER_PIN)
    # The lamps and the flood go to Controls as well as to the Stage: the
    # power button paints its own confirmation colour, and it has to be able
    # to do that while a scene owns the idle slot.
    controls = buttons.Controls(buzz, lamps, flood)
    return scenes.Stage(lamps, flood, flame, buzz, controls)


def _pool(rotation):
    """Flatten (scene, weight) pairs into a list to pick from uniformly."""
    out = []
    for scene, weight in rotation:
        for _ in range(weight):
            out.append(scene)
    return out


def ambient(stage, ms):
    """Just burn. The flame rate-limits itself, so this stays cheap.

    `stage.idle()` rather than `stage.flame.tick()` because it also serves
    the buttons, and returns early on a scene-button press so the press plays
    now instead of at the end of a stretch that can run a full minute.
    """
    end = ticks_add(ticks_ms(), ms)
    while ticks_diff(end, ticks_ms()) > 0:
        stage.idle()
        if stage.interrupted():
            return
        sleep_ms(5)


def demo(stage, gap_ms=1500):
    """Every scene once, in declaration order. For the bench, not the porch."""
    if stage.controls is not None:
        # Nobody presses the power button at a REPL, and asleep means every
        # effect aborts the instant it starts.
        stage.controls.set_power(True)
    for scene in scenes.SEQUENCE:
        print("scene:", scene.__name__)
        scene(stage)
        ambient(stage, gap_ms)


def run(stage, rotation=None):
    pool = _pool(rotation or scenes.ROTATION)
    span = AMBIENT_MAX_MS - AMBIENT_MIN_MS
    index = 0
    if stage.powered():
        stage.flame.tick(force=True)
    while True:
        if not stage.powered():
            # Boot lands here, and so does the third press. `standby()`
            # blocks - polling the buttons and nothing else - until the power
            # button comes round to on again.
            stage.standby()
            continue
        ambient(stage, AMBIENT_MIN_MS + urandom.getrandbits(16) % span)
        # `ambient()` also returns early on a power-off, so the state has to
        # be rechecked before anything is allowed to play.
        if not stage.powered():
            continue
        if stage.take_scene_request():
            # The button walks the whole show in order, one press per scene,
            # and is not weighted or shuffled - if you pressed it you want to
            # see the next thing, not another roll of the dice.
            scene = scenes.SEQUENCE[index % len(scenes.SEQUENCE)]
            index += 1
        else:
            scene = pool[urandom.getrandbits(16) % len(pool)]
        scene(stage)


def main():
    radio_off()
    stage = build()
    try:
        run(stage)
    finally:
        # Without this, Ctrl-C at the REPL leaves the buzzer screaming and
        # the LEDs stuck at whatever duty the last scene set.
        stage.all_off()


if __name__ == "__main__":
    main()
