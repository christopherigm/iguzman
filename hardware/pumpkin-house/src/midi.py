"""Sound: MIDI files, synthesised into the same amplifier as the recordings.

`audio.py` next door has its waveform decided for it - the samples are in a
file and the only job is getting them out of flash without the lantern
stopping while it happens. This module has the opposite problem. A .mid
holds *notes*, and the waveform does not exist until the code below makes
it, sample by sample, in the gaps between everything else the lantern is
doing.

The reason to want that on a board like this is arithmetic. `dark.wav` is
800 KB for forty seconds, and a plain Pico has about 1.3 MB of filesystem
once MicroPython has taken its share - so recordings are rationed, and two
of them is the whole budget. The same music as a .mid is two or three KB,
because a score is not a performance. Scores are, for this board's
purposes, free.

**What comes out is a square-wave chiptune, and it is meant to.** This is
six oscillators, one shared noise register and an envelope stepped once per
output chunk, which is what fits in the time left between flame ticks. It
will not sound like the soundfont your DAW played the file through, and no
value in `config.py` will make it - the tunables here change its character,
not its species. If you want the arrangement you heard in the DAW, render it
there and copy over a .wav; that is what the other module is for, and the
two live in the same folder precisely so you can choose per piece.

The output format is the one `audio.py` already writes: the odd bytes of a
16-bit stereo frame, with the even bytes left at the zero they were
allocated with. That caps the synth at 8 bits, which sounds like a
constraint and mostly is not - a square wave of amplitude 7 is an *exact*
square wave, quantisation takes nothing from it, and every voice here is
either a square or a noise bit.

**The mixing loop is `@micropython.viper`**, because it is the one piece of
this firmware that runs per *sample* rather than per chunk: six voices at
22 kHz is 130,000 trips a second, and the bytecode interpreter cannot do
that and leave anything for the flame. Viper compiles it to machine code
working on raw pointers, at the price of a dialect that only knows 32-bit
ints. Everything else - parsing, tempo, envelopes, deciding which voice
plays what - stays ordinary Python and runs a few dozen times a second.

The `ptr8`/`ptr32` shims at the top are what let this same file be imported
under desktop CPython, where those names do not exist and the decorator is a
no-op: a bytearray indexed by integers behaves exactly like a `ptr8`, and an
`array('i')` exactly like a `ptr32`. That is not a curiosity - it means the
parser and the synth can be run against a real .mid on a laptop and the
result written out as a WAV to listen to, instead of being debugged through
a 3 W cone on the end of a USB cable.

    # on the board
    import audio, midi
    sp = audio.Speaker()
    midi.play(sp, "/tracks/dirge.mid")
    midi.describe("/tracks/dirge.mid")   # what the parser makes of it

    # on a laptop, from hardware/pumpkin-house/src
    python3 -c "import midi; midi.render_wav('x.mid', 'x.wav')"
"""

from array import array

try:
    import micropython
except ImportError:  # desktop CPython - see the module docstring
    class micropython:  # noqa: N801 - it is standing in for a module
        @staticmethod
        def viper(fn):
            return fn

    def ptr8(buf):
        return buf

    def ptr32(buf):
        return buf

import gc

try:
    import uos
except ImportError:  # desktop CPython, where render_wav() is run
    import os as uos

import config

# --- the format ----------------------------------------------------------

_TEMPO_DEFAULT = 500_000  # µs per quarter note, i.e. 120 bpm - SMF's default

# What `Song.events()` emits. Everything else in the file is parsed only far
# enough to be stepped over: this synth has no idea what a pitch bend or a
# program change would mean, and a firmware that silently ignores them is
# more useful than one that refuses the file they appear in.
NOTE_OFF = 0
NOTE_ON = 1
TEMPO = 2

# Frequencies of C9..B9 in millihertz. The top octave rather than the middle
# one because every other note is derived by shifting this *down*, and a
# right shift only ever loses precision that was below the noise floor: the
# worst case here is note 0 at 8.176 Hz, computed to within 0.006%.
#
# Integers rather than `440 * 2 ** ((n - 69) / 12)` because MicroPython's
# floats are single precision and its ints are arbitrary, and because a
# table is a thing you can check against a tuning chart.
_TOP_OCTAVE_MHZ = (
    8372018,  # C9
    8869844,
    9397273,
    9956063,
    10548082,
    11175303,
    11839820,
    12543854,
    13289750,
    14080000,  # A9, the octave the whole table is pinned to
    14917240,
    15804266,
)

# The phase accumulator is 24-bit: one full turn of the oscillator is
# 0x1000000, which at 22 kHz puts the smallest representable step at about
# 0.0013 Hz and keeps the whole thing inside viper's 32-bit ints with room
# for the increment.
_PHASE_BITS = 24
_PHASE_MASK = (1 << _PHASE_BITS) - 1

# One `array('i')` holds everything the mixer reads, laid out for it rather
# than for reading: a four-int header, then four slots per voice - phase,
# increment, amplitude, kind. Everything a voice needs that the *mixer* does
# not - which note it is playing, for whom, and how fast it is fading -
# lives in ordinary Python lists beside it.
#
# The header is why the voice count, the pulse width and the noise register
# are in the array at all rather than being arguments: MicroPython's native
# emitters pass viper arguments in registers, and four is the number you can
# rely on across ports. Two of the four the mixer gets are the buffer and
# this array, so everything else it needs has to arrive inside one of them.
_VOICES = 0
_DUTY = 1
_LFSR = 2
_HEADER = 4

_SLOTS = 4
_PHASE = 0
_INC = 1
_AMP = 2
_KIND = 3

_SQUARE = 0
_NOISE = 1

# Four output bytes per sample, matching `audio.py` - two 16-bit channels.
_BYTES_PER_SAMPLE = 4

# GM puts percussion on channel 10 (index 9), where the note number is an
# instrument and not a pitch. Below this it is a drum with a body - kick,
# floor toms - and playing the number as a pitch gives a passable 65-110 Hz
# thud; at or above it the instrument is a snare, hat or cymbal, which is
# noise with an envelope on it. It is a heuristic, it is two lines, and it
# is the difference between a drum track and a sequence of random beeps.
_DRUM_PITCHED_BELOW = 44


def _be(data, pos, count):
    """`count` big-endian bytes as an int - every length field in the format.

    Written out rather than `int.from_bytes(data, "big")` because
    MicroPython's `int.from_bytes` is not the CPython one: byte order support
    varies by build, and a firmware that reads the file backwards on the
    board while parsing it perfectly on the laptop is a bad afternoon.
    `audio.py` builds its RIFF fields by hand for the same reason.
    """
    value = 0
    for i in range(count):
        value = (value << 8) | data[pos + i]
    return value


def _vlq(data, pos):
    """One variable-length quantity: the delta-times and every meta length."""
    value = 0
    while True:
        byte = data[pos]
        pos += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, pos


def increments(rate):
    """Phase increment per sample for all 128 MIDI notes at `rate`.

    Built once per Player rather than per note: it is 128 shifts at startup
    against a multiply-and-divide in the middle of a note-on, and note-ons
    happen in the same breath as the audio they interrupt.
    """
    top = [mhz * (1 << _PHASE_BITS) // (rate * 1000) for mhz in _TOP_OCTAVE_MHZ]
    # Note 120 is C9, so note // 12 == 10 is the octave the table holds and
    # every octave below it shifts one further right.
    return array("i", [top[n % 12] >> (10 - n // 12) for n in range(128)])


class Song:
    """A parsed .mid, held as bytes with a cursor into each MTrk chunk.

    The whole file is read into RAM, which for this format is the *small*
    option: a score dense enough to matter is a few KB, and the alternative
    - seeking a file handle per track through flash, several times per beat,
    while an I2S buffer drains - trades 3 KB of RAM for a class of glitch
    that only appears on the porch.

    `MIDI_MAX_BYTES` is the guard on that, and it is not really about RAM.
    It is about the one way a .mid can embarrass a lantern: somebody exports
    a full arrangement with sixteen tracks of orchestration, and this synth
    dutifully renders six arbitrary voices of it for four minutes.
    """

    def __init__(self, data):
        if len(data) < 14 or data[0:4] != b"MThd":
            raise ValueError("not a MIDI file (no MThd)")
        length = _be(data, 4, 4)
        self.format = _be(data, 8, 2)
        self.division = _be(data, 12, 2)
        if self.format > 1:
            # Format 2 is a bag of independent sequences with no shared
            # timeline. There is no correct way to play it as one piece, and
            # guessing produces something that sounds broken rather than
            # something that sounds wrong.
            raise ValueError("format %d; export as format 0 or 1" % self.format)
        if self.division == 0 or self.division & 0x8000:
            # The high bit means SMPTE timecode - frames per second and
            # ticks per frame - which no exporter emits for music.
            raise ValueError("SMPTE division; export with ticks per quarter")

        self._data = data
        self._parts = []
        pos = 8 + length
        while pos + 8 <= len(data):
            kind = data[pos : pos + 4]
            size = _be(data, pos + 4, 4)
            pos += 8
            end = pos + size
            if end > len(data):
                # A truncated final chunk is what a half-finished `mpremote
                # cp` looks like, so it is worth saying so rather than
                # walking off the end of the buffer mid-phrase.
                raise ValueError("truncated MTrk - re-copy the file")
            if kind == b"MTrk" and size:
                tick, cursor = _vlq(data, pos)
                # [cursor, end, tick of the event waiting there, running status]
                self._parts.append([cursor, end, tick, 0])
            pos = end
        if not self._parts:
            raise ValueError("no MTrk chunks")

    @staticmethod
    def from_file(path, limit=None):
        """Read one .mid into RAM, refusing anything over `MIDI_MAX_BYTES`.

        The size is taken from `os.stat` and the read is for exactly that
        many bytes. Reading `limit + 1` and measuring afterwards is the
        obvious way to write this and it is what was here first, but it
        allocates the *ceiling* on every call no matter how small the file
        is: with MIDI_MAX_BYTES at 96 KB, a 4 KB score asked a Pico with a
        Speaker already built for 98 KB of contiguous heap and got a
        MemoryError. That is a limit which breaks the files it was raised
        for, and it breaks them harder the more headroom you give it.

        `gc.collect()` first because this is the largest single allocation
        the firmware makes, and by the time a track is picked the heap has
        been through a Stage, an I2S buffer and however many scores came
        before - free memory is not the problem, one contiguous run of it
        is.
        """
        limit = config.MIDI_MAX_BYTES if limit is None else limit
        try:
            size = uos.stat(path)[6]
        except (AttributeError, OSError):
            # No stat, or no `uos` at all (desktop CPython running the
            # parser against a fixture). Fall back to the old read-and-
            # measure, which is correct and merely greedy.
            size = None
        if size is not None and size > limit:
            raise ValueError(
                "%s is %d bytes, over the %d of MIDI_MAX_BYTES - export"
                " fewer tracks or raise it in config.py" % (path, size, limit)
            )
        gc.collect()
        f = open(path, "rb")
        try:
            data = f.read(limit + 1 if size is None else size)
        finally:
            f.close()
        if len(data) > limit:
            raise ValueError(
                "%s is over %d bytes (MIDI_MAX_BYTES) - export fewer tracks"
                % (path, limit)
            )
        return Song(data)

    def events(self):
        """Every note and tempo change, in time order, as it is needed.

        A generator rather than a list because the list is the expensive
        thing here: a few thousand events, each a tuple, is most of the free
        heap on a Pico, and it would all be allocated up front so that the
        first note could be played. Merging the chunks lazily costs one scan
        of a list that is almost always shorter than four entries.
        """
        parts = self._parts
        data = self._data
        while True:
            # Which chunk holds the next event. Ties go to the lowest index,
            # which is the order the file itself put them in - the right
            # answer for a note-off and a note-on landing on the same tick.
            best = None
            for part in parts:
                if part[0] >= part[1]:
                    continue
                if best is None or part[2] < best[2]:
                    best = part
            if best is None:
                return

            pos = best[0]
            tick = best[2]
            status = data[pos]
            if status & 0x80:
                pos += 1
            else:
                # Running status: a channel event may omit its status byte
                # and inherit the last one. Every note-heavy file uses it,
                # and a parser that does not is off by one byte forever
                # after the first bar.
                status = best[3]
            kind = status & 0xF0

            out = None
            if status == 0xFF:
                meta = data[pos]
                pos += 1
                size, pos = _vlq(data, pos)
                if meta == 0x51 and size == 3:
                    out = (
                        tick,
                        TEMPO,
                        0,
                        0,
                        (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2],
                    )
                pos += size
                best[3] = 0
            elif status == 0xF0 or status == 0xF7:
                size, pos = _vlq(data, pos)
                pos += size
                best[3] = 0
            else:
                best[3] = status
                channel = status & 0x0F
                if kind == 0x90:
                    note = data[pos]
                    velocity = data[pos + 1]
                    pos += 2
                    # A note-on at velocity 0 *is* a note-off, and it is how
                    # most exporters write them - running status makes it a
                    # byte cheaper than the real thing.
                    out = (
                        tick,
                        NOTE_ON if velocity else NOTE_OFF,
                        channel,
                        note,
                        velocity,
                    )
                elif kind == 0x80:
                    out = (tick, NOTE_OFF, channel, data[pos], 0)
                    pos += 2
                elif kind == 0xC0 or kind == 0xD0:
                    pos += 1
                else:
                    # Aftertouch, control change, pitch bend: two bytes,
                    # stepped over.
                    pos += 2

            if pos >= best[1]:
                best[0] = best[1]
            else:
                delta, pos = _vlq(data, pos)
                best[0] = pos
                best[2] = tick + delta
            if out is not None:
                yield out


class Synth:
    """The oscillators, and which note each one is currently being.

    Fixed polyphony, allocated once. A note arriving with every voice busy
    steals the quietest one, which is the standard answer and the right one:
    the alternative - dropping it - loses the melody in favour of whatever
    pad happened to start first.
    """

    def __init__(self, rate, gain=256, voices=None):
        self._voices = config.MIDI_VOICES if voices is None else voices
        self._inc = increments(rate)
        self._state = array("i", [0] * (_HEADER + self._voices * _SLOTS))
        self._state[_VOICES] = self._voices
        # Any non-zero seed will do; a zero one is the LFSR's single dead
        # state and would make every drum in the piece silent.
        self._state[_LFSR] = 0xACE1

        # Per-voice bookkeeping the mixer never looks at.
        self._chan = [-1] * self._voices
        self._note = [-1] * self._voices
        self._amp = [0] * self._voices  # 8.8 fixed point; the mixer gets >> 8
        self._held = [False] * self._voices
        self._fall = [256] * self._voices  # per-chunk decay, over 256

        # Full-scale for one voice at full velocity. The mix is allowed to
        # reach the ceiling with MIDI_HEADROOM voices sounding and clips
        # above that - see config.py for why clipping is the cheap direction
        # to be wrong in when everything is a square wave.
        peak = 127 * gain // 256 // max(1, config.MIDI_HEADROOM)
        self._peak = peak if peak > 0 else 1

        duty = config.MIDI_DUTY
        if duty < 1:
            duty = 1
        elif duty > 7:
            duty = 7
        self._state[_DUTY] = (duty << _PHASE_BITS) >> 3

    def state(self):
        """The mixer's whole world: header, then one block per voice."""
        return self._state

    def active(self):
        for amp in self._amp:
            if amp:
                return True
        return False

    def _pick(self, chan, note):
        """A free voice, the one already playing this note, or the quietest."""
        quietest = 0
        lowest = -1
        for v in range(self._voices):
            if self._chan[v] == chan and self._note[v] == note:
                return v
            amp = self._amp[v]
            if amp == 0:
                return v
            if lowest < 0 or amp < lowest:
                lowest = amp
                quietest = v
        return quietest

    def note_on(self, chan, note, velocity):
        if note < 0 or note > 127:
            return
        drum = chan == 9
        if drum and not config.MIDI_DRUMS:
            return

        v = self._pick(chan, note)
        base = _HEADER + v * _SLOTS
        state = self._state
        if drum and note >= _DRUM_PITCHED_BELOW:
            state[base + _KIND] = _NOISE
            state[base + _INC] = 0
        else:
            state[base + _KIND] = _SQUARE
            state[base + _INC] = self._inc[note]
        # From zero every time: a voice restarted mid-cycle steps the output
        # by its own amplitude, and a class-D amp answers a step with a tick.
        state[base + _PHASE] = 0

        amp = ((self._peak * velocity) // 127) << 8
        if amp < 256:
            amp = 256
        self._amp[v] = amp
        state[base + _AMP] = amp >> 8
        self._chan[v] = chan
        self._note[v] = note
        # A drum is a one-shot: its note-off arrives a tick later in most
        # files and means nothing, so it is never held and starts fading at
        # once.
        self._held[v] = not drum
        self._fall[v] = config.MIDI_DRUM_RELEASE if drum else config.MIDI_DECAY

    def note_off(self, chan, note):
        for v in range(self._voices):
            if self._held[v] and self._chan[v] == chan and self._note[v] == note:
                self._held[v] = False
                self._fall[v] = config.MIDI_RELEASE

    def all_off(self):
        """Let go of everything still held, without cutting it dead.

        Used when the score runs out and when a press cuts the piece short:
        an ending is a release, and stopping the writes mid-note is the one
        thing that makes a square wave audible as a click.
        """
        for v in range(self._voices):
            if self._held[v]:
                self._held[v] = False
                self._fall[v] = config.MIDI_RELEASE

    def silence(self):
        for v in range(self._voices):
            self._amp[v] = 0
            self._note[v] = -1
            self._chan[v] = -1
            self._held[v] = False
            self._state[_HEADER + v * _SLOTS + _AMP] = 0

    def envelope(self):
        """One step of every voice's decay - once per output chunk.

        Per chunk and not per sample, which is the whole reason the mixer can
        be six lines: at 256 samples a step lands every 12 ms, far finer than
        any envelope you would write for a lantern, and the amplitude the
        mixer reads is simply constant for the length of a write.

        The arithmetic is deliberately multiplicative in 8.8 fixed point. A
        subtraction would make every note decay at the same *rate* rather
        than over the same *time*, so quiet notes would vanish instantly and
        loud ones would ring - and with peak amplitudes down around 7 at
        normal volumes, an integer subtraction has nowhere to land at all.
        """
        state = self._state
        amps = self._amp
        for v in range(self._voices):
            amp = amps[v]
            if amp == 0:
                continue
            amp = (amp * self._fall[v]) >> 8
            if amp < 256:
                # Below one whole unit of output there is nothing left to
                # hear, and holding the voice would keep it out of the
                # allocator for no reason.
                amp = 0
                self._note[v] = -1
                self._chan[v] = -1
                self._held[v] = False
            amps[v] = amp
            state[_HEADER + v * _SLOTS + _AMP] = amp >> 8


@micropython.viper
def _mix(out: ptr8, state: ptr32, first: int, frames: int):
    """Sum every voice into `frames` samples of `out`, starting at `first`.

    The only per-sample code in this firmware, hence viper. Everything it
    touches is a raw pointer into an `array('i')` or a `bytearray`, and every
    local is a machine int - viper has no other kinds.

    Only the odd bytes are written, twice per frame. That is the same
    contract `audio.py`'s streaming loop keeps: the even bytes are the low
    halves of 16-bit samples, they were zeroed at allocation, and an 8-bit
    source never has anything to put in them. Writing the value to both
    channels is what makes the output independent of which mode the amp's SD
    divider puts it in.

    The indices are literals rather than the `_VOICES` / `_DUTY` / `_LFSR` /
    `_HEADER` names used everywhere else, because a global read inside a
    viper function is not a constant fold - it is a dictionary lookup
    through the object layer, per sample, which is the one thing this
    function exists to avoid. Change the layout above and change these four
    numbers with it: 0, 1, 2 are the header fields in that order, 4 is where
    the first voice starts, and 0xFFFFFF is `_PHASE_MASK`.
    """
    voices = state[0]
    duty = state[1]
    lfsr = state[2]
    i = 0
    j = first * 4 + 1
    while i < frames:
        acc = 0
        base = 4
        v = 0
        while v < voices:
            amp = state[base + 2]
            if amp > 0:
                if state[base + 3] == 0:
                    phase = (state[base] + state[base + 1]) & 0xFFFFFF
                    state[base] = phase
                    if phase < duty:
                        acc = acc + amp
                    else:
                        acc = acc - amp
                else:
                    # Galois LFSR, 16-bit. `-(lfsr & 1)` is 0 or all-ones,
                    # so the tap word is applied only on an odd register -
                    # a branch-free way of saying "if the bit shifted out
                    # was set". Shared across voices, and advanced once per
                    # noise voice rather than once per sample, so two drums
                    # at the same instant are not the same drum twice.
                    lfsr = ((lfsr >> 1) ^ (0xB400 & -(lfsr & 1))) & 0xFFFF
                    if lfsr & 1:
                        acc = acc + amp
                    else:
                        acc = acc - amp
            base = base + 4
            v = v + 1
        if acc > 127:
            acc = 127
        elif acc < -127:
            acc = -127
        acc = acc & 0xFF
        out[j] = acc
        out[j + 2] = acc
        j = j + 4
        i = i + 1
    state[2] = lfsr


class Player:
    """One score, one synth, and the clock that puts them together.

    Everything here is in *samples*, because samples are the only unit the
    amplifier has: a tick is worth `samples_per_tick` of them, that number
    changes every time the score changes tempo, and it is virtually never a
    whole number. So it is carried as 16.16 fixed point and the remainder is
    kept - a 240 bpm passage at 22 kHz is 11.5 samples a tick, and rounding
    that down loses a beat every two hundred ticks, which is audible as the
    piece gradually falling apart.
    """

    def __init__(self, song, rate, chunk, gain=256, voices=None):
        self._song = song
        self._rate = rate
        self._chunk = chunk
        self._synth = Synth(rate, gain=gain, voices=voices)
        self._events = song.events()
        self._division = song.division
        self._tick = 0
        self._owed = 0  # samples until the pending event, 16.16
        self._rendered = 0
        self._limit = rate * config.MIDI_MAX_MS // 1000
        self._capped = False
        self._pending = None
        self._tempo(_TEMPO_DEFAULT)
        self._advance()

    def synth(self):
        return self._synth

    def rendered_ms(self):
        return self._rendered * 1000 // self._rate

    def _tempo(self, us_per_quarter):
        self._spt = (self._rate * us_per_quarter << 16) // (self._division * 1_000_000)

    def _advance(self):
        """Pull the next event and bank the silence in front of it."""
        try:
            # `next(gen, None)` would be shorter and is not portable: the
            # two-argument form is a build option MicroPython's rp2 port
            # leaves off, so on the board it is a TypeError at the end of
            # every piece.
            event = next(self._events)
        except StopIteration:
            event = None
        self._pending = event
        if event is None:
            self._synth.all_off()
            return
        self._owed += (event[0] - self._tick) * self._spt
        self._tick = event[0]

    def _dispatch(self, event):
        kind = event[1]
        if kind == NOTE_ON:
            self._synth.note_on(event[2], event[3], event[4])
        elif kind == NOTE_OFF:
            self._synth.note_off(event[2], event[3])
        else:
            self._tempo(event[4])

    def fill(self, buf):
        """One chunk into `buf`; 0 when the piece is over.

        This is the callback `Speaker.play_stream` drives, so it is also
        where the piece's shape meets the amplifier's: the loop below fills
        a whole chunk whatever the score is doing, whether that means one
        long rest, forty note-ons landing on the same tick, or both inside
        the same 12 ms.
        """
        synth = self._synth
        frames = 0
        chunk = self._chunk
        while frames < chunk:
            if self._pending is None:
                if not synth.active():
                    break
                # The tail: every note has been let go of and what is left
                # is the release. Rendered like anything else, because it is.
                _mix(buf, synth.state(), frames, chunk - frames)
                frames = chunk
                break

            due = self._owed >> 16
            if due <= 0:
                self._dispatch(self._pending)
                self._advance()
                continue

            want = chunk - frames
            if due < want:
                want = due
            _mix(buf, synth.state(), frames, want)
            self._owed -= want << 16
            frames += want

        if frames:
            synth.envelope()
            self._rendered += frames
            if self._pending is not None and self._rendered >= self._limit:
                # A .wav is limited by the flash it sits in. A 3 KB .mid can
                # be ten minutes long, and a lantern that disappears into one
                # for ten minutes has stopped being a lantern - so the score
                # is cut off here and released rather than played out.
                if not self._capped:
                    print("midi: over MIDI_MAX_MS, releasing")
                    self._capped = True
                self._pending = None
                synth.all_off()
        return frames


def play(speaker, path, on_chunk=None):
    """Synthesise one .mid into the amplifier. Blocks for its length.

    Mirrors `Speaker.play()` deliberately, down to returning False when the
    lantern is muted, because `audio_scenes.Track` hands both to the show
    without caring which it has.
    """
    if speaker is None:
        return False
    song = Song.from_file(path)
    player = Player(
        song,
        config.MIDI_RATE,
        speaker.chunk_samples(),
        gain=speaker.gain(),
    )
    try:
        return speaker.play_stream(config.MIDI_RATE, player.fill, on_chunk=on_chunk)
    finally:
        # A press that cut the piece short left voices holding amplitude,
        # and the next .mid would inherit them mid-decay.
        player.synth().silence()


def describe(path):
    """What the parser makes of a file, without playing a note of it.

    The question this answers is "is this file the problem", and it is worth
    a function because the alternative on a board with no screen is a
    silence that could equally well be the amp, the volume, or a file the
    exporter wrote in format 2.
    """
    song = Song.from_file(path)
    notes = 0
    lowest = 128
    highest = -1
    ticks = 0
    tempo = _TEMPO_DEFAULT
    channels = 0
    micros = 0
    for event in song.events():
        # Elapsed time is accumulated tempo section by tempo section rather
        # than worked out at the end from the last one. A piece that ends
        # with a rallentando would otherwise be reported at twice its
        # length, and the number is here to be compared against MIDI_MAX_MS.
        micros += (event[0] - ticks) * tempo // song.division
        ticks = event[0]
        if event[1] == NOTE_ON:
            notes += 1
            channels |= 1 << event[2]
            if event[3] < lowest:
                lowest = event[3]
            if event[3] > highest:
                highest = event[3]
        elif event[1] == TEMPO:
            tempo = event[4]
    print(path)
    print(
        "  format %d, %d chunk(s), %d ticks/quarter"
        % (song.format, len(song._parts), song.division)
    )
    print(
        "  %d notes, %d-%d, channels %s"
        % (
            notes,
            lowest if highest >= 0 else 0,
            highest if highest >= 0 else 0,
            ",".join(str(c + 1) for c in range(16) if channels & (1 << c)) or "-",
        )
    )
    print(
        "  last tempo %d bpm, ends at tick %d (%d.%01d s%s)"
        % (
            60_000_000 // tempo,
            ticks,
            micros // 1_000_000,
            micros // 100_000 % 10,
            ", over MIDI_MAX_MS" if micros // 1000 > config.MIDI_MAX_MS else "",
        )
    )


def bench(path, seconds=10, gain=256, voices=None):
    """How much faster than real time this board synthesises a file.

    The one question a laptop cannot answer about this module. Everything
    else here - what the parser makes of a file, what the mix sounds like -
    can be checked with `render_wav()` on a desktop, but whether an RP2040
    can produce 22,050 samples a second *while* running the flame depends on
    the board, the voice count and how dense the score is, and the failure
    mode is not an error: it is the I2S ring buffer running dry and the
    piece breaking up into clicks.

    So this renders into a scratch buffer with no amplifier attached and no
    flame running, and reports the ratio. Anything comfortably above 1.0 has
    room for the rest of the lantern; near or below it, the knobs are
    `MIDI_VOICES` first (the mixer is per voice per sample) and `MIDI_RATE`
    second (halving it halves everything, at the price of the buzzy folded
    harmonics 22 kHz was chosen to avoid).

        import midi
        midi.bench("/tracks/dirge.mid")
    """
    try:
        from time import ticks_diff, ticks_ms
    except ImportError:  # desktop CPython again
        from time import time as _clock

        def ticks_ms():
            return int(_clock() * 1000)

        def ticks_diff(a, b):
            return a - b

    rate = config.MIDI_RATE
    chunk = config.AUDIO_CHUNK_SAMPLES
    player = Player(Song.from_file(path), rate, chunk, gain=gain, voices=voices)
    buf = bytearray(chunk * _BYTES_PER_SAMPLE)
    limit = rate * seconds
    frames = 0
    start = ticks_ms()
    while frames < limit:
        got = player.fill(buf)
        if not got:
            break
        frames += got
    spent = ticks_diff(ticks_ms(), start)
    if spent <= 0:
        spent = 1
    audio_ms = frames * 1000 // rate
    print(
        "%s: %d ms of audio in %d ms - %d.%02dx real time"
        % (path, audio_ms, spent, audio_ms // spent, audio_ms * 100 // spent % 100)
    )
    return audio_ms * 100 // spent


def render_wav(path, out_path, rate=None, gain=256, voices=None):
    """Render a .mid to an 8-bit mono WAV. For a laptop, not for the board.

    The same parser, the same synth and the same mixing loop the lantern
    runs, writing to a file instead of to an amplifier - so what comes out
    of this is what will come out of the speaker, and it can be listened to,
    looked at in an editor, and diffed after a change to any of it.

    Rendered at full scale by default rather than at `config.AUDIO_VOLUME`,
    and it does not import `audio.py` to find out what that would be - that
    module opens with `from machine import Pin` and cannot be imported off
    the board at all. No loss: volume is a single multiplier over the whole
    mix, so the only thing it changes here is how much of the 8-bit range
    the preview uses, and using all of it is what you want when the question
    is what the synth did.

    On the board this is pointless and slow: the point of a .mid there is
    that it is *not* 800 KB of WAV.
    """
    rate = config.MIDI_RATE if rate is None else rate
    chunk = config.AUDIO_CHUNK_SAMPLES
    player = Player(Song.from_file(path), rate, chunk, gain=gain, voices=voices)

    buf = bytearray(chunk * _BYTES_PER_SAMPLE)
    body = bytearray()
    while True:
        frames = player.fill(buf)
        if not frames:
            break
        for i in range(frames):
            # Back the other way: the mixer wrote the high byte of a signed
            # 16-bit sample, and a WAV wants unsigned 8-bit.
            body.append((buf[i * _BYTES_PER_SAMPLE + 1] + 128) & 0xFF)

    f = open(out_path, "wb")
    try:
        f.write(b"RIFF")
        f.write((36 + len(body)).to_bytes(4, "little"))
        f.write(b"WAVEfmt ")
        f.write((16).to_bytes(4, "little"))
        f.write((1).to_bytes(2, "little"))  # PCM
        f.write((1).to_bytes(2, "little"))  # mono
        f.write(rate.to_bytes(4, "little"))
        f.write(rate.to_bytes(4, "little"))  # byte rate, 8-bit mono
        f.write((1).to_bytes(2, "little"))  # block align
        f.write((8).to_bytes(2, "little"))  # bits
        f.write(b"data")
        f.write(len(body).to_bytes(4, "little"))
        f.write(body)
    finally:
        f.close()
    return len(body)
