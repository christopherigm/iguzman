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

    unsigned 8 -> signed 16    the format I2S wants, and at full scale it
                               is one XOR: flipping the top bit of an
                               unsigned byte is that same number read as
                               signed, and the 16-bit sample is that byte
                               sitting in the high half with a zero below.

    mono -> stereo             SD is a three-level *mode* pin, not just an
                               enable: 0.16-0.77 V is (L+R)/2, above ~1.4 V
                               is left only. A GPIO high lands in the second
                               band, so writing each sample to both channels
                               is what makes the output independent of which
                               band the board's own resistors put it in - and
                               it costs one store per sample.

**The low half of every sample is written too, as an explicit zero.** At
full scale it is always zero, so the loop could skip it and be half the
size - and it must not, because the output buffer is shared. `midi.py`
fills the same bytearray through `play_stream()` with samples that use both
halves, so a `play()` that only touched the odd bytes would clock out the
tail of the last synthesised piece underneath the recording, at a level
nobody can predict. Two stores a sample is what that costs.

**The conversion loop is `@micropython.viper`**, for the same reason
`midi.py`'s mixer is: it runs per *sample*. As ordinary bytecode it cost
40 us a sample - 44% of a core at 11 kHz just to move bytes, and that was
only two stores of the four it has to make. Compiled, the same loop is 1.1%
of a core and the whole question goes away.

**There is no volume control here, on purpose.** Everything this module
writes leaves at full scale, and how loud that is is set once by the
resistor on the amplifier's GAIN pad - 100 kOhm to VIN on this build, the
quietest of that pad's five states. Scaling the samples instead would lower
the music and leave the amplifier wide open, so its own hiss would stay
exactly where it was; the strap turns the part itself down and takes the
hiss with it. See `config.py` and step 05 of the build sheet.

`idle` and `abort` mirror the Buzzer's exactly, and for the same reason: the
callback runs between chunks so the flame keeps moving and the buttons keep
getting served through a thirty-second recording, and the predicate lets a
press cut one short. A chunk is ~23 ms at 11 kHz, so both happen at about
the rate the flame ticks anyway.
"""

import micropython
from machine import Pin
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

try:
    from machine import I2S
except ImportError:
    # A MicroPython build without I2S. `main.py` imports this module
    # unconditionally, so an ImportError raised out here would happen before a
    # single LED is configured and would take the lights down along with the
    # sound. Failing at `Speaker()` instead puts it where `build_speaker()`
    # already handles it - a lantern with no amplifier, which is a state this
    # firmware supports.
    I2S = None

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


@micropython.viper
def _convert(out: ptr8, raw: ptr8, count: int):
    """`count` u8 samples from `raw` into `count` 16-bit stereo frames.

    The whole conversion is `^ 0x80`: an unsigned byte with its top bit
    flipped is the same number read as signed, and full scale puts that byte
    in the high half of the 16-bit sample with nothing below it. Four stores
    a sample - both halves, each written to both channels. Writing to both
    is what makes the output independent of which mode the amp's SD divider
    puts it in, and writing the zeros is what keeps a previous synthesised
    piece out from under this one; see the module docstring.

    Kept as a module-level function rather than a method because viper wants
    machine ints and raw pointers, and `self` is neither.
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
    ):
        if I2S is None:
            raise ValueError("this MicroPython build has no machine.I2S")
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

        samples = config.AUDIO_CHUNK_SAMPLES
        self._samples = samples
        self._raw = bytearray(samples)
        self._raw_mv = memoryview(self._raw)
        # Shared: `play()` fills it through `_convert()` and `midi.py` fills
        # it through `play_stream()`. Every byte is rewritten on every chunk,
        # which is why `_convert()` stores the low halves it knows are zero -
        # see the module docstring.
        self._out = bytearray(samples * _BYTES_PER_SAMPLE)
        self._out_mv = memoryview(self._out)

        self._i2s = None
        self._rate = 0
        # Bytes handed to the driver that it may not have clocked out yet.
        # See `_drain()` - this is the difference between a working amp and
        # one that appears to be wired wrong.
        self._written = 0

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

    def _write(self, buf):
        """Every I2S write goes through here, so `_drain()` knows how much
        audio the driver has taken but not yet clocked out."""
        self._i2s.write(buf)
        self._written += len(buf)

    def _drain(self):
        """Block until what has been written has actually been heard.

        **`write()` returns when the bytes reach the driver's ring buffer,
        not when the amplifier has played them**, and MicroPython's I2S has
        no drain call. So shutting the amp down straight after a write
        silences up to `AUDIO_IBUF` bytes that the driver had already
        accepted - and a `blip()` is *shorter* than that buffer, so the
        entire tone went into the ring buffer, SD dropped microseconds
        later, and the whole thing was clocked into a dead amplifier. A
        correctly wired speaker looks stone dead, which is a long way to
        chase a missing `sleep_ms`.

        Waiting the outstanding buffer's own playing time is the fix, and it
        is bounded and small - 8192 bytes at 11 kHz is 186 ms, and it only
        happens where the sound was about to stop anyway.

        Deliberately a bare `sleep_ms` rather than `rest()`: `_silence()` is
        reached from `Controls._blackout()`, which is running inside
        `poll()`, and `rest()` calls the idle callback, which calls `poll()`.
        """
        if self._i2s is None or self._rate <= 0:
            return
        outstanding = self._written
        if outstanding > config.AUDIO_IBUF:
            # Anything longer than the buffer has been pacing itself against
            # a full one for a while, so a full one is what is left.
            outstanding = config.AUDIO_IBUF
        self._written = 0
        if outstanding <= 0:
            return
        sleep_ms(outstanding * 1000 // (self._rate * _BYTES_PER_SAMPLE) + 1)

    def _silence(self):
        """A short run of zeros, let it play, then shut down.

        Dropping SD while the last sample was somewhere other than zero
        steps the output, and a class-D amp answers a step with a click. The
        cheapest fix is to end every track on silence it has actually played
        - which is also why `_drain()` is here and not optional: zeros that
        are still sitting in the ring buffer when SD goes low are exactly as
        unplayed as the music in front of them.

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
                # `_out` still holds the tail of the last chunk, so this
                # cannot reuse it.
                try:
                    self._write(bytearray(frames * _BYTES_PER_SAMPLE))
                except OSError:
                    pass
            self._drain()
        self.enable(False)

    def off(self):
        self._silence()

    def deinit(self):
        if self._i2s is not None:
            self._i2s.deinit()
            self._i2s = None
            self._rate = 0
            # The ring buffer went with it, so there is nothing left to wait
            # for and `_drain()` must not sleep on the next device's behalf.
            self._written = 0

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

    # -- what the synth needs to know ------------------------------------

    def chunk_samples(self):
        """Samples per write, so a generator can size its buffer to ours."""
        return self._samples

    # -- playback --------------------------------------------------------

    def play_stream(self, rate, fill, on_chunk=None):
        """Play whatever `fill` writes into the output buffer, until it stops.

        The seam `midi.py` hangs off. `fill(buf)` is handed this Speaker's
        own output buffer - already the right size, and holding whatever the
        last chunk left in it - and returns how many *samples* it put there,
        or 0 when there is nothing left to play. It owns every byte of the
        frames it claims, low halves included.

        Everything a Speaker exists to get right is on this side of that
        callback: the amp is woken before the first write and shut down
        through `_silence()` after the last one, the idle slot runs between
        chunks so the flame keeps moving through a two-minute piece, and a
        button press aborts it exactly where it aborts a recording.

        `play()` predates this and keeps its own copy of the loop. Folding
        the two together is a real tidy-up and deliberately not made in the
        same change as a new synth: that loop is the one part of this
        firmware whose failure mode is a lantern that looks perfectly wired
        and plays nothing.
        """
        if self._muted:
            return False

        self._open(rate)
        self.enable(True)
        try:
            while True:
                frames = fill(self._out)
                if frames <= 0:
                    break
                self._write(self._out_mv[0 : frames * _BYTES_PER_SAMPLE])
                if on_chunk is not None:
                    on_chunk(frames)
                self._idle()
                if self._muted or self.aborting():
                    break
        finally:
            self._silence()
        return True

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

            raw = self._raw
            out = self._out
            chunk = self._samples

            while remaining > 0:
                want = chunk if remaining > chunk else remaining
                read = f.readinto(self._raw_mv[0:want])
                if not read:
                    break
                remaining -= read

                _convert(out, raw, read)

                self._write(self._out_mv[0 : read * _BYTES_PER_SAMPLE])

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
        """A short tone at full scale, synthesised rather than read from a file.

        The buzzer answers an unmute with a blip - proof that the sound path
        works, which no confirmation colour can give you. With no buzzer
        fitted this is what says the same thing, so it must not depend on
        anything having been copied onto the board.

        Full scale like everything else here: how loud a press sounds is the
        GAIN strap's business, and a confirmation nobody can hear is not a
        quieter confirmation, it is a broken one.
        """
        if self._muted:
            return
        rate = 8000
        frames = rate * ms // 1000
        half = rate // (hz * 2)
        if half < 1:
            half = 1

        # Only the high halves are touched. A full-scale square alternates
        # between +0x7F00 and -0x7F00, whose low bytes are both zero, and a
        # fresh bytearray already holds them.
        buf = bytearray(frames * _BYTES_PER_SAMPLE)
        hi = 0x7F
        j = 1
        for i in range(frames):
            if i and i % half == 0:
                hi = 0x81 if hi == 0x7F else 0x7F
            buf[j] = hi
            buf[j + 2] = hi
            j += _BYTES_PER_SAMPLE

        self._open(rate)
        self.enable(True)
        self._write(buf)
        # `_silence()` drains before dropping SD, which for a tone this short
        # is the only reason any of it is heard at all - 90 ms of audio fits
        # inside the ring buffer with room to spare, so without the drain the
        # amp is shut down holding the whole blip.
        self._silence()
