"""Pumpkin-house lantern - entry point.

MicroPython runs main.py automatically at boot, so copying this onto the
board is the whole deployment step.

The loop is deliberately mostly quiet: a long stretch of flame with nothing
happening, then one scene, then quiet again. A lantern that performs
constantly stops being atmospheric and starts being a novelty toy.

**It boots asleep.** Power on the pack and nothing lights: the first press of
the power button is what starts the show, the second toggles sound, the
third puts it back to sleep, and each press answers with a colour before it
does anything (white, green or red, purple). Meanwhile the scene button cuts
straight to the next scene in `scenes.SEQUENCE`, and pressing it again during
a scene skips on to the one after. Both buttons are read from `Stage.idle`,
so they work in the middle of an effect and not only between them - see
`buttons.py` for the cycle and why it is positional.

**There are two sound devices**, either or both fitted, set in `config.py`.
The buzzer is a fixed pitch whose *gating* carries the expression, and the
scenes in `scenes.py` drive their lighting off its events. The speaker is a
MAX98357A on I2S playing 8-bit WAV files off the board's own flash, and its
tracks (`audio_scenes.py`) leave the flame burning underneath instead. Both
kinds go into one show: `show()` interleaves whatever is actually fitted,
and the power button's sound leg silences both together.

Bench testing from the REPL, which will not auto-run the loop:

    import main
    stage = main.build()
    stage.controls.set_power(True)      # no button to press up here
    main.demo(stage)                    # every scene once, in order
    import scenes; scenes.crow(stage)   # just the one
    stage.buzzer.toggle_mute()          # what press 2 does
    stage.all_off()

    import audio_scenes                 # what the speaker found on flash
    audio_scenes.discover()
    stage.speaker.blip()                # is the amp wired up at all
    audio_scenes.play(stage, "/audio/thunder.wav")

Without that `set_power(True)`, a Stage built by hand is asleep - every
effect aborts against `Stage.interrupted()` the moment it starts and the
scenes appear to do nothing at all. `demo()` does it for you.
"""

import urandom
from time import sleep_ms, ticks_add, ticks_diff, ticks_ms

import audio
import audio_scenes
import buttons
import buzzer as fx
import config
import leds as light
import pads
import scenes

# How long the lantern simply burns between scenes.
AMBIENT_MIN_MS = 20_000
AMBIENT_MAX_MS = 60_000


def radio_off():
    """Drop the Pico W's radio, which this project never uses and which
    costs ~20 mA of the pack's ~93 mA budget. No-op on a non-W Pico."""
    try:
        import network
    except ImportError:
        return
    try:
        network.WLAN(network.STA_IF).active(False)
        network.WLAN(network.AP_IF).active(False)
    except (AttributeError, OSError):
        pass


def build_speaker():
    """The I2S amplifier, or None if there isn't one.

    Wrapped because a speaker is the one part of this build that can fail at
    *construction* rather than by being silent: a pin already claimed by
    something else, or an LRC that is not BCLK + 1, raises out of `I2S()`.
    Letting that propagate would take the whole lantern down over an
    accessory, so it prints and carries on with the buzzer.
    """
    if not config.SPEAKER_ENABLED:
        return None
    try:
        return audio.Speaker()
    except (OSError, ValueError) as err:
        print("speaker:", err)
        return None


def build():
    """Bring up the hardware and return a Stage wired to it."""
    # Must happen before any PWM is configured: pads reset to 4 mA drive and
    # the resistor values on the schematic assume 12 mA.
    pads.set_drive_many(pin for group in config.RGB_PINS for pin in group)

    lamps = [light.RgbLed(group) for group in config.RGB_PINS]
    flood = light.Flood(config.FLOOD_PIN)
    flame = light.Flame(lamps, flood)
    buzz = fx.Buzzer(config.BUZZER_PIN, enabled=config.BUZZER_ENABLED)
    speaker = build_speaker()
    # The lamps and the flood go to Controls as well as to the Stage: the
    # power button paints its own confirmation colour, and it has to be able
    # to do that while a scene owns the idle slot. The speaker goes there for
    # a blunter reason - the third press has to be able to stop a recording.
    controls = buttons.Controls(buzz, lamps, flood, speaker=speaker)
    return scenes.Stage(lamps, flood, flame, buzz, controls, speaker=speaker)


def show(stage):
    """What this particular lantern can play: (sequence, rotation).

    Assembled from what is actually fitted rather than from a fixed list,
    because the two sound devices are independent and either may be absent.
    Turning one off in `config.py` takes its scenes out of both lists rather
    than playing them silently - a buzzer scene is an envelope the lighting
    is driven from, so a muted one is a light show with a hole in it, not a
    quieter version of itself.

    Audio contributes **one** rotation entry standing for the whole folder,
    holding the Playlist's cursor, so a pick plays the next file rather than
    a random one. It contributes one *sequence* entry per file, though: the
    scene button is how you audition something you copied onto the board a
    minute ago, and it has to be able to reach that file specifically.
    """
    playlist = audio_scenes.Playlist(
        audio_scenes.discover() if stage.speaker is not None else ()
    )
    sequence = []
    rotation = []
    if stage.buzzer.is_enabled():
        sequence.extend(scenes.SEQUENCE)
        rotation.extend(scenes.ROTATION)
    if len(playlist):
        sequence.extend(playlist.tracks())
        rotation.append((playlist.play_next, config.AUDIO_WEIGHT))
    return tuple(sequence), tuple(rotation)


def _pool(rotation):
    """Flatten (scene, weight) pairs into a list to pick from uniformly."""
    out = []
    for scene, weight in rotation:
        for _ in range(weight):
            out.append(scene)
    return out


def ambient(stage, ms):
    """Just burn. The flame rate-limits itself, so this stays cheap.

    `stage.idle()` rather than `stage.flame.tick()` because it also serves
    the buttons, and returns early on a scene-button press so the press plays
    now instead of at the end of a stretch that can run a full minute.
    """
    end = ticks_add(ticks_ms(), ms)
    while ticks_diff(end, ticks_ms()) > 0:
        stage.idle()
        if stage.interrupted():
            return
        sleep_ms(5)


def demo(stage, gap_ms=1500, sequence=None):
    """Every scene once, in declaration order. For the bench, not the porch."""
    if stage.controls is not None:
        # Nobody presses the power button at a REPL, and asleep means every
        # effect aborts the instant it starts.
        stage.controls.set_power(True)
    if sequence is None:
        sequence, _ = show(stage)
    for scene in sequence:
        print("scene:", scene.__name__)
        scene(stage)
        ambient(stage, gap_ms)


def run(stage, rotation=None, sequence=None):
    if rotation is None or sequence is None:
        built_sequence, built_rotation = show(stage)
        sequence = built_sequence if sequence is None else sequence
        rotation = built_rotation if rotation is None else rotation
    pool = _pool(rotation)
    span = AMBIENT_MAX_MS - AMBIENT_MIN_MS
    index = 0
    if stage.powered():
        stage.flame.tick(force=True)
    while True:
        if not stage.powered():
            # Boot lands here, and so does the third press. `standby()`
            # blocks - polling the buttons and nothing else - until the power
            # button comes round to on again.
            stage.standby()
            continue
        ambient(stage, AMBIENT_MIN_MS + urandom.getrandbits(16) % span)
        # `ambient()` also returns early on a power-off, so the state has to
        # be rechecked before anything is allowed to play.
        if not stage.powered():
            continue
        pressed = stage.take_scene_request()
        if not pool and not sequence:
            # Both sound devices off, or the speaker is the only one fitted
            # and nothing has been copied onto the board yet. The flame is
            # still worth looking at, so this burns rather than crashing on
            # an empty pool.
            continue
        if pressed and sequence:
            # The button walks the whole show in order, one press per scene,
            # and is not weighted or shuffled - if you pressed it you want to
            # see the next thing, not another roll of the dice.
            scene = sequence[index % len(sequence)]
            index += 1
        elif pool:
            scene = pool[urandom.getrandbits(16) % len(pool)]
        else:
            continue
        scene(stage)


def main():
    radio_off()
    stage = build()
    sequence, rotation = show(stage)
    try:
        run(stage, rotation, sequence)
    finally:
        # Without this, Ctrl-C at the REPL leaves the buzzer screaming and
        # the LEDs stuck at whatever duty the last scene set.
        stage.all_off()
        if stage.speaker is not None:
            # `all_off` drops the amp's SD line, which is enough to silence
            # it. Releasing I2S as well matters at the REPL: it holds a PIO
            # state machine and a DMA channel, and re-running `build()`
            # without this eventually runs out of both.
            stage.speaker.deinit()


if __name__ == "__main__":
    main()
