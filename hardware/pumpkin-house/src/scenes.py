"""Scenes: light and sound on a single timeline.

This is the part that matters. Sound and light running on separate
timelines read as two cheap effects; locked to the same envelope they read
as one thing that is alive. Every scene below drives the LEDs from the
buzzer's own event callbacks - the flare happens *because* the caw
happened, not alongside it.

Mechanically: `Stage.idle` is handed to the Buzzer, and the buzzer calls it
in every gap between pulses. Normally it ticks the flame. A scene calls
`take_over()` to borrow that slot for its own animation, and `release()` to
give it back. That same slot is where the front-panel buttons get served,
because it is the only code that keeps running while a scene blocks.

Recorded audio is **not** here. `audio_scenes.py` holds it, and the split is
deliberate: everything below is composed against a buzzer's single fixed
pitch, and a .wav file has nothing to offer that composition. A track is a
scene only in the sense the loop cares about - hand it a Stage, it blocks,
it hands it back - and it leaves the flame burning underneath rather than
taking the idle slot over. `main.show()` is what interleaves the two.
"""

from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

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
        self._floor = [0, 0, 0]
        self._decay = decay
        self._interval = interval_ms
        self._next = ticks_ms()

    def flare(self, r, g, b):
        self._rgb = [r, g, b]
        self._write()

    def glow(self, r, g, b):
        """A resting colour the decay stops at instead of black.

        With a floor set, a flare reads as movement on top of an ambience
        rather than a stab out of darkness - which is what an ambient scene
        wants and a scare does not.
        """
        self._floor = [r, g, b]
        for i in range(3):
            if self._rgb[i] < self._floor[i]:
                self._rgb[i] = self._floor[i]
        self._write()

    def tick(self):
        now = ticks_ms()
        if ticks_diff(now, self._next) < 0:
            return
        self._next = ticks_add(now, self._interval)
        changed = False
        for i in range(3):
            value = self._rgb[i]
            floor = self._floor[i]
            if value > floor:
                self._rgb[i] = max(floor, value - self._decay)
                changed = True
        if changed:
            self._write()

    def off(self):
        self._rgb = [0, 0, 0]
        self._floor = [0, 0, 0]
        self._write()

    def _write(self):
        r, g, b = self._rgb
        for lamp in self._lamps:
            lamp.set(r, g, b)


class Stage:
    """Everything a scene needs, plus ownership of the idle slot."""

    def __init__(self, lamps, flood, flame, bz, controls=None, speaker=None):
        self.lamps = lamps
        self.flood = flood
        self.flame = flame
        self.buzzer = bz
        # None on a build with no amplifier fitted. `audio_scenes` is the
        # only thing that reads it, and it checks - nothing in this file
        # needs a speaker, because a buzzer scene is composed against a
        # fixed pitch and has nothing to say to a recording.
        self.speaker = speaker
        self.controls = controls
        self.wash = Wash(lamps)
        self._idle_fn = flame.tick
        bz.set_idle(self.idle)
        if speaker is not None:
            # The same two hooks, for the same two reasons: a thirty-second
            # recording is far longer than any buzzer effect, so without
            # these the flame would freeze and the buttons would go dead for
            # the whole of it.
            speaker.set_idle(self.idle)
        if controls is not None:
            bz.set_abort(self.interrupted)
            if speaker is not None:
                speaker.set_abort(self.interrupted)

    def idle(self):
        """The one callback that runs whatever is currently blocking.

        Which is exactly why the buttons are served from here: an effect can
        hold the CPU for seconds, and this is the only slot that keeps
        getting a turn while it does.
        """
        if self.controls is not None:
            self.controls.poll()
        self._idle_fn()

    # -- the buttons -----------------------------------------------------

    def interrupted(self):
        """True while a press is still waiting to change what is playing.

        The buzzer polls this and returns early from its blocking calls, so
        the running scene unwinds through its own `release()` rather than
        being killed - the wash gets cleared and the flame handed back
        exactly as it would at a natural end.

        The power button counts as well as the scene button. Its off leg has
        already darkened the lantern by the time this reads False for power,
        and a scene left running under that would keep making noise into a
        dark house - the one thing someone reaching for that button is
        definitely trying to stop.
        """
        if self.controls is None:
            return False
        return not self.controls.powered() or self.controls.scene_requested()

    def take_scene_request(self):
        """Consume a pending press. True if there was one."""
        return self.controls is not None and self.controls.take_scene_request()

    def powered(self):
        """False while the lantern is asleep. True whenever there are no
        controls at all, so a Stage built by hand at the REPL still runs."""
        return self.controls is None or self.controls.powered()

    def standby(self):
        """Sit dark and silent until the power button brings it back.

        The show is switched off once, here, rather than left to whichever
        scene got interrupted: a scene unwinds through `release()`, and
        release hands the flame straight back. So this pauses the flame
        first and only resumes it on the way out, after the white
        confirmation the button itself has already shown.
        """
        self.flame.pause()
        self.all_off()
        while not self.powered():
            self.idle()
            sleep_ms(20)
        # Presses made while it was asleep are not a queue of scenes to catch
        # up on - somebody was prodding a dark lantern to see if it did
        # anything.
        self.take_scene_request()
        self.flame.resume()
        self.flame.tick(force=True)

    def take_over(self, fn):
        """Borrow the idle slot for a scene's own animation."""
        self.flame.pause()
        self._idle_fn = fn

    def release(self):
        """Hand it back to the flame and clear whatever the scene left."""
        self._idle_fn = self.flame.tick
        self.wash.off()
        if not self.powered():
            # Cut short by the power button. Handing the flame back here
            # would relight the lantern for the moment it takes `main.run`
            # to notice, which reads as a fault rather than an off switch.
            self.all_off()
            return
        self.flame.resume()
        self.flame.tick(force=True)

    def all_off(self):
        for lamp in self.lamps:
            lamp.off()
        self.flood.off()
        self.buzzer.off()
        if self.speaker is not None:
            self.speaker.off()


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
    """Ambient filler, in the green of a lawn after dark.

    The wash rests on a low green instead of black and each chirp pushes a
    brighter green on top of it, so the light only ever moves as far as the
    sound does. The flood stays low rather than off - white desaturates the
    green, but killing it entirely would turn the most-played scene in the
    rotation into a blackout.
    """
    stage.take_over(stage.wash.tick)
    stage.flood.set(100)
    stage.wash.glow(6, 45, 14)
    fx.cricket(
        stage.buzzer,
        chirps=3,
        reps=3,
        on_chirp=lambda: stage.wash.flare(30, 200, 60),
    )
    stage.buzzer.rest(300)
    stage.release()


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


# Every scene, in order, for the scene button and for main.demo(). This is
# deliberately a separate list from ROTATION below rather than derived from
# it: the button is how you walk the whole show at the bench or on the
# doorstep, and it has to reach a scene that is currently commented out of
# the random rotation - which is the normal state while you are tuning one.
#
# **Everything is commented out on purpose.** This lantern is currently the
# candle and the speaker: `leds.Flame` burns continuously and the track
# button walks `AUDIO_DIR`, and nothing above takes the idle slot away from
# the flame. The scenes are kept in full - they are composed against the
# buzzer's fixed pitch and they still work - so putting one back is
# uncommenting a line here, and putting the whole set back is uncommenting
# all of them plus `config.BUZZER_ENABLED`.
SEQUENCE = (
    # crow,
    # pulse_of_the_house,
    # the_hinge,
    # night_crickets,
    # bat_flit,
    # witching_hour,
    # seance,
    # ballroom,
    # haunting,
)

# Scenes the ambient loop picks from, with relative weight. Crickets are
# heavier because ambient filler should outnumber set pieces - a lantern
# that performs constantly stops being atmospheric.
ROTATION = (
    # (night_crickets, 5),
    # (crow, 3),
    # (bat_flit, 3),
    # (pulse_of_the_house, 2),
    # (the_hinge, 2),
    # (ballroom, 2),
    # (seance, 1),
    # (haunting, 1),
)
