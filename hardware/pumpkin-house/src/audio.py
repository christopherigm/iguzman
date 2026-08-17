"""Sound: recorded audio, streamed off flash to an I2S class-D amplifier.

The buzzer next door owns one fixed pitch and expresses itself entirely
through *when* that pitch is on. This owns the opposite problem: the
waveform is already decided, it lives in a file, and the only job here is to
get it off the flash and into the amplifier without the rest of the lantern
stopping while it happens.

**8-bit unsigned mono WAV, and deliberately nothing else.** A plain Pico has
roughly 1.3 MB of filesystem once MicroPython has taken its share, which is
about two minutes at 11 kHz. 16-bit would halve that for a difference nobody
can hear through a 3 W cone inside a ceramic pot, and supporting both would
put a branch in the one loop that has to stay cheap. A file in any other
format is rejected by name, with the ffmpeg line that fixes it.

Two conversions happen on every chunk, and they are the reason this is not
simply `i2s.write(file.read())`:

    unsigned 8 -> signed 16    the format I2S wants. It is a subtraction of
                               128 and a shift into the high byte, so it is
                               done with a 256-entry lookup table built once
                               at construction - which is also where the
                               volume attenuation rides along for free.

    mono -> stereo             the amp's SD pin held high puts it in
                               (L+R)/2 mode, so a sample sent to one channel
                               only arrives 6 dB down. Writing each sample
                               to both channels costs one extra store and
                               gets that back.

The even bytes of the output buffer are the low halves of those 16-bit
samples and are always zero, so they are written once at allocation and
never touched again - the inner loop only ever fills the odd ones.

`idle` and `abort` mirror the Buzzer's exactly, and for the same reason: the
callback runs between chunks so the flame keeps moving and the buttons keep
getting served through a thirty-second recording, and the predicate lets a
press cut one short. A chunk is ~23 ms at 11 kHz, so both happen at about
the rate the flame ticks anyway.
"""

from machine import I2S, Pin
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

import config

# Four output bytes leave for every input byte: two 16-bit samples, one per
# channel. Everything that sizes a buffer is derived from this.
_BYTES_PER_SAMPLE = 4

_WAV_PCM = 1


def _u16(buf, offset):
    return buf[offset] | (buf[offset + 1] << 8)


def _u32(buf, offset):
    return (
        buf[offset]
        | (buf[offset + 1] << 8)
        | (buf[offset + 2] << 16)
        | (buf[offset + 3] << 24)
    )


def read_wav_header(f):
    """Walk the RIFF chunks and return (rate, bits, channels, data_bytes).

    Written as a chunk walk rather than a fixed 44-byte read because ffmpeg
    happily emits a `LIST` block ahead of the data, and a firmware that
    assumes the canonical header plays that metadata as audio - which sounds
    exactly like a wiring fault and is not one.
    """
    riff = f.read(12)
    if len(riff) < 12 or riff[0:4] != b"RIFF" or riff[8:12] != b"WAVE":
        raise ValueError("not a WAV file")

    rate = bits = channels = 0
    encoding = 0
    while True:
        header = f.read(8)
        if len(header) < 8:
            raise ValueError("no data chunk")
        kind = header[0:4]
        size = _u32(header, 4)
        if kind == b"fmt ":
            fmt = f.read(size)
            encoding = _u16(fmt, 0)
            channels = _u16(fmt, 2)
            rate = _u32(fmt, 4)
            bits = _u16(fmt, 14)
        elif kind == b"data":
            if encoding != _WAV_PCM:
                raise ValueError("not uncompressed PCM")
            return rate, bits, channels, size
        else:
            # RIFF chunks are word-aligned, so an odd size carries a pad byte
            # that is not counted in `size`. Skipping it is off-by-one on
            # every subsequent chunk.
            f.seek(size + (size & 1), 1)


def _level_table(shift):
    """u8 sample -> the high byte of its signed 16-bit equivalent.

    Attenuation is folded in here rather than applied per sample: `shift` is
    a number of halvings, so 1 is -6 dB. Python's `>>` on a negative int is
    arithmetic, which is what makes this a volume control rather than a
    waveform mangler.
    """
    table = bytearray(256)
    for i in range(256):
        table[i] = ((i - 128) >> shift) & 0xFF
    return bytes(table)


def _noop():
    pass


class Speaker:
    """One MAX98357A, and whatever is currently coming out of it."""

    def __init__(
        self,
        bclk=None,
        lrc=None,
        din=None,
        enable=None,
        idle=None,
        attenuation=None,
    ):
        self._bclk = config.I2S_BCLK_PIN if bclk is None else bclk
        self._lrc = config.I2S_LRC_PIN if lrc is None else lrc
        self._din = config.I2S_DIN_PIN if din is None else din

        pin = config.AMP_ENABLE_PIN if enable is None else enable
        # Low at construction: the lantern boots asleep, and an amp brought
        # up before anything is feeding it hisses into a dark house.
        self._sd = None if pin is None else Pin(pin, Pin.OUT, value=0)
        self._awake = False

        self._idle = idle if idle is not None else _noop
        self._abort = None
        self._muted = False

        shift = config.AUDIO_ATTENUATION if attenuation is None else attenuation
        self._table = _level_table(shift)

        samples = config.AUDIO_CHUNK_SAMPLES
        self._samples = samples
        self._raw = bytearray(samples)
        self._raw_mv = memoryview(self._raw)
        # Allocated zeroed, and the even bytes stay that way for the life of
        # the object - see the module docstring.
        self._out = bytearray(samples * _BYTES_PER_SAMPLE)
        self._out_mv = memoryview(self._out)

        self._i2s = None
        self._rate = 0

    # -- the device ------------------------------------------------------

    def _open(self, rate):
        """Bring I2S up at a sample rate, reusing it if it already is.

        Rate comes from each file's own header rather than from config, so a
        long ambience at 8 kHz and a short stab at 16 kHz can sit in the same
        folder. Changing it means tearing the peripheral down, which is why
        the common case of a whole playlist at one rate is checked first.
        """
        if self._i2s is not None and self._rate == rate:
            return
        self.deinit()
        self._i2s = I2S(
            config.I2S_ID,
            sck=Pin(self._bclk),
            ws=Pin(self._lrc),
            sd=Pin(self._din),
            mode=I2S.TX,
            bits=16,
            format=I2S.STEREO,
            rate=rate,
            ibuf=config.AUDIO_IBUF,
        )
        self._rate = rate

    def enable(self, on=True):
        """Raise or drop the amp's SD line.

        Worth doing around every track rather than once at boot: idle, this
        part draws a couple of milliamps and puts audible hiss into a quiet
        garden, and the pack has neither to spare.
        """
        if self._sd is None:
            return
        if on:
            if not self._awake:
                self._sd.value(1)
                sleep_ms(config.AMP_WAKE_MS)
                self._awake = True
        elif self._awake:
            self._sd.value(0)
            self._awake = False

    def _silence(self):
        """A short run of zeros, then shut down.

        Dropping SD while the last sample was somewhere other than zero
        steps the output, and a class-D amp answers a step with a click. The
        cheapest fix is to end every track on silence it has actually played.

        Keyed on I2S being open rather than on the amp being awake, because
        the click is not really about SD: a build with `AMP_ENABLE_PIN = None`
        has no shutdown line to drop and still wants its output left sitting
        at zero rather than at whatever the last sample happened to be.
        """
        if self._i2s is not None:
            frames = self._rate * config.AMP_TAIL_MS // 1000
            if frames > self._samples:
                frames = self._samples
            if frames > 0:
                # The odd bytes still hold the tail of the last chunk, so
                # this cannot reuse `_out`.
                try:
                    self._i2s.write(bytearray(frames * _BYTES_PER_SAMPLE))
                except OSError:
                    pass
        self.enable(False)

    def off(self):
        self._silence()

    def deinit(self):
        if self._i2s is not None:
            self._i2s.deinit()
            self._i2s = None
            self._rate = 0

    # -- mute ------------------------------------------------------------
    #
    # This is where the speaker and the buzzer deliberately part company.
    # Muting the buzzer gates its carrier and changes not one duration,
    # because a scene's lighting is driven off its callbacks and a silenced
    # scene has to *look* identical. Nothing here drives any lighting yet,
    # and the thing being silenced is 300 mA of amplifier - so a muted
    # speaker does not play the file quietly, it does not play the file.

    def mute(self, on=True):
        self._muted = bool(on)
        if self._muted:
            self._silence()

    def is_muted(self):
        return self._muted

    # -- the idle slot ---------------------------------------------------

    def set_idle(self, fn):
        self._idle = fn if fn is not None else _noop

    def set_abort(self, fn):
        self._abort = fn

    def aborting(self):
        return self._abort is not None and self._abort()

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

    # -- playback --------------------------------------------------------

    def play(self, path, on_chunk=None):
        """Stream one file. Blocks for its length; returns False if muted.

        `on_chunk(samples)` fires after every write. Nothing uses it yet -
        it is the seam the eventual light-sync hangs off, and the reason it
        is a callback rather than a return value is that by the time a track
        has finished, everything it could have driven is already over.
        """
        if self._muted:
            return False

        f = open(path, "rb")
        try:
            rate, bits, channels, remaining = read_wav_header(f)
            if bits != 8 or channels != 1:
                raise ValueError(
                    "%s is %d-bit %d-channel; re-encode it as 8-bit mono"
                    % (path, bits, channels)
                )

            self._open(rate)
            self.enable(True)

            table = self._table
            raw = self._raw
            out = self._out
            chunk = self._samples

            while remaining > 0:
                want = chunk if remaining > chunk else remaining
                read = f.readinto(self._raw_mv[0:want])
                if not read:
                    break
                remaining -= read

                # The hot loop. Only the odd bytes are touched; the even ones
                # were zeroed at allocation and are the low halves of every
                # sample, which for 8-bit source material are always zero.
                j = 1
                for i in range(read):
                    value = table[raw[i]]
                    out[j] = value
                    out[j + 2] = value
                    j += _BYTES_PER_SAMPLE

                self._i2s.write(self._out_mv[0 : read * _BYTES_PER_SAMPLE])

                if on_chunk is not None:
                    on_chunk(read)
                self._idle()
                if self._muted or self.aborting():
                    break
        finally:
            f.close()
            self._silence()
        return True

    def blip(self, hz=660, ms=90):
        """A short tone, synthesised rather than read from a file.

        The buzzer answers an unmute with a blip - proof that the sound path
        works, which no confirmation colour can give you. With no buzzer
        fitted this is what says the same thing, so it must not depend on
        anything having been copied onto the board.
        """
        if self._muted:
            return
        rate = 8000
        frames = rate * ms // 1000
        half = rate // (hz * 2)
        if half < 1:
            half = 1

        # Quiet on purpose: this is a confirmation, not a scene, and it lands
        # while somebody's hand is on the lantern.
        high = 0x18
        low = 0x100 - high
        buf = bytearray(frames * _BYTES_PER_SAMPLE)
        value = high
        j = 1
        for i in range(frames):
            if i and i % half == 0:
                value = low if value == high else high
            buf[j] = value
            buf[j + 2] = value
            j += _BYTES_PER_SAMPLE

        self._open(rate)
        self.enable(True)
        self._i2s.write(buf)
        self._silence()
