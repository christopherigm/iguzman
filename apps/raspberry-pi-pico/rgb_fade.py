"""RGB LED fading demo for Raspberry Pi Pico (MicroPython)

Connect a single common-cathode or common-anode RGB LED to three PWM-capable GPIOs
and run this script to perform a smooth color-fade cycle.

Usage: copy this file to the Pico as `main.py` or run it from REPL.
"""
import time
import math
from machine import Pin, PWM

# USER CONFIG: change pins here to match your wiring
PIN_RED = 15
PIN_GREEN = 14
PIN_BLUE = 13

# If your RGB LED is common-anode (anode -> 3.3V), set to True.
# For common-cathode (cathode -> GND) set to False.
COMMON_ANODE = False

# PWM frequency (Hz) and update interval (seconds)
PWM_FREQ = 1000
UPDATE_MS = 20

def _to_duty_u16(value):
    """Convert 0.0-1.0 float to 0-65535 integer duty."""
    v = max(0.0, min(1.0, value))
    return int(v * 65535)

class RGBPWM:
    def __init__(self, pin_r, pin_g, pin_b, freq=PWM_FREQ, common_anode=False):
        self.common_anode = common_anode
        self.r = PWM(Pin(pin_r))
        self.g = PWM(Pin(pin_g))
        self.b = PWM(Pin(pin_b))
        for pwm in (self.r, self.g, self.b):
            pwm.freq(freq)

    def set_rgb(self, r, g, b):
        """Set color with r,g,b in range 0.0-1.0 (floats).

        Internally uses duty_u16 (0-65535).
        """
        dr = _to_duty_u16(r)
        dg = _to_duty_u16(g)
        db = _to_duty_u16(b)
        if self.common_anode:
            # invert for common-anode LEDs
            dr = 65535 - dr
            dg = 65535 - dg
            db = 65535 - db
        self.r.duty_u16(dr)
        self.g.duty_u16(dg)
        self.b.duty_u16(db)

    def deinit(self):
        self.r.deinit()
        self.g.deinit()
        self.b.deinit()

def smooth_cycle(led, period=6.0):
    """Continuously cycle colors using phase-shifted sin waves.

    period: seconds per full color cycle.
    """
    t0 = time.ticks_ms()
    try:
        while True:
            t = (time.ticks_diff(time.ticks_ms(), t0) / 1000.0)
            # base sine wave (0..1)
            base = lambda phase: (math.sin((2 * math.pi / period) * t + phase) + 1) / 2
            r = base(0)
            g = base(2 * math.pi / 3)
            b = base(4 * math.pi / 3)
            led.set_rgb(r, g, b)
            time.sleep_ms(UPDATE_MS)
    except KeyboardInterrupt:
        # graceful stop from REPL
        pass


def main():
    led = RGBPWM(PIN_RED, PIN_GREEN, PIN_BLUE, common_anode=COMMON_ANODE)
    try:
        smooth_cycle(led)
    finally:
        led.set_rgb(0.0, 0.0, 0.0)
        led.deinit()


if __name__ == "__main__":
    main()
