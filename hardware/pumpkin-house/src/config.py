"""Pin map and tunables for the pumpkin-house lantern.

Every value here matches the rev A build sheet, which lives in the help app
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
BUZZER_ENABLED = True
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
# Held high the amp runs in (L+R)/2 mode; pulled low it draws microamps and,
# more usefully, stops hissing between tracks. Set to None if you tied it
# high permanently and want the GPIO back.
AMP_ENABLE_PIN = 22  # pin 29, with a GND on pin 28 right beside it

# Where the .wav files live on the board's own flash. Root-level, because
# that is where `mpremote cp` puts things and a nested path is one more
# thing to get wrong at 11pm on the 30th of October.
AUDIO_DIR = "/audio"

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

# Attenuation in halvings: 0 is the file as encoded, 1 is -6 dB, 2 is
# -12 dB. Applied through a 256-entry table, so it costs nothing per sample.
# Reach for the amp's GAIN pad first if everything is too loud - this throws
# away bits, and 8-bit audio has only 48 dB to begin with.
AUDIO_ATTENUATION = 0

# Silence after a track, before the ambient stretch resumes.
AUDIO_GAP_MS = 900

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
