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

import micropython
from machine import I2S, Pin
from time import sleep_ms

import config

# Two 16-bit samples leave per input sample, one per channel.
_BYTES_PER_SAMPLE = 4


@micropython.viper
def _convert(out: ptr8, raw: ptr8, count: int):
    """u8 samples -> 16-bit stereo frames; `audio._convert()`'s twin.

    Viper for the same reason the original is: as bytecode this loop costs
    40 us a sample, which is most of a core at 11 kHz and enough to make a
    perfectly wired amplifier stutter - a self-test that invents its own
    fault is worse than no self-test.
    """
    i = 0
    j = 0
    while i < count:
        hi = int(raw[i]) ^ 0x80
        out[j] = 0
        out[j + 1] = hi
        out[j + 2] = 0
        out[j + 3] = hi
        j = j + 4
        i = i + 1


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


def _square(rate, hz, frames):
    """One buffer of full-scale square wave, to hand to I2S over and over.

    Only the odd bytes are filled: they are the high halves of the 16-bit
    samples, and at full scale the low halves are zero, which a fresh
    bytearray already is. Both channels get the same value because the
    MAX98357A's SD pin selects a channel by voltage *band*, and a bare GPIO
    high does not land in the averaging one.
    """
    half = rate // (hz * 2)
    if half < 1:
        half = 1
    buf = bytearray(frames * _BYTES_PER_SAMPLE)
    value = 0x7F
    j = 1
    for i in range(frames):
        if i and i % half == 0:
            value = 0x81 if value == 0x7F else 0x7F
        buf[j] = value
        buf[j + 2] = value
        j += _BYTES_PER_SAMPLE
    return buf


def _noise(frames):
    """A short loop of full-scale hiss. It repeats, which nobody can hear
    and which keeps the generator out of the streaming loop entirely."""
    import urandom

    buf = bytearray(frames * _BYTES_PER_SAMPLE)
    j = 1
    for _ in range(frames):
        value = (urandom.getrandbits(8) - 128) & 0xFF
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


def tone(seconds=3, hz=440, rate=8000, sck=None, ws=None, din=None):
    """A continuous full-scale square wave on the configured pins.

    Full scale on purpose, and there is nowhere here to turn it down: how
    loud the lantern gets is the resistor on the amp's GAIN pad, which is
    hardware and is the same for this test as for the show. A square wave is
    also the least musical thing this board can make, so if it is painful
    beside your head the strap is the answer - see step 05 of the build
    sheet.
    """
    sck = config.I2S_BCLK_PIN if sck is None else sck
    ws = config.I2S_LRC_PIN if ws is None else ws
    din = config.I2S_DIN_PIN if din is None else din
    print("Tone:")
    _play_buffer(_square(rate, hz, 512), rate, seconds, sck, ws, din, "square")


def noise(seconds=3, rate=8000):
    """Hiss. Harder to mistake for mains hum than a pure tone is."""
    print("Noise:")
    _play_buffer(
        _noise(1024),
        rate,
        seconds,
        config.I2S_BCLK_PIN,
        config.I2S_LRC_PIN,
        config.I2S_DIN_PIN,
        "noise",
    )


def swap(seconds=2, hz=440, rate=8000):
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
    buf = _square(rate, hz, 512)
    print("Pin order: two combinations,", seconds, "s each, with a gap")
    for label, pins in (
        ("combination 1 (as configured)", (13, 14, 15)),
        ("combination 2 (DIN and BCLK swapped)", (14, 15, 13)),
    ):
        _play_buffer(buf, rate, seconds, pins[0], pins[1], pins[2], label)
        sleep_ms(800)


def wav(path=None):
    """Stream a file at full scale, with no Speaker and no Stage.

    Reaching for this after `tone()` has worked separates "the amplifier is
    not wired up" from "that file is not what this firmware can play". The
    two produce identical silence and have nothing else in common.
    """
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
                _convert(out, raw, read)
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
    print("everything below plays at full scale - loudness is the GAIN strap")
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
