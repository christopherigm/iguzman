"""Pin map and tunables for the pumpkin-house lantern.

Every value here matches the rev C build sheet, which lives in the help app
under Hardware -> /hardware/pumpkin-house. If you rewire the board, change it
here and update that page in the same commit.
"""

# --- RGB groups ----------------------------------------------------------
# (red, green, blue) GPIO numbers, four common-cathode LEDs on GP0-GP11.
# Each pin lands on its own PWM slice+channel, so all twelve are
# independently dimmable. Reordering these will silently break that: two
# GPIOs sharing a slice AND channel are forced to the same duty cycle.
RGB_PINS = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (9, 10, 11),
)

FLOOD_PIN = 12  # Q1 base - white flood string off the raw pack rail
BUZZER_PIN = 16  # Q2 base - CYT1036 active buzzer

# --- What is actually fitted --------------------------------------------
# Two independent sound devices, either or both. Turning one off removes its
# scenes from the show rather than playing them silently: a buzzer scene is
# an *envelope* the lighting is driven from, so a muted one is not a quieter
# version of itself, it is a light show with a hole where the reason for its
# timing used to be. With both off the lantern just burns, which is a
# perfectly good thing for it to do.
BUZZER_ENABLED = False
SPEAKER_ENABLED = True

# --- Speaker: MAX98357A I2S amplifier ------------------------------------
# A class-D amp on the raw pack rail driving a 3 W 8 Ω cone. It replaces
# nothing - the buzzer stays - and it plays whole recordings rather than
# gated carrier, so the two are different instruments and not two settings
# of one.
#
# The RP2040's PIO-based I2S requires the word-select line to be **the pin
# immediately after the bit clock**, which is the entire reason these three
# are GP13/14/15: they were the three spare PWM channels, and they are the
# only consecutive trio left. Reassigning BCLK moves LRC with it.
I2S_ID = 0
I2S_BCLK_PIN = 13  # amp BCLK - pin 17
I2S_LRC_PIN = 14  # amp LRC/WS - pin 19, and it MUST be BCLK + 1
I2S_DIN_PIN = 15  # amp DIN - pin 20

# The amp's SD pin, which is a *shutdown* line and not the I2S data line
# above - an unhappy collision of abbreviations on a board that has both.
# Held high the amp plays the left channel (the (L+R)/2 band is 0.16-0.77 V,
# which needs a divider - `audio.py` writes both channels so it does not
# matter which); pulled low it draws microamps and,
# more usefully, stops hissing between tracks. Set to None if you tied it
# high permanently and want the GPIO back.
AMP_ENABLE_PIN = 22  # pin 29, with a GND on pin 28 right beside it

# Where the .wav files live on the board's own flash. Root-level, because
# that is where `mpremote cp` puts things and a nested path is one more
# thing to get wrong at 11pm on the 30th of October.
#
# **It must not be named after any module in this firmware, and `/audio` in
# particular is a trap.** MicroPython's import namespace is flat and a
# directory outranks a file: with a folder called `/audio` sitting beside
# `audio.py`, `import audio` returns an empty namespace package - the
# directory, imported as a package with no `__init__.py` in it - so
# `audio.Speaker` does not exist. `build_speaker()` catches the
# AttributeError, prints one line and carries on with no amplifier, which is
# exactly the right behaviour for a lantern with no amp soldered to it and
# completely wrong as a diagnosis. The whole show then comes up with an
# empty sequence and burns in silence forever, wired perfectly.
#
# `tracks` also happens to be the word the rest of the code already uses -
# `Track`, `Playlist.tracks()`, "tracks advance in order".
AUDIO_DIR = "/tracks"

# 8-bit unsigned mono PCM only, at whatever sample rate each file's own
# header declares - see the encoding recipe in the help app. 8-bit is the
# whole point: a plain Pico has ~1.3 MB of filesystem, and 16-bit halves
# what fits for a difference nobody hears through a 3 W cone inside a
# ceramic pot.

# Samples per I2S write. This is the resolution at which the flame gets
# ticked and the buttons get served during playback, so it is a latency
# knob, not a quality one: 256 samples is 23 ms at 11 kHz, comfortably
# inside the flame's own 33 ms. Raising it saves a little CPU and starts
# making the buttons feel sticky.
AUDIO_CHUNK_SAMPLES = 256

# The I2S driver's own buffer, in bytes. Four bytes leave here per input
# sample (16-bit, duplicated to both channels), so 8192 is ~185 ms of slack
# - enough that a 400 ms button confirmation is the only thing in the
# firmware that can starve it.
AUDIO_IBUF = 8192

# Silence after a track, before the ambient stretch resumes.
AUDIO_GAP_MS = 900

# --- Volume: the amplifier's GAIN strap ----------------------------------
# There is no volume setting in this firmware, and that is the design. Every
# sample the Pico writes leaves at full scale - recordings, MIDI and the
# confirmation blip alike - and how loud that turns out to be is decided by
# one resistor on the MAX98357A's GAIN pad.
#
# GAIN is a five-state strap and not an analogue input: the part decodes
# where the pad is tied, not what voltage sits on it.
#
#     100 kOhm to VIN    3 dB    <- what this build fits
#     straight to VIN    6 dB
#     floating           9 dB    the module's own default
#     straight to GND   12 dB
#     100 kOhm to GND   15 dB
#
# This board wires a 100 kOhm resistor from GAIN to VIN, which is the
# quietest of the five - 6 dB below a bare module - and is the whole volume
# control. The full table, with what each state measures into an 8 Ohm cone
# off a four-cell pack, is on the build sheet: Hardware ->
# /hardware/pumpkin-house, step 05.
#
# **Attenuating in software would be the worse tool even where it is free.**
# Scaling the samples lowers the music and leaves the amplifier running wide
# open, so its own hiss stays exactly where it was - which is most audible
# at precisely the settings you reach for when the lantern is too loud. The
# strap turns the amplifier down instead and takes the hiss with it. What it
# costs is a soldering iron to change, which for a decoration that lives in
# one porch is a price paid once.


# --- MIDI ----------------------------------------------------------------
# A .mid in AUDIO_DIR is played too, synthesised on the fly by `midi.py`
# rather than streamed off flash. It is the same folder and the same
# rotation, because from the show's point of view they are both "a file that
# makes a noise for a while" - the difference is that a .wav is forty
# seconds of the 1.3 MB filesystem and a .mid of the same music is three
# kilobytes.
#
# What comes out is a square-wave chiptune. None of the values below change
# that; they change its character. If you want the arrangement your DAW
# played, render it there and copy over a .wav.

# Sample rate for everything synthesised. Unlike the .wav files, which each
# declare their own, this is chosen rather than found - nothing here is a
# recording of anything.
#
# 22050 rather than the 11 kHz the recordings use because square waves are
# nearly all harmonics: a note at 11 kHz folds everything above 5.5 kHz back
# down the spectrum as a metallic buzz that follows the melody around. It
# costs nothing to fix here - the synth is not reading from flash, so the
# rate is a multiply in the mixing loop and not a doubling of any file.
MIDI_RATE = 22050

# How many notes can sound at once. Extra voices are cheap (the mixing loop
# is compiled) but not free, and six is already more than a lantern's worth
# of counterpoint. A seventh note steals the quietest voice.
MIDI_VOICES = 6

# How many voices at full velocity reach full scale together. Everything
# above this clips.
#
# Deliberately smaller than MIDI_VOICES, which sounds backwards. Dividing
# the ceiling six ways would make a two-note passage - which is most of any
# piece - a good 10 dB quieter than the .wav next to it in the folder, and
# with loudness now set once in hardware there is nothing to make that up
# with. Clipping is the cheap direction to be wrong in here: every
# voice is a square wave, already flat-topped, so a clipped sum is flatter
# rather than crackly. Lower this if a dense passage sounds hard.
MIDI_HEADROOM = 3

# Pulse width in eighths: 4 is a square (a hollow, clarinet-ish tone), 1 and
# 7 are the same narrow pulse (reedy, nasal, louder in the harmonics), 2 or
# 6 sits between. This is the one knob that changes the *timbre* rather than
# the envelope, and it is the difference between "organ" and "harpsichord"
# for free.
MIDI_DUTY = 4

# Envelope, as a multiplier over 256 applied once per output chunk - which
# at MIDI_RATE and AUDIO_CHUNK_SAMPLES is every 12 ms, so about 86 times a
# second.
#
#   MIDI_DECAY   while the key is held.  256 is a true organ: no decay at
#                all, and exactly constant because 256/256 is 1. 255 halves
#                a note about every 2 s, which reads as a plucked string
#                that is still ringing. 250 is a music box.
#   MIDI_RELEASE after the key is let go. 180 falls silent in ~40 ms, which
#                is short enough to be an ending and long enough not to
#                click.
MIDI_DECAY = 255
MIDI_RELEASE = 180

# GM percussion (channel 10) as noise bursts and low thuds instead of
# nonsense pitches. Off, the channel is skipped entirely - which is the
# right setting for a piece whose drum track was written for a kit and
# sounds like a rattle without one.
MIDI_DRUMS = True

# How fast a drum falls silent, same units as MIDI_RELEASE. Drums ignore
# their note-offs - a hit is a one-shot - so this is the only thing that
# decides whether the kit reads as a hat or as a wash.
MIDI_DRUM_RELEASE = 200

# The whole file is read into RAM, so this is partly a memory guard - but
# mostly it is a taste guard. A score this size is a full arrangement, and
# six square waves picking six arbitrary parts out of one is a worse result
# than the file simply being refused with a line explaining why.
#
# Raised from 24576 once the folder filled up with real exports: six of the
# ten files on this board were over the old limit, so six presses in ten of
# the track button did nothing but print a line over USB, which reads as a
# broken button rather than as a judgement about arrangements. Measured on
# the board rather than guessed - `gc.mem_free()` is 229 KB at rest, and the
# largest file here (Breaking_The_Habit.mid, 69 KB) parses into 70 KB and
# leaves 159 KB, which is room for the I2S buffer and the mixer several
# times over. 96 KB keeps a similar margin at the new ceiling.
#
# The taste half of the guard is now `MIDI_MAX_MS` on its own: a long file
# is released rather than refused, which is the better trade for a score
# that is only expensive while it is playing.
MIDI_MAX_BYTES = 98304

# The one way a .mid differs from a .wav that matters to the show: three
# kilobytes can be ten minutes long. A lantern that vanishes into one for
# ten minutes has stopped being a lantern, so the score is released - not
# cut - at this point.
#
# Raised from 90 s to seven minutes so the files on this board play to their
# endings. Measured with `midi.describe()`, longest first: Unforgiven 368 s,
# Total Eclipse 309, Jurassic Park 291, Ghostbusters 244, Armageddon 243,
# Breaking The Habit 192, Numb 185, Addams Family 44, dirge 16. Seven
# minutes clears the longest of them with half a minute to spare.
#
# It is a weaker guard than it was and that is the right trade now that
# tracks are button-only: nothing starts a seven-minute score by itself any
# more, somebody asked for it, and the track button cuts it short the moment
# they change their mind. What this still catches is the runaway - an export
# with a stray tempo event or a tail of empty bars that would otherwise hold
# the lantern for as long as its ticks say to.
MIDI_MAX_MS = 420_000


# How heavily audio is weighted against the buzzer scenes in the random
# rotation. Each pick plays the *next* track rather than a random one, so
# with several files loaded this is how often you hear the playlist advance,
# not how often you hear one particular recording.
AUDIO_WEIGHT = 4

# The MAX98357A needs a moment after SD goes high before its output is
# valid, and a moment of silence before SD drops or it clicks. Both are
# small enough to be inaudible and large enough to matter.
AMP_WAKE_MS = 6
AMP_TAIL_MS = 12

# --- Buttons -------------------------------------------------------------
# Two momentary switches, each shorting its pin to GND. They run on the
# RP2040's internal pull-ups, so they are active-low and need no external
# resistors at all.
#
# GP17 and GP18 are physical pins 22 and 24, with a GND on pin 23 sitting
# directly between them - one ground jumper serves both buttons - and they
# leave GP13/GP14/GP15 free as the three spare PWM channels.
POWER_PIN = 17  # three-press cycle: on -> sound -> off; see buttons.py
SCENE_PIN = 18  # cut to the next scene in scenes.SEQUENCE

# Contact bounce on a 6 mm tactile switch settles well inside this. Pushing
# it much past 250 ms would start swallowing deliberate double presses.
BUTTON_DEBOUNCE_MS = 40

# --- Power-up state ------------------------------------------------------
# What the lantern does when the pack is plugged in, before anybody touches
# a button.
#
# False is the frugal setting and was the original one: a decoration you have
# to switch on is a decoration that cannot run its pack down in a cupboard.
# True is for a lantern living on a switched socket or a timer, where the
# mains is the switch and there is nobody on the porch to press anything - and
# it is also what you want on the bench, where "did it boot?" and "is the
# button wired right?" are two questions worth being able to ask separately.
#
# It does not reorder the power button's cycle. Press 1 is the wake leg
# either way, which on a lantern that booted lit is a white flash confirming
# what you can already see - so no single idle press can silence it. See
# buttons.py.
BOOT_POWERED = True

# --- Power-button feedback ----------------------------------------------
# Each press of the power button answers with the flood at full and one flat
# colour across every RGB group, so the button is readable in the dark from
# across a porch: white = the lantern just woke, green/red = sound just went
# audible/silent, purple = it is going to sleep.
#
# These are drive levels, not matched output. Red has the most headroom off
# 3.3 V and reads brightest (see CHANNEL_TRIM), so equal thirds come out
# warm. If the white confirmation looks pink, pull the red term *here* down
# toward 150 - do not touch CHANNEL_TRIM, which the flame's ember colours
# are tuned against.
POWER_ON_RGB = (255, 255, 255)  # white - system on
SOUND_ON_RGB = (0, 255, 0)  # green - sound now audible
SOUND_OFF_RGB = (255, 0, 0)  # red - sound now silent
POWER_OFF_RGB = (150, 0, 255)  # purple - system going off
CONFIRM_FLOOD = 255  # "flood 100%" - full white string behind the colour

# Long enough to register as deliberate, short enough that it does not stall
# the show. The off confirmation is the exception: it is the last thing the
# lantern does before going dark, so it gets to linger.
CONFIRM_MS = 400
POWER_OFF_CONFIRM_MS = 2000

# Above flicker fusion, below the point where transistor switching losses
# start to matter. 1 kHz also keeps the flood's Q1 comfortably in saturation.
PWM_FREQ = 1000

# --- Channel trim --------------------------------------------------------
# Ceilings per channel, applied after gamma. Red sits at V_f 2.0 V with
# plenty of headroom off 3.3 V and runs at ~8.7 mA; green and blue have
# ~0.4 V to work with and manage maybe 6 mA, so red reads brightest.
#
# Leave these at 1.0 for ember and amber work, where you want red dominant.
# If you ever want a neutral white out of the RGB group, pull red down
# toward 0.6 rather than pushing green and blue up - they have nothing left
# to give.
CHANNEL_TRIM = (1.0, 1.0, 1.0)

# Perceived brightness is roughly the 2.2 power of drive. Without this
# correction the bottom of every fade happens in the first few percent of
# the range and the flicker looks like a square wave.
GAMMA = 2.2

# --- Flame ---------------------------------------------------------------
FLAME_TICK_MS = 33  # ~30 Hz update; faster reads as noise, slower as steps
FLAME_MIN = 90  # never fully dark, or it reads as a fault rather than a flame
FLAME_MAX = 255
FLAME_STEP = 7  # how far a lamp moves toward its target per tick
FLAME_GUST_CHANCE = 12  # 1-in-N ticks a lamp takes a deep dip instead

# Flood level as a fraction of mean flame level, in eighths. The white
# string is the base glow; the RGB group is the colour on top of it.
FLOOD_RATIO = 5
