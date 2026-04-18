"""
Speaker diarization using pyannote.audio.

Returns a list of speaker segments: [{speaker, start, end}].
Optionally constrain the expected number of speakers for improved accuracy.
"""

import logging

from models import get_diarization_pipeline

logger = logging.getLogger(__name__)


def run_diarization(
    audio_path: str,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[dict]:
    """
    Run pyannote speaker diarization on an audio file.

    Args:
        audio_path:    Path to a local audio file (wav, mp3, etc.)
        num_speakers:  Exact number of speakers (overrides min/max when set)
        min_speakers:  Minimum number of speakers expected
        max_speakers:  Maximum number of speakers expected

    Returns:
        List of dicts with keys: speaker (str), start (float), end (float)
    """
    pipeline = get_diarization_pipeline()

    kwargs: dict = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = num_speakers
    else:
        if min_speakers is not None:
            kwargs["min_speakers"] = min_speakers
        if max_speakers is not None:
            kwargs["max_speakers"] = max_speakers

    logger.info("Running diarization on %s (kwargs=%s)", audio_path, kwargs)
    diarization = pipeline(audio_path, **kwargs)

    segments = [
        {
            "speaker": speaker,
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
        }
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]

    logger.info("Diarization complete: %d segments, %d speakers", len(segments), len({s["speaker"] for s in segments}))
    return segments
