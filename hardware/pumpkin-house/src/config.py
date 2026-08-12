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
