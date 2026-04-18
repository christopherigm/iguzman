"""
Speaker-attributed transcription.

Runs pyannote diarization and faster-whisper transcription on the same audio
file, then merges the results by temporal overlap: each Whisper segment is
assigned to the pyannote speaker that covers the most of its duration.
"""

import logging

from models import get_diarization_pipeline, get_whisper_model

logger = logging.getLogger(__name__)


def run_transcription_with_diarization(
    audio_path: str,
    language: str | None = None,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> list[dict]:
    """
    Transcribe an audio file and attribute each segment to a speaker.

    Args:
        audio_path:    Path to a local audio file.
        language:      BCP-47 language code (e.g. "en", "es"). Auto-detected if None.
        num_speakers:  Exact number of speakers for pyannote.
        min_speakers:  Minimum number of speakers for pyannote.
        max_speakers:  Maximum number of speakers for pyannote.

    Returns:
        List of dicts: {speaker, start, end, text, language}
        `language` key only appears on the first segment (detected by Whisper).
    """
    whisper_segments, detected_language = _run_whisper(audio_path, language)
    diarization_segments = _run_diarization(audio_path, num_speakers, min_speakers, max_speakers)
    merged = _merge(whisper_segments, diarization_segments)

    # Attach detected language to the first segment so callers can inspect it
    if merged and detected_language:
        merged[0]["language"] = detected_language

    return merged


# ── Private helpers ───────────────────────────────────────────────────────────

def _run_whisper(audio_path: str, language: str | None) -> tuple[list[dict], str | None]:
    model = get_whisper_model()

    kwargs: dict = {"beam_size": 5}
    if language:
        kwargs["language"] = language

    logger.info("Transcribing %s with faster-whisper (language=%r)…", audio_path, language)
    segments_iter, info = model.transcribe(audio_path, **kwargs)

    segments = [
        {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
        for seg in segments_iter
        if seg.text.strip()
    ]
    logger.info(
        "Whisper done: %d segments, detected language='%s' (prob=%.2f)",
        len(segments),
        info.language,
        info.language_probability,
    )
    return segments, info.language


def _run_diarization(
    audio_path: str,
    num_speakers: int | None,
    min_speakers: int | None,
    max_speakers: int | None,
) -> list[dict]:
    pipeline = get_diarization_pipeline()

    kwargs: dict = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = num_speakers
    else:
        if min_speakers is not None:
            kwargs["min_speakers"] = min_speakers
        if max_speakers is not None:
            kwargs["max_speakers"] = max_speakers

    logger.info("Running diarization for transcription merge (kwargs=%s)…", kwargs)
    diarization = pipeline(audio_path, **kwargs)

    segments = [
        {"speaker": speaker, "start": turn.start, "end": turn.end}
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]
    logger.info("Diarization done: %d segments", len(segments))
    return segments


def _merge(whisper_segments: list[dict], diarization_segments: list[dict]) -> list[dict]:
    """
    Assign each Whisper segment to the speaker with the greatest temporal overlap.
    Falls back to 'UNKNOWN' when there is no overlap with any diarization segment.
    """
    result = []
    for ws in whisper_segments:
        best_speaker = "UNKNOWN"
        best_overlap = 0.0
        for ds in diarization_segments:
            overlap = max(0.0, min(ws["end"], ds["end"]) - max(ws["start"], ds["start"]))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = ds["speaker"]

        result.append({
            "speaker": best_speaker,
            "start": round(ws["start"], 3),
            "end": round(ws["end"], 3),
            "text": ws["text"],
        })

    return result
