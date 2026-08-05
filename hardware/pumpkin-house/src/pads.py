"""RP2040 pad drive strength.

The RP2040 resets every GPIO pad to 4 mA drive. The resistor values on the
schematic assume 12 mA, so without this the LEDs run visibly dimmer than
the arithmetic predicts and no amount of PWM tuning gets it back.

MicroPython's `machine.Pin` does not expose drive strength, so we write
PADS_BANK0 directly. Datasheet 2.19.6.3: bits 5:4 of each pad's control
register select 2 / 4 / 8 / 12 mA.
"""

import machine

_PADS_BANK0 = 0x4001C000
_GPIO0_OFFSET = 0x04
_DRIVE_SHIFT = 4
_DRIVE_MASK = 0b11 << _DRIVE_SHIFT

DRIVE_2MA = 0b00
DRIVE_4MA = 0b01
DRIVE_8MA = 0b10
DRIVE_12MA = 0b11


def set_drive(gpio, level=DRIVE_12MA):
    """Set one pad's drive strength."""
    addr = _PADS_BANK0 + _GPIO0_OFFSET + 4 * gpio
    machine.mem32[addr] = (machine.mem32[addr] & ~_DRIVE_MASK) | (level << _DRIVE_SHIFT)


def set_drive_many(gpios, level=DRIVE_12MA):
    for gpio in gpios:
        set_drive(gpio, level)
