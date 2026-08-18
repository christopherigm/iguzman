"""Pumpkin-house lantern - entry point.

MicroPython runs main.py automatically at boot, so copying this onto the
board is the whole deployment step.

The loop is deliberately mostly quiet: a long stretch of flame with nothing
happening, then one scene, then quiet again. A lantern that performs
constantly stops being atmospheric and starts being a novelty toy.

**Whether it boots lit is `config.BOOT_POWERED`.** On, it starts burning the
moment the pack is plugged in; off, nothing lights until somebody presses.
Either way the power button walks the same three-position cycle - on, mute,
sleep - and each press answers with a colour before it does anything (white,
red, purple). Every leg is unconditional, so press 2 always silences and the
wake leg is what brings the sound back. Meanwhile the track button plays the
next file in `AUDIO_DIR`, and pressing it during one skips to the file after
it. Both buttons are read from `Stage.idle`, so they work in the middle of a
track and not only between them - see `buttons.py` for the cycle and why it
is positional.

**As set up now the lighting is only the candle.** The buzzer scenes in
`scenes.py` are all commented out of `SEQUENCE` and `ROTATION` rather than
removed, and `config.BUZZER_ENABLED` is False, so the flame in `leds.py`
owns the idle slot from boot to sleep and nothing ever takes it away.

**There are two sound devices**, either or both fitted, set in `config.py`.
The buzzer is a fixed pitch whose *gating* carries the expression, and the
scenes in `scenes.py` drive their lighting off its events. The speaker is a
MAX98357A on I2S, and it plays two kinds of file out of the same folder:
8-bit WAV recordings streamed off the board's own flash, and .mid scores
synthesised note by note as they play (`midi.py`) - a recording is forty
seconds of a 1.3 MB filesystem, a score is three kilobytes. Either way its
tracks (`audio_scenes.py`) leave the flame burning underneath instead of
driving it. All of it goes into one show: `show()` interleaves whatever is
actually fitted, and the power button's sound leg silences it together.

Bench testing from the REPL, which will not auto-run the loop:

    import main
    stage = main.build()
    stage.controls.set_power(True)      # no button to press up here
    main.demo(stage)                    # every scene once, in order
    import scenes; scenes.crow(stage)   # just the one
    stage.buzzer.mute(True)             # what press 2 does
    stage.all_off()

    import audio_scenes                 # what the speaker found on flash
    audio_scenes.discover()
    stage.speaker.blip()                # is the amp wired up at all
    audio_scenes.play(stage, "/tracks/thunder.wav")
    audio_scenes.play(stage, "/tracks/dirge.mid")

    import midi                         # and when a .mid is the suspect
    midi.describe("/tracks/dirge.mid")  # what the parser makes of it
    midi.bench("/tracks/dirge.mid")     # can this board keep up with it

With `BOOT_POWERED = False`, a Stage built by hand is asleep without that
`set_power(True)` - every effect aborts against `Stage.interrupted()` the
moment it starts and the scenes appear to do nothing at all. `demo()` does it
for you either way.
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

    Deliberately catching everything rather than the OSError/ValueError those
    two cases actually raise. The trade normally runs the other way, but not
    here: on the wrong side of it the failure mode is a dark porch and a power
    button that does nothing, and every remaining exception out of this call
    means the same thing anyway - there is no usable amplifier, carry on
    without one.

    """
    if not config.SPEAKER_ENABLED:
        return None
    if not hasattr(audio, "Speaker"):
        # `import audio` found something that is not `audio.py`, and on this
        # board there is only one thing it can be: a *directory* of that
        # name. MicroPython's import namespace is flat and a directory
        # outranks a file, so a folder of .wav files called `/audio` is
        # imported as a package, finds no `__init__.py`, and hands back an
        # empty module. Every symbol in `audio.py` vanishes.
        #
        # Worth its own branch rather than falling into the handler below,
        # because the generic message - "there is no usable amplifier, carry
        # on without one" - is true, useless, and indistinguishable from an
        # amp that was never soldered on. The lantern then burns in silence
        # with perfect wiring, which is a genuinely miserable thing to debug
        # from the outside.
        print("speaker: /audio is a DIRECTORY, so `import audio` got an empty")
        print("  package instead of audio.py. Rename it - AUDIO_DIR is now")
        print("  %s - and re-copy the .wav files." % config.AUDIO_DIR)
        return None
    try:
        return audio.Speaker()
    except Exception as err:  # noqa: BLE001
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

    Right now it can play exactly one thing: the tracks, one per press of the
    track button. The buzzer scenes are commented out of `scenes.SEQUENCE`
    and `scenes.ROTATION`, and the rotation entry that used to let the
    playlist start itself is commented out below - so the lantern burns the
    candle and stays quiet until somebody asks for a track.

    Audio contributes one *sequence* entry per file, which is what the track
    button walks: one press per file, in filename order, wrapping at the end.
    That is also how you audition something you copied onto the board a
    minute ago - the button can reach that file specifically.
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
        # Commented out, not deleted: this is the entry that let the ambient
        # loop start a track on its own, `config.AUDIO_WEIGHT` picks per
        # rotation. Tracks are now button-only - the lantern is a candle
        # that plays something when you ask it to, not one that talks to an
        # empty street every half minute. Uncomment to get the old show back.
        # rotation.append((playlist.play_next, config.AUDIO_WEIGHT))
    elif stage.speaker is not None:
        # The silent failure this build is most prone to, and the reason for
        # the only unconditional print in the firmware: the amp is fitted and
        # working, `AUDIO_DIR` is empty or was never created, and nothing
        # anywhere says so - the show simply has no audio in it and the
        # lantern burns exactly as it would with the speaker unplugged.
        # Copying the .py files without the .wav files is a normal way to
        # deploy, and a 900 KB file failing to fit is a normal way to get
        # half of one, so this is worth a line over USB.
        print("audio: speaker fitted but no .wav/.mid files in", config.AUDIO_DIR)
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
        try:
            scene(stage)
        except Exception as err:  # noqa: BLE001 - see below
            # One scene failing must not end the show, and before there was
            # anything here it did: an exception out of `scene()` unwinds
            # through `main()`'s finally, which turns the whole lantern off
            # and returns - so the lights go out, the power button stops
            # answering, and the board looks dead when it is merely at a REPL
            # prompt nobody is plugged into.
            #
            # The speaker made that a real risk rather than a theoretical
            # one. A buzzer scene is arithmetic on a GPIO and cannot fail; a
            # track is a file, and files are the wrong format, half-copied, or
            # gone. So the one part of the show that touches removable content
            # is the one part that must not be able to take the flame with it.
            print("scene failed:", getattr(scene, "__name__", scene), err)
            # A scene that died holding the idle slot left the flame paused
            # and the wash mid-flare. `release()` is what its own last line
            # would have done.
            stage.release()


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
