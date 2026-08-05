"""Scenes: light and sound on a single timeline.

This is the part that matters. Sound and light running on separate
timelines read as two cheap effects; locked to the same envelope they read
as one thing that is alive. Every scene below drives the LEDs from the
buzzer's own event callbacks - the flare happens *because* the caw
happened, not alongside it.

Mechanically: `Stage.idle` is handed to the Buzzer, and the buzzer calls it
in every gap between pulses. Normally it ticks the flame. A scene calls
`take_over()` to borrow that slot for its own animation, and `release()` to
give it back.
"""

from time import ticks_add, ticks_diff, ticks_ms

import buzzer as fx
import leds as light


class Wash:
    """A colour across the whole group that decays toward black.

    Scenes flare it on an event and let it fall away in the buzzer's idle
    gaps, which is what gives a flash a tail instead of a hard edge.
    """

    def __init__(self, lamps, decay=10, interval_ms=16):
        self._lamps = lamps
        self._rgb = [0, 0, 0]
        self._decay = decay
        self._interval = interval_ms
        self._next = ticks_ms()

    def flare(self, r, g, b):
        self._rgb = [r, g, b]
        self._write()

    def tick(self):
        now = ticks_ms()
        if ticks_diff(now, self._next) < 0:
            return
        self._next = ticks_add(now, self._interval)
        changed = False
        for i in range(3):
            value = self._rgb[i]
            if value:
                self._rgb[i] = max(0, value - self._decay)
                changed = True
        if changed:
            self._write()

    def off(self):
        self._rgb = [0, 0, 0]
        self._write()

    def _write(self):
        r, g, b = self._rgb
        for lamp in self._lamps:
            lamp.set(r, g, b)


class Stage:
    """Everything a scene needs, plus ownership of the idle slot."""

    def __init__(self, lamps, flood, flame, bz):
        self.lamps = lamps
        self.flood = flood
        self.flame = flame
        self.buzzer = bz
        self.wash = Wash(lamps)
        self._idle_fn = flame.tick
        bz.set_idle(self.idle)

    def idle(self):
        self._idle_fn()

    def take_over(self, fn):
        """Borrow the idle slot for a scene's own animation."""
        self.flame.pause()
        self._idle_fn = fn

    def release(self):
        """Hand it back to the flame and clear whatever the scene left."""
        self._idle_fn = self.flame.tick
        self.wash.off()
        self.flame.resume()
        self.flame.tick(force=True)

    def all_off(self):
        for lamp in self.lamps:
            lamp.off()
        self.flood.off()
        self.buzzer.off()


# =========================================================================
# Scenes. Each takes a Stage and blocks for its duration.
# =========================================================================


def crow(stage):
    """A bird on the roof. The flood drops away and each caw throws a red
    flare that decays across the call."""
    stage.take_over(stage.wash.tick)
    stage.flood.set(0)
    fx.caw(stage.buzzer, calls=2, on_call=lambda: stage.wash.flare(255, 45, 0))
    stage.buzzer.rest(700)
    stage.release()


def pulse_of_the_house(stage):
    """Something inside is alive, and it is speeding up."""
    stage.take_over(stage.wash.tick)

    def beat(strong):
        if strong:
            stage.wash.flare(255, 75, 0)
            stage.flood.set(110)
        else:
            stage.wash.flare(150, 40, 0)
            stage.flood.set(45)

    fx.heartbeat(stage.buzzer, beats=9, on_beat=beat)
    stage.release()


def the_hinge(stage):
    """A door swinging open: a bright spot walks across the windows at
    exactly the rate the hinge is turning."""
    duration_ms = 1400
    span = max(1, len(stage.lamps) - 1)
    start = ticks_ms()

    def walk():
        elapsed = ticks_diff(ticks_ms(), start)
        frac = elapsed / duration_ms
        if frac > 1.0:
            frac = 1.0
        position = frac * span
        for i, lamp in enumerate(stage.lamps):
            distance = position - i
            if distance < 0:
                distance = -distance
            level = int(255 * (1.0 - distance)) if distance < 1.0 else 0
            lamp.set(*light.ember(level))

    stage.take_over(walk)
    stage.flood.set(0)
    fx.hinge(stage.buzzer)
    stage.buzzer.rest(500)
    stage.release()


def night_crickets(stage):
    """Ambient filler. The flame carries on untouched - only the sound
    changes, which is what makes it read as background rather than an
    event."""
    fx.cricket(stage.buzzer, chirps=3, reps=3)


def bat_flit(stage):
    """Darkness with squeaks. Each squeak snaps the group cold for an
    instant, so the colour temperature itself is the scare."""
    stage.take_over(stage.wash.tick)
    stage.flood.set(0)
    fx.bats(stage.buzzer, on_squeak=lambda: stage.wash.flare(100, 100, 150))
    stage.buzzer.rest(400)
    stage.release()


def witching_hour(stage, hour=12):
    """Long form. Ticking under a low ember, then twelve strikes that each
    knock the flood sideways."""
    stage.take_over(stage.wash.tick)
    stage.flood.set(55)

    def on_tick():
        stage.wash.flare(70, 20, 0)

    def on_strike(n):
        stage.wash.flare(255, 115, 25)
        stage.flood.set(150 if n % 2 else 35)

    fx.clock_strike(
        stage.buzzer, hour=hour, ticks=6, on_tick=on_tick, on_strike=on_strike
    )
    stage.release()


def seance(stage, message="BOO"):
    """A message. One flash per Morse element, in lockstep with the buzzer -
    this is what turns beeping into something that looks intentional."""
    stage.take_over(stage.wash.tick)
    stage.flood.set(0)

    def symbol(is_dash):
        if is_dash:
            stage.wash.flare(210, 210, 235)
        else:
            stage.wash.flare(140, 140, 170)

    fx.morse(stage.buzzer, message, on_symbol=symbol)
    stage.buzzer.rest(600)
    stage.release()


def ballroom(stage):
    """The Addams figure. Warm on the phrase, cold on the two snaps."""
    stage.take_over(stage.wash.tick)

    def note(index):
        if index < 4:
            stage.wash.flare(255, 95, 20)
            stage.flood.set(120)
        else:
            stage.wash.flare(120, 120, 200)
            stage.flood.set(30)

    fx.addams(stage.buzzer, on_note=note)
    stage.buzzer.rest(500)
    stage.release()


def haunting(stage):
    """The intermodulation sweep, with the light draining out under it.

    Worth testing on your own buzzer before you leave this in the rotation -
    the effect varies a lot between units.
    """
    stage.take_over(stage.wash.tick)
    stage.flood.set(0)
    stage.wash.flare(90, 60, 130)
    fx.ghost_swell(stage.buzzer)
    stage.buzzer.rest(700)
    stage.release()


# Scenes the ambient loop picks from, with relative weight. Crickets are
# heavier because ambient filler should outnumber set pieces - a lantern
# that performs constantly stops being atmospheric.
ROTATION = (
    (night_crickets, 5),
    (crow, 3),
    (bat_flit, 3),
    (pulse_of_the_house, 2),
    (the_hinge, 2),
    (ballroom, 2),
    (seance, 1),
    (haunting, 1),
)
