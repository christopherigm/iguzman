"""Sound: effects for a fixed-pitch active buzzer (CYT1036).

The CYT1036 contains its own oscillator. Powering it produces roughly
2.3 kHz and nothing else - there is no note to choose, and feeding it PWM
does not change the pitch. The only variable you own is the *gate*: when
the carrier is on and when it is off.

Gate rate is what carries the expression, and it crosses perceptual
boundaries rather than varying smoothly:

    below ~20 Hz    pulses are heard individually  -> rhythm
    20 - 120 Hz     pulses fuse, AM sidebands form -> roughness, timbre
    near 2.3 kHz    gate beats against the carrier -> intermodulation

That middle band is why a crow call is possible on a one-note device: a
gate sweeping downward through it reads as a falling, raspy caw.

Every effect below is built from three primitives - pulse(), gate() and
sweep(). The `idle` callback passed to Buzzer is invoked in the gaps so the
flame keeps animating while an effect plays; without it the lantern freezes
solid every time it makes a noise.

Two things reach in from the outside, both driven by the front-panel buttons
in `buttons.py`: `mute()` gates the carrier without altering a single
duration, and `set_abort()` installs a predicate that lets the blocking
primitives give up early. Neither is checked in the tight switching loops,
so the timing that carries the timbre is unaffected by either.
"""

from machine import Pin
from time import sleep_ms, sleep_us, ticks_add, ticks_diff, ticks_ms

# Gate periods longer than this get an idle() call between cycles. Shorter
# than this and the callback's own runtime would audibly jitter the gate.
_IDLE_THRESHOLD_US = 20_000


class Buzzer:
    def __init__(self, pin, idle=None, rng=None):
        import urandom

        self._pin = Pin(pin, Pin.OUT, value=0)
        self._idle = idle if idle is not None else _noop
        self._rng = rng or urandom
        self._muted = False
        self._abort = None

    # -- primitives ------------------------------------------------------

    def off(self):
        self._pin.value(0)

    def set_idle(self, fn):
        """Swap what runs in the gaps. Scenes use this to drive their own
        lighting off the same timeline the sound is on."""
        self._idle = fn if fn is not None else _noop

    # -- mute ------------------------------------------------------------
    #
    # Muting gates the carrier and nothing else: every effect still runs for
    # its full length, so the lighting a scene drives off its callbacks is
    # untouched. That is deliberate - the second press of the power button is
    # for a quiet house, not for a different show, and a lantern whose
    # animation changed when you silenced it would look broken rather than
    # considerate. Going properly dark is the third press, not this.
    #
    # `_muted` is also the only thing that survives an off-and-on: there is
    # one sound toggle per cycle of the power button, so resetting it here
    # would make a silenced lantern noisy again every time it woke up.

    def mute(self, on=True):
        self._muted = bool(on)
        if self._muted:
            self._pin.value(0)  # drop mid-pulse rather than at the next gap

    def toggle_mute(self):
        self.mute(not self._muted)
        if not self._muted:
            # Unmuting blips; muting is self-evident. Without this a press
            # during a quiet ambient stretch gives no sign it registered.
            self.pulse(40)
        return self._muted

    def is_muted(self):
        return self._muted

    # -- interruption ----------------------------------------------------

    def set_abort(self, fn):
        """A predicate the blocking primitives check, so an effect can be cut
        short from outside. `scenes` wires this to the scene button.

        It is only tested where `idle()` already runs - the gaps, and gate
        periods long enough to afford a callback - so the tight switching
        loops that carry the timbre keep their timing exactly.
        """
        self._abort = fn

    def aborting(self):
        return self._abort is not None and self._abort()

    def pulse(self, on_ms, off_ms=0):
        """One flat blip of carrier."""
        if self.aborting():
            return
        self._pin.value(0 if self._muted else 1)
        sleep_ms(on_ms)
        self._pin.value(0)
        if off_ms:
            self.rest(off_ms)

    def rest(self, ms):
        """Silence, sliced so the flame keeps moving through it."""
        end = ticks_add(ticks_ms(), ms)
        while True:
            remaining = ticks_diff(end, ticks_ms())
            if remaining <= 0:
                return
            self._idle()
            if self.aborting():
                return
            sleep_ms(remaining if remaining < 8 else 8)

    def gate(self, rate_hz, duration_ms, duty=0.5):
        """Chop the carrier at a fixed rate."""
        if rate_hz <= 0:
            return self.rest(duration_ms)
        period_us = int(1_000_000 / rate_hz)
        on_us = int(period_us * duty)
        off_us = period_us - on_us
        end = ticks_add(ticks_ms(), duration_ms)
        allow_idle = period_us > _IDLE_THRESHOLD_US
        while ticks_diff(end, ticks_ms()) > 0:
            self._pin.value(0 if self._muted else 1)
            sleep_us(on_us)
            self._pin.value(0)
            sleep_us(off_us)
            if allow_idle:
                self._idle()
                if self.aborting():
                    break
        self._pin.value(0)

    def sweep(self, from_hz, to_hz, duration_ms, duty=0.5):
        """Chop the carrier at a rate that slides from one value to another.

        This is the workhorse. A downward sweep through the roughness band
        is a caw; a slow upward sweep from below it is a hinge starting to
        turn; a sweep near the carrier is a ghost.
        """
        if duration_ms <= 0:
            return
        start = ticks_ms()
        span = to_hz - from_hz
        while True:
            elapsed = ticks_diff(ticks_ms(), start)
            if elapsed >= duration_ms:
                break
            rate = from_hz + span * (elapsed / duration_ms)
            if rate <= 0:
                break
            period_us = int(1_000_000 / rate)
            on_us = int(period_us * duty)
            self._pin.value(0 if self._muted else 1)
            sleep_us(on_us)
            self._pin.value(0)
            sleep_us(period_us - on_us)
            if period_us > _IDLE_THRESHOLD_US:
                self._idle()
                if self.aborting():
                    break
        self._pin.value(0)

    # -- randomness ------------------------------------------------------

    def _rand(self, lo, hi):
        """Inclusive-low, exclusive-high integer in [lo, hi)."""
        if hi <= lo:
            return lo
        return lo + self._rng.getrandbits(16) % (hi - lo)


def _noop():
    pass


# =========================================================================
# Effects. Each takes a Buzzer and blocks for its duration.
# =========================================================================


def caw(bz, calls=2, on_call=None):
    """Crow. The descending gate sweep is what sells it.

    Two calls read as a bird; one reads as a malfunction.
    """
    for i in range(calls):
        if on_call:
            on_call()
        bz.sweep(70, 25, 260)
        if i != calls - 1:
            bz.rest(180)


def hinge(bz):
    """A door swinging open on a dry hinge: slow start, accelerating."""
    bz.sweep(8, 40, 1400, duty=0.35)


def heartbeat(bz, beats=6, start_bpm=54, end_bpm=96, on_beat=None):
    """Lub-dub, accelerating. The most effective of the lot under a
    dim amber pulse - tension comes from the tempo change, not the sound."""
    for i in range(beats):
        frac = i / max(1, beats - 1)
        bpm = start_bpm + (end_bpm - start_bpm) * frac
        cycle_ms = int(60_000 / bpm)
        if on_beat:
            on_beat(True)
        bz.pulse(45)
        bz.rest(120)
        if on_beat:
            on_beat(False)
        bz.pulse(35)
        bz.rest(max(80, cycle_ms - 200))


def cricket(bz, chirps=3, reps=1, on_chirp=None):
    """Convincing out of all proportion to its complexity. Good ambient
    filler between the set pieces."""
    for _ in range(reps):
        for _ in range(chirps):
            if on_chirp:
                on_chirp()
            bz.pulse(12)
            bz.rest(18)
        bz.rest(2200)


def bats(bz, squeaks=None, on_squeak=None):
    """Randomness is the point. Anything periodic stops sounding alive."""
    if squeaks is None:
        squeaks = bz._rand(4, 7)
    for _ in range(squeaks):
        if on_squeak:
            on_squeak()
        bz.pulse(bz._rand(8, 21))
        bz.rest(bz._rand(100, 401))


def clock_strike(bz, hour=12, ticks=8, on_tick=None, on_strike=None):
    """Long form. Run it once an hour and let the ticking carry the time
    in between."""
    for _ in range(ticks):
        if on_tick:
            on_tick()
        bz.pulse(10)
        bz.rest(990)
    for i in range(hour):
        if on_strike:
            on_strike(i + 1)
        bz.pulse(140)
        bz.rest(1060)


_MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".",
    "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---",
    "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---",
    "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-",
    "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--",
    "Z": "--..", "0": "-----", "1": ".----", "2": "..---",
    "3": "...--", "4": "....-", "5": ".....", "6": "-....",
    "7": "--...", "8": "---..", "9": "----.",
}

_DOT_MS = 60


def morse(bz, text, on_symbol=None):
    """Spell something out.

    `on_symbol(is_dash)` fires at the start of every element, so a scene can
    flash an LED in lockstep - which is what turns a beeping decoration into
    something that looks like it is trying to communicate.
    """
    for char in text.upper():
        if char == " ":
            bz.rest(_DOT_MS * 7)
            continue
        code = _MORSE.get(char)
        if not code:
            continue
        for symbol in code:
            is_dash = symbol == "-"
            if on_symbol:
                on_symbol(is_dash)
            bz.pulse(_DOT_MS * 3 if is_dash else _DOT_MS)
            bz.rest(_DOT_MS)
        bz.rest(_DOT_MS * 2)


def addams(bz, on_note=None):
    """The closest thing to a tune you get on one note.

    That figure is carried entirely by rhythm, so a fixed pitch loses it
    nothing: four beats, then the two snaps. `on_note(index)` fires per
    beat - indices 0-3 are the phrase, 4 and 5 are the snaps.
    """
    score = ((110, 190), (110, 190), (110, 190), (230, 200), (70, 180), (70, 420))
    for index, (on_ms, gap_ms) in enumerate(score):
        if on_note:
            on_note(index)
        bz.pulse(on_ms)
        bz.rest(gap_ms)


def shave_and_a_haircut(bz):
    """Seven beats. Recognisable on one note, same as above."""
    for on_ms, gap_ms in (
        (150, 170), (80, 90), (80, 170), (110, 230), (150, 480),
        (150, 190), (200, 0),
    ):
        bz.pulse(on_ms)
        if gap_ms:
            bz.rest(gap_ms)


def ghost_swell(bz):
    """Intermodulation territory - the gate approaches the carrier and the
    two beat against each other.

    This one varies wildly between individual buzzers. Test yours; keep it
    if it comes out eerie, drop it if it just sounds broken.
    """
    bz.sweep(400, 1200, 900, duty=0.5)
    bz.sweep(1200, 500, 700, duty=0.5)
