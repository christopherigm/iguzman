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
                               at construction - which is also where
                               `config.AUDIO_VOLUME` rides along for free.

    mono -> stereo             SD is a three-level *mode* pin, not just an
                               enable: 0.16-0.77 V is (L+R)/2, above ~1.4 V
                               is left only. A GPIO high lands in the second
                               band, so writing each sample to both channels
                               is what makes the output independent of which
                               band the board's own resistors put it in - and
                               it costs one store per sample.

The even bytes of the output buffer are the low halves of those 16-bit
samples and are always zero, so they are written once at allocation and
never touched again - the inner loop only ever fills the odd ones.

`idle` and `abort` mirror the Buzzer's exactly, and for the same reason: the
callback runs between chunks so the flame keeps moving and the buttons keep
getting served through a thirty-second recording, and the predicate lets a
press cut one short. A chunk is ~23 ms at 11 kHz, so both happen at about
the rate the flame ticks anyway.
"""

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


# `config.AUDIO_VOLUME` 1-10 -> linear gain, as a numerator over 256.
#
# Three decibels a step, so 10 is the file untouched and every notch below
# is a factor of ~1.414 down. A linear tenth-per-step would put every useful
# setting in the top two notches, because loudness tracks the logarithm of
# amplitude - the eight below would all sound like silence and the dial
# would be a switch.
#
# 1/256ths rather than floats because this is arrived at through integer
# arithmetic on every one of 256 table entries, and MicroPython's ints are
# arbitrary precision while its floats are single. A tuple rather than a
# `pow()` because ten numbers written down are ten numbers anybody can check
# against the table in `config.py`.
_VOLUME_GAIN = (11, 16, 23, 32, 45, 64, 91, 128, 181, 256)


def volume_gain(volume):
    """Linear gain over 256 for a 1-10 volume, clamped rather than refused.

    Clamped because the alternative is a lantern that will not boot over a
    typo in a settings file - and a `config.py` edited on a phone at the
    bench is exactly where that typo happens. Out of range is a mistake
    worth surviving loudly, not dying over.
    """
    volume = int(volume)
    if volume < 1:
        volume = 1
    elif volume > len(_VOLUME_GAIN):
        volume = len(_VOLUME_GAIN)
    return _VOLUME_GAIN[volume - 1]


def _level_table(gain):
    """u8 sample -> the high byte of its signed 16-bit equivalent.

    Volume is folded in here rather than applied per sample: `gain` is a
    numerator over 256, so the multiply and the shift happen 256 times at
    construction and never once in the streaming loop. Python's `>>` on a
    negative int is arithmetic, which is what makes this a volume control
    rather than a waveform mangler.
    """
    table = bytearray(256)
    for i in range(256):
        table[i] = (((i - 128) * gain) >> 8) & 0xFF
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
        volume=None,
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

        volume = config.AUDIO_VOLUME if volume is None else volume
        # Kept as well as the table because `blip()` synthesises its own
        # waveform and never passes through it.
        self._gain = volume_gain(volume)
        self._table = _level_table(self._gain)

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
                # The odd bytes still hold the tail of the last chunk, so
                # this cannot reuse `_out`.
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

    def gain(self):
        """`config.AUDIO_VOLUME` as a numerator over 256.

        The streaming path never needs this - volume is baked into the
        lookup table at construction and applied for free. Anything that
        *makes* its samples rather than reading them has no table to hide in
        and has to scale them itself, which is the only reason this is
        public.
        """
        return self._gain

    # -- playback --------------------------------------------------------

    def play_stream(self, rate, fill, on_chunk=None):
        """Play whatever `fill` writes into the output buffer, until it stops.

        The seam `midi.py` hangs off. `fill(buf)` is handed this Speaker's
        own output buffer - already the right size, already zeroed in the
        even bytes - and returns how many *samples* it put there, or 0 when
        there is nothing left to play.

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

    def blip(self, hz=660, ms=90, level=None):
        """A short tone, synthesised rather than read from a file.

        The buzzer answers an unmute with a blip - proof that the sound path
        works, which no confirmation colour can give you. With no buzzer
        fitted this is what says the same thing, so it must not depend on
        anything having been copied onto the board.

        `level` is the square wave's amplitude as the high byte of a signed
        16-bit sample, and by default it is half of full scale scaled by
        `config.AUDIO_VOLUME` - so turning the lantern down turns its
        confirmation down with it. A blip that stayed put while the music
        dropped 18 dB would end up being the loudest thing the lantern does,
        which is a strange fate for a noise that only ever means "your press
        registered".

        Floored well above zero all the same: at volume 1 the honest
        arithmetic lands on 2, and a confirmation nobody can hear is not a
        quieter confirmation, it is a broken one.

        Pass it explicitly at the REPL when the question is "is this
        amplifier alive at all" rather than "did my press register" -
        `blip(level=0x60)` is roughly full scale and much harder to miss
        across a bench.
        """
        if self._muted:
            return
        if level is None:
            level = (0x40 * self._gain) >> 8
            if level < 4:
                level = 4
        rate = 8000
        frames = rate * ms // 1000
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

        self._open(rate)
        self.enable(True)
        self._write(buf)
        # `_silence()` drains before dropping SD, which for a tone this short
        # is the only reason any of it is heard at all - 90 ms of audio fits
        # inside the ring buffer with room to spare, so without the drain the
        # amp is shut down holding the whole blip.
        self._silence()
