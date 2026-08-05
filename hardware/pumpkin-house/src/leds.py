"""Light: gamma-corrected RGB groups, the white flood, and the flame engine.

All levels in this module are 0-255. Conversion to the PWM's 16-bit duty
happens once, through a precomputed gamma table, so nothing in the hot path
does floating-point maths.
"""

from array import array

from machine import PWM, Pin
from time import ticks_add, ticks_diff, ticks_ms

import config

# 0-255 level -> 16-bit duty, gamma corrected. Built once at import; the
# flame updates ~30 times a second and should never be computing powers.
_GAMMA = array(
    "H",
    [int(((i / 255.0) ** config.GAMMA) * 65535 + 0.5) for i in range(256)],
)


def _clamp8(v):
    if v < 0:
        return 0
    if v > 255:
        return 255
    return int(v)


class RgbLed:
    """One common-cathode RGB LED, anodes driven straight off GPIO."""

    def __init__(self, pins):
        self._ch = tuple(PWM(Pin(p)) for p in pins)
        for ch in self._ch:
            ch.freq(config.PWM_FREQ)
        self._last = (-1, -1, -1)
        self.set(0, 0, 0)

    def set(self, r, g, b):
        rgb = (_clamp8(r), _clamp8(g), _clamp8(b))
        if rgb == self._last:
            return
        self._last = rgb
        for ch, value, trim in zip(self._ch, rgb, config.CHANNEL_TRIM):
            ch.duty_u16(int(_GAMMA[value] * trim))

    def off(self):
        self.set(0, 0, 0)

    def deinit(self):
        for ch in self._ch:
            ch.duty_u16(0)
            ch.deinit()


class Flood:
    """The white flood string, low-side switched by Q1.

    This is a base driving a transistor, not an LED, so there is no colour
    here - only how hard Q1 is held on.
    """

    def __init__(self, pin):
        self._pwm = PWM(Pin(pin))
        self._pwm.freq(config.PWM_FREQ)
        self._last = -1
        self.set(0)

    def set(self, level):
        level = _clamp8(level)
        if level == self._last:
            return
        self._last = level
        self._pwm.duty_u16(_GAMMA[level])

    def off(self):
        self.set(0)

    def deinit(self):
        self._pwm.duty_u16(0)
        self._pwm.deinit()


def ember(level):
    """Map a brightness to a flame colour.

    Real flame shifts hue with temperature: dim is deep red, bright is
    nearly yellow-white. Integer maths throughout - this runs on every tick.
    """
    r = level
    g = (level * 42) >> 7  # ~0.33 of red: the amber ratio
    b = (level * 5) >> 7 if level > 205 else 0  # a hint of white at the peak
    return r, g, b


class Flame:
    """Candle flicker across the whole group.

    Flame brightness is not white noise. It wanders slowly around a level
    and occasionally gusts down hard. Each lamp gets its own wander and its
    own gusts, so the group never pulses in unison - synchronised flicker is
    the single biggest tell that a fake flame is fake.

    `tick()` is cheap and rate-limited internally, so it is safe to call it
    as often as you like from anywhere, including from inside a buzzer
    effect's idle gaps.
    """

    def __init__(self, leds, flood=None, rng=None):
        import urandom

        self._rng = rng or urandom
        self._leds = leds
        self._flood = flood
        n = len(leds)
        mid = (config.FLAME_MIN + config.FLAME_MAX) // 2
        self._level = [mid] * n
        self._target = [mid] * n
        self._next = ticks_ms()
        self._enabled = True
        self._scale = 8  # in eighths; scenes dim the whole flame through this

    # -- control ---------------------------------------------------------

    def set_scale(self, eighths):
        """Dim or brighten the whole flame, 0-8, without stopping it."""
        self._scale = 0 if eighths < 0 else 8 if eighths > 8 else eighths

    def pause(self):
        self._enabled = False

    def resume(self):
        self._enabled = True

    # -- the loop --------------------------------------------------------

    def tick(self, force=False):
        if not self._enabled:
            return
        now = ticks_ms()
        if not force and ticks_diff(now, self._next) < 0:
            return
        self._next = ticks_add(now, config.FLAME_TICK_MS)

        span = config.FLAME_MAX - config.FLAME_MIN
        total = 0
        for i, led in enumerate(self._leds):
            level = self._level[i]
            target = self._target[i]

            if level < target:
                level = min(level + config.FLAME_STEP, target)
            elif level > target:
                level = max(level - config.FLAME_STEP, target)
            else:
                # Arrived. Pick somewhere new to drift toward - usually a
                # small move, occasionally a gust that dips deep.
                if self._rng.getrandbits(8) % config.FLAME_GUST_CHANCE == 0:
                    target = config.FLAME_MIN + (self._rng.getrandbits(6) % 40)
                else:
                    target = config.FLAME_MIN + (self._rng.getrandbits(8) % span)
                self._target[i] = target

            self._level[i] = level
            shown = (level * self._scale) >> 3
            total += shown
            led.set(*ember(shown))

        if self._flood is not None:
            mean = total // len(self._leds)
            self._flood.set((mean * config.FLOOD_RATIO) >> 3)
