"""Pumpkin-house lantern - entry point.

MicroPython runs main.py automatically at boot, so copying this onto the
board is the whole deployment step.

The loop is deliberately mostly quiet: a long stretch of flame with nothing
happening, then one scene, then quiet again. A lantern that performs
constantly stops being atmospheric and starts being a novelty toy.

Bench testing from the REPL, which will not auto-run the loop:

    import main
    stage = main.build()
    main.demo(stage)                    # every scene once, in order
    import scenes; scenes.crow(stage)   # just the one
    stage.all_off()
"""

import urandom
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

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
    return scenes.Stage(lamps, flood, flame, buzz)


def _pool(rotation):
    """Flatten (scene, weight) pairs into a list to pick from uniformly."""
    out = []
    for scene, weight in rotation:
        for _ in range(weight):
            out.append(scene)
    return out


def ambient(stage, ms):
    """Just burn. The flame rate-limits itself, so this stays cheap."""
    end = ticks_add(ticks_ms(), ms)
    while ticks_diff(end, ticks_ms()) > 0:
        stage.flame.tick()
        sleep_ms(5)


def demo(stage, gap_ms=1500):
    """Every scene once, in declaration order. For the bench, not the porch."""
    for scene, _ in scenes.ROTATION:
        print("scene:", scene.__name__)
        scene(stage)
        ambient(stage, gap_ms)


def run(stage, rotation=None):
    pool = _pool(rotation or scenes.ROTATION)
    span = AMBIENT_MAX_MS - AMBIENT_MIN_MS
    stage.flame.tick(force=True)
    while True:
        ambient(stage, AMBIENT_MIN_MS + urandom.getrandbits(16) % span)
        pool[urandom.getrandbits(16) % len(pool)](stage)


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
