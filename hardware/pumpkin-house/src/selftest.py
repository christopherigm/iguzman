"""Bench self-test: one wire at a time, with none of the show running.

The rest of this firmware is a *lantern* - the flame, the buttons and the
scenes are entangled by design, because that is what makes it feel like one
object rather than a board with parts on it. That is exactly wrong for
answering "is this wire on the right pin", where every extra moving part is
one more candidate for why you heard nothing. So nothing here imports
`main`, `scenes` or `audio`: it opens the peripherals itself, at full
volume, and says what it is about to do before it does it.

Run it without copying it to the board at all - it is a bench tool, not
firmware, and it has no business eating flash next to a 900 KB wav:

    mpremote run hardware/pumpkin-house/src/selftest.py

That interrupts `main.py`, which releases the LEDs and the I2S peripheral on
its way out, then runs everything below in order in about a minute.

One test at a time, which is how you use it once something has gone wrong:

    import selftest
    selftest.leds()        # every RGB pin on its own, by GPIO number
    selftest.amp()         # the SD line only - for a multimeter or a listen
    selftest.tone()        # 3 s of loud continuous square wave
    selftest.swap()        # the same tone on both legal pin orders
    selftest.wav()         # dark.wav, streamed raw at full scale

**Why the tone is three seconds and not ninety milliseconds.** A short blip
fits entirely inside the I2S driver's ring buffer, so whether you hear it
depends on shutdown timing as much as on wiring. That bug is fixed in
`audio.py`, but a test whose outcome depends on the fix cannot be used to
check the fix. A tone long enough to hold the buffer full for seconds is
clocked out regardless, so silence here means the signal is not reaching the
amplifier - no timing asterisk attached.
"""

from machine import I2S, Pin
from time import sleep_ms

import config

# Two 16-bit samples leave per input sample, one per channel.
_BYTES_PER_SAMPLE = 4

# How loud every synthesised test is, as the high byte of a signed 16-bit
# sample: 0x7F is full scale, 0x40 is half, 0x18 is about -14 dB.
#
# Deliberately loud by default, and deliberately in *one* place so it can be
# turned down without editing five signatures. The default answers "is this
# amplifier alive at all", which is a question a polite tone cannot settle -
# but once the answer is yes it is much louder than you want beside your
# head, so drop it here and run again. Every test below reads this unless
# you pass `level=` explicitly.
#
# This does not touch how loud the *lantern* is. That is
# `config.AUDIO_VOLUME`, and better still the amp's own GAIN pad - see the
# build sheet.
LEVEL = 0x20

# The same idea for `wav()`, which plays real material rather than a
# synthesised wave, on the same 1-10 scale as `config.AUDIO_VOLUME` so that
# a level you liked here is a number you can type straight into `config.py`.
WAV_VOLUME = 6

# Deliberately a second copy of `audio._VOLUME_GAIN` rather than an import.
# Nothing in this module touches the lantern's own code, and that is not
# fastidiousness: the fault that took longest to find on this build was a
# `/audio` directory shadowing `audio.py`, which left `import audio` handing
# back an empty module. A self-test that imports the module under suspicion
# fails in the same breath as the thing it was meant to diagnose. Ten
# numbers are a cheap price for a tool that still runs when the firmware
# does not. If you retune the scale, retune it in both places.
_VOLUME_GAIN = (11, 16, 23, 32, 45, 64, 91, 128, 181, 256)


# -- lights ---------------------------------------------------------------


def leds(ms=400):
    """Every RGB channel on its own, full brightness, announced by GPIO.

    Plain digital rather than PWM on purpose: a low duty cycle and a dead
    LED look identical across a lit workbench, and telling those apart is
    the entire job. It also catches the fault the flame hides completely - a
    red and a blue anode swapped, which merely makes the embers wrong.
    """
    print("LEDs: each channel on for", ms, "ms, in RGB order per group")
    for index, group in enumerate(config.RGB_PINS):
        for channel, pin in zip(("red", "green", "blue"), group):
            print("  group", index, channel, "-> GP%d" % pin)
            p = Pin(pin, Pin.OUT, value=1)
            sleep_ms(ms)
            p.value(0)


def flood(ms=1500):
    """The white string, through Q1."""
    print("Flood: GP%d high for" % config.FLOOD_PIN, ms, "ms")
    p = Pin(config.FLOOD_PIN, Pin.OUT, value=1)
    sleep_ms(ms)
    p.value(0)


# -- the buzzer -----------------------------------------------------------


def buzzer(ms=300, times=3):
    """The CYT1036, driven straight rather than through `buzzer.py`.

    It is an *active* buzzer - its oscillator is inside the can - so a
    steady high is a tone and there is no pitch to get wrong. Silent here
    with the LEDs working means Q2 or the buzzer, not the firmware.
    """
    print("Buzzer: GP%d, %d pulses of %d ms" % (config.BUZZER_PIN, times, ms))
    p = Pin(config.BUZZER_PIN, Pin.OUT, value=0)
    for _ in range(times):
        p.value(1)
        sleep_ms(ms)
        p.value(0)
        sleep_ms(ms)


# -- the amplifier's shutdown line ----------------------------------------


def amp(cycles=3, ms=1200):
    """SD only. No audio at all - just the enable line going up and down.

    Two ways to read it. With a multimeter on the amp's SD pad you should
    see it swing between roughly 0 V and 3.3 V; if it does not, the fault is
    between the GPIO and that pad and no amount of I2S will help. With an
    ear near the cone you will usually hear a tick, or the hiss change, each
    time it rises - which proves the module has power, the one thing this
    firmware genuinely cannot check for you.
    """
    if config.AMP_ENABLE_PIN is None:
        print("Amp SD: AMP_ENABLE_PIN is None - tied high in hardware, nothing to test")
        return
    print("Amp SD: GP%d, %d cycles" % (config.AMP_ENABLE_PIN, cycles))
    p = Pin(config.AMP_ENABLE_PIN, Pin.OUT, value=0)
    for _ in range(cycles):
        print("  high (amp awake)")
        p.value(1)
        sleep_ms(ms)
        print("  low  (amp shut down)")
        p.value(0)
        sleep_ms(ms)


# -- audio ----------------------------------------------------------------


def _open_i2s(rate, sck, ws, din):
    return I2S(
        config.I2S_ID,
        sck=Pin(sck),
        ws=Pin(ws),
        sd=Pin(din),
        mode=I2S.TX,
        bits=16,
        format=I2S.STEREO,
        rate=rate,
        ibuf=config.AUDIO_IBUF,
    )


def _square(rate, hz, frames, level):
    """One buffer of square wave, ready to hand to I2S over and over.

    Only the odd bytes are filled: they are the high halves of the 16-bit
    samples. Both channels get the same value because the MAX98357A's SD pin
    selects a channel by voltage *band*, and a bare GPIO high does not land
    in the averaging one.
    """
    half = rate // (hz * 2)
    if half < 1:
        half = 1
    high = level & 0x7F
    low = 0x100 - high if high else 0
    buf = bytearray(frames * _BYTES_PER_SAMPLE)
    value = high
    j = 1
    for i in range(frames):
        if i and i % half == 0:
            value = low if value == high else high
        buf[j] = value
        buf[j + 2] = value
        j += _BYTES_PER_SAMPLE
    return buf


def _noise(frames, level):
    """A short loop of hiss. It repeats, which nobody can hear and which
    keeps the generator out of the streaming loop entirely."""
    import urandom

    span = (level & 0x7F) * 2
    buf = bytearray(frames * _BYTES_PER_SAMPLE)
    j = 1
    for _ in range(frames):
        value = (urandom.getrandbits(8) % span - span // 2) & 0xFF
        buf[j] = value
        buf[j + 2] = value
        j += _BYTES_PER_SAMPLE
    return buf


def _play_buffer(buf, rate, seconds, sck, ws, din, label):
    """Hammer one buffer at the amp for `seconds`, then let it drain.

    The loop is the point. `I2S.write()` returns as soon as the driver has
    copied the bytes into its ring buffer, so one write proves nothing about
    what left the speaker - but a write that blocks because the buffer is
    full is, by definition, being clocked out at the sample rate. Run that
    for seconds and the ring buffer stops being part of the question.
    """
    frames = len(buf) // _BYTES_PER_SAMPLE
    print(
        "  %s: BCLK=GP%d LRC=GP%d DIN=GP%d, %d Hz, %d s"
        % (label, sck, ws, din, rate, seconds)
    )
    sd = None
    if config.AMP_ENABLE_PIN is not None:
        sd = Pin(config.AMP_ENABLE_PIN, Pin.OUT, value=1)
        sleep_ms(config.AMP_WAKE_MS)
    i2s = _open_i2s(rate, sck, ws, din)
    try:
        for _ in range(rate * seconds // frames):
            i2s.write(buf)
        sleep_ms(config.AUDIO_IBUF * 1000 // (rate * _BYTES_PER_SAMPLE) + 20)
    finally:
        i2s.deinit()
        if sd is not None:
            sd.value(0)


def tone(seconds=3, hz=440, level=None, rate=8000, sck=None, ws=None, din=None):
    """A loud continuous square wave on the configured pins.

    `level` defaults to the module-level `LEVEL`, which is loud on purpose.
    Turn `LEVEL` down once the amp has proved it works, or pass this for a
    single call.
    """
    level = LEVEL if level is None else level
    sck = config.I2S_BCLK_PIN if sck is None else sck
    ws = config.I2S_LRC_PIN if ws is None else ws
    din = config.I2S_DIN_PIN if din is None else din
    print("Tone:")
    _play_buffer(_square(rate, hz, 512, level), rate, seconds, sck, ws, din, "square")


def noise(seconds=3, level=None, rate=8000):
    """Hiss. Harder to mistake for mains hum than a pure tone is."""
    level = LEVEL if level is None else level
    print("Noise:")
    _play_buffer(
        _noise(1024, level),
        rate,
        seconds,
        config.I2S_BCLK_PIN,
        config.I2S_LRC_PIN,
        config.I2S_DIN_PIN,
        "noise",
    )


def swap(seconds=2, hz=440, level=None, rate=8000):
    """The same tone on both pin orders the RP2040 will actually accept.

    Its I2S is PIO-based and needs the word-select line to be **the pin
    immediately after the bit clock**, so three adjacent GPIOs have exactly
    two legal assignments - whichever of the outer two is DIN. That is the
    entire search space, and walking it takes four seconds.

    If combination 2 is the one you hear, DIN and BCLK are swapped: move the
    two wires, or set I2S_BCLK/LRC/DIN_PIN to 14/15/13 in `config.py` and
    leave the soldering alone.

    If neither works the pins are not the problem - and note that a true
    BCLK/LRC swap cannot show up here at all, because ws = sck + 1 makes it
    unbuildable. That one you fix with tweezers, against the silkscreen.
    """
    level = LEVEL if level is None else level
    buf = _square(rate, hz, 512, level)
    print("Pin order: two combinations,", seconds, "s each, with a gap")
    for label, pins in (
        ("combination 1 (as configured)", (13, 14, 15)),
        ("combination 2 (DIN and BCLK swapped)", (14, 15, 13)),
    ):
        _play_buffer(buf, rate, seconds, pins[0], pins[1], pins[2], label)
        sleep_ms(800)


def wav(path=None, volume=None):
    """Stream a file with no Speaker and no Stage.

    Reaching for this after `tone()` has worked separates "the amplifier is
    not wired up" from "that file is not what this firmware can play". The
    two produce identical silence and have nothing else in common.
    """
    volume = WAV_VOLUME if volume is None else volume
    gain = _VOLUME_GAIN[min(max(int(volume), 1), len(_VOLUME_GAIN)) - 1]
    path = config.AUDIO_DIR + "/dark.wav" if path is None else path
    print("WAV:", path)
    f = open(path, "rb")
    try:
        riff = f.read(12)
        if len(riff) < 12 or riff[0:4] != b"RIFF" or riff[8:12] != b"WAVE":
            print("  not a WAV file")
            return
        rate = bits = channels = remaining = 0
        while True:
            header = f.read(8)
            if len(header) < 8:
                print("  no data chunk")
                return
            size = (
                header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24)
            )
            if header[0:4] == b"fmt ":
                fmt = f.read(size)
                channels = fmt[2] | (fmt[3] << 8)
                rate = fmt[4] | (fmt[5] << 8) | (fmt[6] << 16) | (fmt[7] << 24)
                bits = fmt[14] | (fmt[15] << 8)
            elif header[0:4] == b"data":
                remaining = size
                break
            else:
                # Word-aligned chunks: an odd size carries an uncounted pad
                # byte, and skipping it puts every later chunk off by one.
                f.seek(size + (size & 1), 1)
        print(
            "  %d Hz, %d-bit, %d channel, %d bytes"
            % (rate, bits, channels, remaining)
        )
        if bits != 8 or channels != 1:
            print("  wrong format - re-encode as 8-bit mono")
            return

        table = bytearray(256)
        for i in range(256):
            table[i] = (((i - 128) * gain) >> 8) & 0xFF
        raw = bytearray(512)
        raw_mv = memoryview(raw)
        out = bytearray(512 * _BYTES_PER_SAMPLE)
        out_mv = memoryview(out)

        sd = None
        if config.AMP_ENABLE_PIN is not None:
            sd = Pin(config.AMP_ENABLE_PIN, Pin.OUT, value=1)
            sleep_ms(config.AMP_WAKE_MS)
        i2s = _open_i2s(
            rate, config.I2S_BCLK_PIN, config.I2S_LRC_PIN, config.I2S_DIN_PIN
        )
        try:
            while remaining > 0:
                want = 512 if remaining > 512 else remaining
                read = f.readinto(raw_mv[0:want])
                if not read:
                    break
                remaining -= read
                j = 1
                for i in range(read):
                    value = table[raw[i]]
                    out[j] = value
                    out[j + 2] = value
                    j += _BYTES_PER_SAMPLE
                i2s.write(out_mv[0 : read * _BYTES_PER_SAMPLE])
            sleep_ms(config.AUDIO_IBUF * 1000 // (rate * _BYTES_PER_SAMPLE) + 20)
        finally:
            i2s.deinit()
            if sd is not None:
                sd.value(0)
        print("  done")
    finally:
        f.close()


# -- everything -----------------------------------------------------------


def run():
    """All of it, in the order that narrows the problem fastest.

    Lights first, because if the LEDs walk you know the board is running
    this code and the pin map is real - which turns every later silence into
    a statement about the amplifier rather than about the deployment.
    """
    print("--- pumpkin-house self test ---")
    print(
        "level 0x%02X, wav volume %d/10 - edit LEVEL / WAV_VOLUME to change"
        % (LEVEL, WAV_VOLUME)
    )
    leds()
    flood()
    buzzer()
    amp()
    tone()
    sleep_ms(600)
    noise()
    sleep_ms(600)
    swap()
    sleep_ms(600)
    try:
        wav()
    except OSError as err:
        print("WAV: cannot open -", err)
    print("--- done ---")


if __name__ == "__main__":
    run()
