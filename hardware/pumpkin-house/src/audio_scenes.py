"""Audio scenes: whole recordings, taking their turn in the same show.

`scenes.py` next door is the interesting file - light and sound on one
timeline, every flare driven by the buzzer event that caused it. This one is
deliberately dull, and the split is the point: a buzzer scene is *composed*
against a fixed pitch, an audio track is simply played, and folding the
second into the first would put a hundred lines of file plumbing in the
middle of the file that exists to hold the choreography.

So a track is a scene in the only sense the loop cares about - something you
hand a Stage, which blocks for a while and hands it back - and the flame
burns underneath it exactly as it does between scenes, because nothing here
takes the idle slot over. Syncing the lights to the audio is a separate job
and has a seam waiting for it: `Speaker.play(path, on_chunk=...)`.

**Tracks advance in order, not at random.** The rotation weight decides how
often the playlist gets a turn; which file plays is always the next one.
Half a dozen recordings shuffled would repeat one before it had played the
others, and unlike a cricket chirp - which is filler, and is meant to
recur - a recording is a thing somebody chose.
"""

import os

import config

_SUFFIX = ".wav"


def discover(directory=None):
    """Every .wav in the audio folder, in filename order.

    Ordering is what makes the folder the playlist editor: prefix a file
    with `10-`, `20-`, `30-` and that is the running order, with room to
    slot something between two of them later. An absent or empty folder is
    not an error - it is a lantern with the speaker fitted and nothing
    loaded onto it yet, which is exactly the state you are in the first time
    you wire one up.
    """
    directory = config.AUDIO_DIR if directory is None else directory
    try:
        names = os.listdir(directory)
    except OSError:
        return ()
    root = directory.rstrip("/")
    return tuple(
        root + "/" + name
        for name in sorted(names)
        if name.lower().endswith(_SUFFIX)
    )


def play(stage, path):
    """One file, then a beat of silence before the show carries on."""
    speaker = stage.speaker
    if speaker is None:
        return
    speaker.play(path)
    speaker.rest(config.AUDIO_GAP_MS)


class Track:
    """One file, wearing the interface a scene has.

    A class rather than a closure because MicroPython's function objects do
    not take attributes, and `main.demo()` prints `scene.__name__` - without
    this every track would announce itself under the same name, which is
    useless in exactly the situation you run `demo()` in.
    """

    def __init__(self, path):
        self.path = path
        self.__name__ = path.split("/")[-1]

    def __call__(self, stage):
        play(stage, self.path)


class Playlist:
    """The tracks, and which one is next.

    The cursor lives here rather than in `main` because the rotation holds a
    *reference* to `play_next` - one entry standing for the whole folder -
    and something has to remember where it got to between picks.
    """

    def __init__(self, tracks=()):
        self._tracks = tuple(Track(path) for path in tracks)
        self._index = 0

    def __len__(self):
        return len(self._tracks)

    def tracks(self):
        """Every track as its own scene, for the scene button.

        The button walks these one per press, the same way it walks the
        buzzer scenes - which is how you audition a file you have just
        copied onto the board without waiting for the rotation to reach it.
        """
        return self._tracks

    def play_next(self, stage):
        """The rotation's single entry for the whole folder."""
        if not self._tracks:
            return
        track = self._tracks[self._index % len(self._tracks)]
        self._index += 1
        track(stage)
